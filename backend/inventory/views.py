import csv
import io
import uuid
from datetime import datetime, date
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum, F, Q, Count
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, action
from rest_framework.response import Response

from .models import (
    Supplier,
    Warehouse,
    Component,
    Product,
    ProductComponent,
    WarehouseStock,
    StockMovement,
    PurchaseOrder,
    PurchaseOrderItem,
    DemandObservation,
    ForecastRun,
)
from .serializers import (
    SupplierSerializer,
    WarehouseSerializer,
    ComponentSerializer,
    ProductSerializer,
    WarehouseStockSerializer,
    StockMovementSerializer,
    StockInSerializer,
    StockOutSerializer,
    StockAdjustmentSerializer,
    WarehouseTransferSerializer,
    PurchaseOrderSerializer,
    DemandObservationSerializer,
)
from .database_connections import check_cassandra, check_neo4j
from .cassandra_client import log_movement_to_cassandra, get_cassandra_movements_by_product
from .neo4j_client import (
    ensure_neo4j_constraints,
    sync_entity_to_neo4j,
    sync_relationship_to_neo4j,
    get_entire_graph_data,
    analyze_graph_risks,
)
from .forecasting import (
    parse_and_import_demand_csv,
    generate_demand_forecast,
    compute_reorder_recommendations,
)


# -------------------------------------------------------------
# 1. Health Endpoints
# -------------------------------------------------------------

@api_view(["GET"])
def health_check(request):
    return Response({
        "status": "ok",
        "service": "Intelligent Inventory & Supply Chain Management System",
        "timestamp": datetime.now().isoformat(),
    })


@api_view(["GET"])
def database_health(request):
    results = {
        "cassandra": check_cassandra(),
        "neo4j": check_neo4j(),
    }
    all_connected = all(r["status"] == "connected" for r in results.values())
    return Response({
        "status": "ok" if all_connected else "degraded",
        "databases": results,
    })


# -------------------------------------------------------------
# 2. Product Management ViewSet
# -------------------------------------------------------------

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all().select_related("preferred_supplier", "primary_warehouse").prefetch_related("warehouse_stocks", "bom_items")
    serializer_class = ProductSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        category = self.request.query_params.get("category")
        status_filter = self.request.query_params.get("status")
        supplier_id = self.request.query_params.get("supplier_id")
        active_only = self.request.query_params.get("active_only")

        if active_only in ["true", "1"]:
            qs = qs.filter(is_active=True)
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(sku__icontains=search) | Q(product_id__icontains=search))
        if category:
            qs = qs.filter(category__iexact=category)
        if supplier_id:
            qs = qs.filter(preferred_supplier__supplier_id=supplier_id)
        if status_filter == "OUT_OF_STOCK":
            qs = qs.filter(current_stock__lte=0)
        elif status_filter == "LOW_STOCK":
            qs = qs.filter(current_stock__gt=0, current_stock__lte=F("min_stock_threshold"))
        elif status_filter == "OPTIMAL":
            qs = qs.filter(current_stock__gt=F("min_stock_threshold"))

        return qs

    def perform_create(self, serializer):
        product = serializer.save()
        # Initialize primary warehouse stock record if primary_warehouse is selected
        if product.primary_warehouse and product.current_stock > 0:
            WarehouseStock.objects.get_or_create(
                product=product,
                warehouse=product.primary_warehouse,
                defaults={"quantity": product.current_stock, "min_threshold": product.min_stock_threshold},
            )
        # Sync to Neo4j
        try:
            sync_entity_to_neo4j("Product", {
                "id": product.product_id,
                "name": product.name,
                "sku": product.sku,
                "category": product.category,
                "current_stock": product.current_stock,
                "min_threshold": product.min_stock_threshold,
            })
            if product.preferred_supplier:
                sync_relationship_to_neo4j("Supplier", product.preferred_supplier.supplier_id,
                                           "Product", product.product_id,
                                           "SUPPLIES", {"lead_time": product.lead_time_days})
            if product.primary_warehouse:
                sync_relationship_to_neo4j("Product", product.product_id,
                                           "Warehouse", product.primary_warehouse.warehouse_id,
                                           "STORED_AT", {"quantity": product.current_stock})
        except Exception:
            pass

    def perform_update(self, serializer):
        product = serializer.save()
        try:
            sync_entity_to_neo4j("Product", {
                "id": product.product_id,
                "name": product.name,
                "sku": product.sku,
                "category": product.category,
                "current_stock": product.current_stock,
                "min_threshold": product.min_stock_threshold,
            })
        except Exception:
            pass


# -------------------------------------------------------------
# 3. Supplier ViewSet
# -------------------------------------------------------------

class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all().prefetch_related("supplied_products")
    serializer_class = SupplierSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(supplier_id__icontains=search) | Q(contact_person__icontains=search))
        return qs

    def perform_create(self, serializer):
        supplier = serializer.save()
        try:
            sync_entity_to_neo4j("Supplier", {
                "id": supplier.supplier_id,
                "name": supplier.name,
                "lead_time": supplier.average_lead_time_days,
                "reliability": supplier.reliability_score,
            })
        except Exception:
            pass


# -------------------------------------------------------------
# 4. Warehouse ViewSet
# -------------------------------------------------------------

class WarehouseViewSet(viewsets.ModelViewSet):
    queryset = Warehouse.objects.all().prefetch_related("stocks")
    serializer_class = WarehouseSerializer

    def perform_create(self, serializer):
        wh = serializer.save()
        try:
            sync_entity_to_neo4j("Warehouse", {
                "id": wh.warehouse_id,
                "name": wh.name,
                "code": wh.code,
                "capacity": wh.capacity,
            })
        except Exception:
            pass


# -------------------------------------------------------------
# 5. Inventory & Stock Operations
# -------------------------------------------------------------

@api_view(["GET"])
def list_warehouse_stock(request):
    stocks = WarehouseStock.objects.select_related("product", "warehouse").all()
    warehouse_id = request.query_params.get("warehouse_id")
    product_id = request.query_params.get("product_id")
    if warehouse_id:
        stocks = stocks.filter(warehouse__warehouse_id=warehouse_id)
    if product_id:
        stocks = stocks.filter(product__product_id=product_id)
    serializer = WarehouseStockSerializer(stocks, many=True)
    return Response(serializer.data)


@api_view(["GET"])
def list_stock_movements(request):
    movements = StockMovement.objects.select_related(
        "product", "warehouse", "source_warehouse", "destination_warehouse"
    ).all()

    product_id = request.query_params.get("product_id")
    warehouse_id = request.query_params.get("warehouse_id")
    movement_type = request.query_params.get("movement_type")
    start_date = request.query_params.get("start_date")
    end_date = request.query_params.get("end_date")

    if product_id:
        movements = movements.filter(product__product_id=product_id)
    if warehouse_id:
        movements = movements.filter(warehouse__warehouse_id=warehouse_id)
    if movement_type:
        movements = movements.filter(movement_type=movement_type)
    if start_date:
        movements = movements.filter(created_at__date__gte=start_date)
    if end_date:
        movements = movements.filter(created_at__date__lte=end_date)

    # Optional: fetch from Cassandra to cross-check time-series audit trail
    use_cassandra = request.query_params.get("cassandra") in ["true", "1"]
    cassandra_records = []
    if use_cassandra and product_id:
        query_date = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else date.today()
        cassandra_records = get_cassandra_movements_by_product(product_id, query_date)

    serializer = StockMovementSerializer(movements[:100], many=True)
    return Response({
        "count": movements.count(),
        "movements": serializer.data,
        "cassandra_records": cassandra_records,
    })


@api_view(["POST"])
def stock_in(request):
    """
    Receives stock into a warehouse.
    Increases WarehouseStock and Product.current_stock.
    Creates audit record in SQLite and mirrors to Cassandra and Neo4j.
    """
    serializer = StockInSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    p_id = serializer.validated_data["product_id"]
    w_id = serializer.validated_data["warehouse_id"]
    qty = serializer.validated_data["quantity"]
    ref = serializer.validated_data.get("reference_id", "")
    reason = serializer.validated_data.get("reason", "Stock In")

    try:
        product = Product.objects.get(product_id=p_id)
        warehouse = Warehouse.objects.get(warehouse_id=w_id)
    except (Product.DoesNotExist, Warehouse.DoesNotExist) as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        wh_stock, _ = WarehouseStock.objects.select_for_update().get_or_create(
            product=product,
            warehouse=warehouse,
            defaults={"quantity": 0, "min_threshold": product.min_stock_threshold},
        )
        wh_stock.quantity += qty
        wh_stock.save()

        product.current_stock += qty
        product.save()

        m_id = f"MOV-IN-{uuid.uuid4().hex[:10].upper()}"
        movement = StockMovement.objects.create(
            movement_id=m_id,
            product=product,
            warehouse=warehouse,
            movement_type="IN",
            quantity=qty,
            reference_id=ref,
            reason=reason,
        )

    # Dual-write to Cassandra time-series log
    now = datetime.now()
    log_movement_to_cassandra(product.product_id, now.date(), now, "IN", qty, ref, warehouse.warehouse_id)

    # Sync to Neo4j graph
    try:
        sync_relationship_to_neo4j("Product", product.product_id, "Warehouse", warehouse.warehouse_id,
                                   "STORED_AT", {"quantity": wh_stock.quantity})
    except Exception:
        pass

    return Response({
        "status": "success",
        "movement_id": movement.movement_id,
        "product_id": product.product_id,
        "warehouse_id": warehouse.warehouse_id,
        "added_quantity": qty,
        "warehouse_stock": wh_stock.quantity,
        "total_stock": product.current_stock,
    }, status=status.HTTP_201_CREATED)


@api_view(["POST"])
def stock_out(request):
    """
    Dispatches stock from a warehouse.
    Rejects if requested quantity exceeds available stock (negative stock prevention).
    Deducts WarehouseStock and Product.current_stock.
    Creates audit record in SQLite and mirrors to Cassandra.
    """
    serializer = StockOutSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    p_id = serializer.validated_data["product_id"]
    w_id = serializer.validated_data["warehouse_id"]
    qty = serializer.validated_data["quantity"]
    ref = serializer.validated_data.get("reference_id", "")
    reason = serializer.validated_data.get("reason", "Stock Out")

    try:
        product = Product.objects.get(product_id=p_id)
        warehouse = Warehouse.objects.get(warehouse_id=w_id)
    except (Product.DoesNotExist, Warehouse.DoesNotExist) as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        wh_stock, _ = WarehouseStock.objects.select_for_update().get_or_create(
            product=product,
            warehouse=warehouse,
            defaults={"quantity": 0, "min_threshold": product.min_stock_threshold},
        )

        if wh_stock.quantity < qty:
            return Response({
                "error": f"Insufficient stock at warehouse {warehouse.name}. Available: {wh_stock.quantity}, Requested: {qty}",
                "available": wh_stock.quantity,
                "requested": qty,
            }, status=status.HTTP_400_BAD_REQUEST)

        wh_stock.quantity -= qty
        wh_stock.save()

        product.current_stock = max(0, product.current_stock - qty)
        product.save()

        m_id = f"MOV-OUT-{uuid.uuid4().hex[:10].upper()}"
        movement = StockMovement.objects.create(
            movement_id=m_id,
            product=product,
            warehouse=warehouse,
            movement_type="OUT",
            quantity=qty,
            reference_id=ref,
            reason=reason,
        )

    # Dual-write to Cassandra
    now = datetime.now()
    log_movement_to_cassandra(product.product_id, now.date(), now, "OUT", qty, ref, warehouse.warehouse_id)

    # Sync to Neo4j
    try:
        sync_relationship_to_neo4j("Product", product.product_id, "Warehouse", warehouse.warehouse_id,
                                   "STORED_AT", {"quantity": wh_stock.quantity})
    except Exception:
        pass

    return Response({
        "status": "success",
        "movement_id": movement.movement_id,
        "product_id": product.product_id,
        "warehouse_id": warehouse.warehouse_id,
        "dispatched_quantity": qty,
        "remaining_warehouse_stock": wh_stock.quantity,
        "total_stock": product.current_stock,
    }, status=status.HTTP_200_OK)


@api_view(["POST"])
def stock_adjustment(request):
    """
    Adjusts inventory count for reconciliation.
    Records difference and synchronizes both databases.
    """
    serializer = StockAdjustmentSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    p_id = serializer.validated_data["product_id"]
    w_id = serializer.validated_data["warehouse_id"]
    new_qty = serializer.validated_data["new_quantity"]
    ref = serializer.validated_data.get("reference_id", "")
    reason = serializer.validated_data["reason"]

    try:
        product = Product.objects.get(product_id=p_id)
        warehouse = Warehouse.objects.get(warehouse_id=w_id)
    except (Product.DoesNotExist, Warehouse.DoesNotExist) as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        wh_stock, _ = WarehouseStock.objects.select_for_update().get_or_create(
            product=product,
            warehouse=warehouse,
            defaults={"quantity": 0, "min_threshold": product.min_stock_threshold},
        )
        old_qty = wh_stock.quantity
        diff = new_qty - old_qty

        wh_stock.quantity = new_qty
        wh_stock.save()

        product.current_stock += diff
        product.save()

        m_id = f"MOV-ADJ-{uuid.uuid4().hex[:10].upper()}"
        movement = StockMovement.objects.create(
            movement_id=m_id,
            product=product,
            warehouse=warehouse,
            movement_type="ADJUSTMENT",
            quantity=diff,
            reference_id=ref,
            reason=f"Adjustment: {old_qty} -> {new_qty}. {reason}",
        )

    # Dual-write to Cassandra
    now = datetime.now()
    log_movement_to_cassandra(product.product_id, now.date(), now, "ADJUSTMENT", diff, ref, warehouse.warehouse_id)

    # Update Neo4j
    try:
        sync_relationship_to_neo4j("Product", product.product_id, "Warehouse", warehouse.warehouse_id,
                                   "STORED_AT", {"quantity": wh_stock.quantity})
    except Exception:
        pass

    return Response({
        "status": "success",
        "movement_id": movement.movement_id,
        "old_quantity": old_qty,
        "new_quantity": new_qty,
        "difference": diff,
        "total_stock": product.current_stock,
    }, status=status.HTTP_200_OK)


@api_view(["POST"])
def stock_transfer(request):
    """
    Transfers inventory between two warehouses.
    Deducts source, credits destination. Total product stock remains constant.
    """
    serializer = WarehouseTransferSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    p_id = serializer.validated_data["product_id"]
    src_id = serializer.validated_data["source_warehouse_id"]
    dst_id = serializer.validated_data["destination_warehouse_id"]
    qty = serializer.validated_data["quantity"]
    ref = serializer.validated_data.get("reference_id", "")
    reason = serializer.validated_data.get("reason", "Inter-warehouse transfer")

    if src_id == dst_id:
        return Response({"error": "Source and destination warehouses cannot be the same."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        product = Product.objects.get(product_id=p_id)
        src_wh = Warehouse.objects.get(warehouse_id=src_id)
        dst_wh = Warehouse.objects.get(warehouse_id=dst_id)
    except (Product.DoesNotExist, Warehouse.DoesNotExist) as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        src_stock, _ = WarehouseStock.objects.select_for_update().get_or_create(
            product=product, warehouse=src_wh, defaults={"quantity": 0}
        )
        dst_stock, _ = WarehouseStock.objects.select_for_update().get_or_create(
            product=product, warehouse=dst_wh, defaults={"quantity": 0}
        )

        if src_stock.quantity < qty:
            return Response({
                "error": f"Insufficient stock at source warehouse {src_wh.name}. Available: {src_stock.quantity}, Requested: {qty}",
                "available": src_stock.quantity,
                "requested": qty,
            }, status=status.HTTP_400_BAD_REQUEST)

        src_stock.quantity -= qty
        src_stock.save()

        dst_stock.quantity += qty
        dst_stock.save()

        m_id = f"MOV-XFER-{uuid.uuid4().hex[:10].upper()}"
        movement = StockMovement.objects.create(
            movement_id=m_id,
            product=product,
            warehouse=src_wh,
            movement_type="TRANSFER",
            quantity=qty,
            reference_id=ref,
            reason=reason,
            source_warehouse=src_wh,
            destination_warehouse=dst_wh,
        )

    # Dual-write to Cassandra
    now = datetime.now()
    log_movement_to_cassandra(product.product_id, now.date(), now, "TRANSFER", qty, ref, f"{src_id}->{dst_id}")

    # Sync to Neo4j
    try:
        sync_relationship_to_neo4j("Product", product.product_id, "Warehouse", src_wh.warehouse_id, "STORED_AT", {"quantity": src_stock.quantity})
        sync_relationship_to_neo4j("Product", product.product_id, "Warehouse", dst_wh.warehouse_id, "STORED_AT", {"quantity": dst_stock.quantity})
        sync_relationship_to_neo4j("Warehouse", src_wh.warehouse_id, "Warehouse", dst_wh.warehouse_id, "CONNECTED_TO", {"transit_days": 2})
    except Exception:
        pass

    return Response({
        "status": "success",
        "movement_id": movement.movement_id,
        "transferred_quantity": qty,
        "source_warehouse_stock": src_stock.quantity,
        "destination_warehouse_stock": dst_stock.quantity,
    }, status=status.HTTP_200_OK)


# -------------------------------------------------------------
# 6. Purchase Orders
# -------------------------------------------------------------

class PurchaseOrderViewSet(viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.all().select_related("supplier", "destination_warehouse").prefetch_related("items__product")
    serializer_class = PurchaseOrderSerializer

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        """
        Receives items from a Purchase Order.
        Updates stock in the destination warehouse and mirrors to Cassandra and Neo4j.
        Transitions state from ORDERED -> PARTIALLY_RECEIVED or RECEIVED.
        """
        po = self.get_object()
        if po.status in ["CANCELLED", "RECEIVED"]:
            return Response({"error": f"Cannot receive items for PO in status {po.status}."}, status=status.HTTP_400_BAD_REQUEST)

        received_items = request.data.get("items", [])
        if not received_items:
            # Default: receive all remaining ordered items in full
            received_items = [{"product_id": item.product.product_id, "quantity": item.quantity_ordered - item.quantity_received}
                              for item in po.items.all()]

        warehouse = po.destination_warehouse or Warehouse.objects.filter(status="ACTIVE").first()
        if not warehouse:
            return Response({"error": "No destination warehouse configured for this PO."}, status=status.HTTP_400_BAD_REQUEST)

        all_fully_received = True

        with transaction.atomic():
            for entry in received_items:
                p_id = entry.get("product_id")
                qty = int(entry.get("quantity", 0))
                if qty <= 0:
                    continue

                po_item = po.items.filter(product__product_id=p_id).first()
                if not po_item:
                    continue

                po_item.quantity_received += qty
                po_item.save()

                # Add stock to warehouse
                wh_stock, _ = WarehouseStock.objects.get_or_create(
                    product=po_item.product, warehouse=warehouse,
                    defaults={"quantity": 0, "min_threshold": po_item.product.min_stock_threshold}
                )
                wh_stock.quantity += qty
                wh_stock.save()

                po_item.product.current_stock += qty
                po_item.product.save()

                # Movement audit
                m_id = f"MOV-PO-{uuid.uuid4().hex[:10].upper()}"
                StockMovement.objects.create(
                    movement_id=m_id,
                    product=po_item.product,
                    warehouse=warehouse,
                    movement_type="IN",
                    quantity=qty,
                    reference_id=po.po_number,
                    reason=f"Received against PO {po.po_number}",
                )

                # Cassandra dual write
                now = datetime.now()
                log_movement_to_cassandra(po_item.product.product_id, now.date(), now, "IN", qty, po.po_number, warehouse.warehouse_id)

                if po_item.quantity_received < po_item.quantity_ordered:
                    all_fully_received = False

            po.status = "RECEIVED" if all_fully_received else "PARTIALLY_RECEIVED"
            po.save()

        return Response({
            "status": "success",
            "po_number": po.po_number,
            "po_status": po.status,
            "message": f"PO {po.po_number} updated to {po.status}.",
        }, status=status.HTTP_200_OK)


# -------------------------------------------------------------
# 7. Analytics & Reports
# -------------------------------------------------------------

@api_view(["GET"])
def dashboard_analytics(request):
    """
    Returns live aggregated KPIs and charts derived directly from backend databases.
    """
    products = Product.objects.filter(is_active=True)
    total_products = products.count()
    total_inventory_units = products.aggregate(total=Sum("current_stock"))["total"] or 0
    total_valuation = sum(p.total_valuation for p in products)

    low_stock_products = products.filter(current_stock__gt=0, current_stock__lte=F("min_stock_threshold")).count()
    out_of_stock_products = products.filter(current_stock__lte=0).count()

    active_suppliers = Supplier.objects.filter(is_active=True).count()
    active_warehouses = Warehouse.objects.filter(status="ACTIVE").count()
    pending_pos = PurchaseOrder.objects.filter(status__in=["DRAFT", "SUBMITTED", "APPROVED", "ORDERED"]).count()

    # Stock by Category
    category_data = (
        products.values("category")
        .annotate(units=Sum("current_stock"), count=Count("id"))
        .order_by("-units")
    )

    # Warehouse utilization summary
    warehouses = Warehouse.objects.all()
    warehouse_summaries = [
        {
            "warehouse_id": w.warehouse_id,
            "name": w.name,
            "code": w.code,
            "capacity": w.capacity,
            "stored_units": w.total_stock_stored,
            "utilization": w.utilization_percentage,
        }
        for w in warehouses
    ]

    # Recent stock movements (last 10)
    recent_movements = StockMovement.objects.select_related("product", "warehouse").order_by("-created_at")[:8]
    movements_data = StockMovementSerializer(recent_movements, many=True).data

    # Low stock items list (top 6 critical)
    critical_items = products.filter(current_stock__lte=F("min_stock_threshold")).order_by("current_stock")[:6]
    low_stock_data = [
        {
            "product_id": p.product_id,
            "name": p.name,
            "sku": p.sku,
            "category": p.category,
            "current_stock": p.current_stock,
            "min_threshold": p.min_stock_threshold,
            "status": p.stock_status,
        }
        for p in critical_items
    ]

    # Quick graph risks summary
    risks = []
    try:
        risks = analyze_graph_risks()[:4]
    except Exception:
        pass

    return Response({
        "kpis": {
            "total_products": total_products,
            "total_inventory_units": total_inventory_units,
            "total_inventory_valuation": round(total_valuation, 2),
            "low_stock_count": low_stock_products,
            "out_of_stock_count": out_of_stock_products,
            "active_suppliers": active_suppliers,
            "active_warehouses": active_warehouses,
            "pending_purchase_orders": pending_pos,
            "open_risks_count": len(risks),
        },
        "stock_by_category": list(category_data),
        "warehouse_summaries": warehouse_summaries,
        "recent_movements": movements_data,
        "critical_low_stock": low_stock_data,
        "top_risks": risks,
    })


@api_view(["GET"])
def export_csv_report(request):
    """
    Exports clean, parameterized CSV reports: 'inventory', 'movements', 'low-stock', 'suppliers'.
    """
    report_type = request.query_params.get("type", "inventory").lower()
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{report_type}_report_{date.today()}.csv"'

    writer = csv.writer(response)

    if report_type == "movements":
        writer.writerow(["Movement ID", "Product ID", "Product Name", "Warehouse", "Type", "Quantity", "Reference", "Timestamp"])
        for m in StockMovement.objects.select_related("product", "warehouse").order_by("-created_at")[:1000]:
            writer.writerow([
                m.movement_id, m.product.product_id, m.product.name, m.warehouse.code,
                m.movement_type, m.quantity, m.reference_id, m.created_at.strftime("%Y-%m-%d %H:%M:%S")
            ])
    elif report_type == "low-stock":
        writer.writerow(["Product ID", "SKU", "Product Name", "Category", "Current Stock", "Min Threshold", "Safety Stock", "Reorder Qty", "Supplier"])
        for p in Product.objects.filter(current_stock__lte=F("min_stock_threshold")).select_related("preferred_supplier"):
            writer.writerow([
                p.product_id, p.sku, p.name, p.category, p.current_stock, p.min_stock_threshold,
                p.safety_stock, p.reorder_quantity, p.preferred_supplier.name if p.preferred_supplier else "None"
            ])
    elif report_type == "suppliers":
        writer.writerow(["Supplier ID", "Name", "Contact", "Email", "Phone", "Avg Lead Time (days)", "Reliability"])
        for s in Supplier.objects.all():
            writer.writerow([s.supplier_id, s.name, s.contact_person, s.email, s.phone, s.average_lead_time_days, s.reliability_score])
    else:  # Inventory summary
        writer.writerow(["Product ID", "SKU", "Name", "Category", "Cost Price", "Selling Price", "Current Stock", "Valuation", "Status"])
        for p in Product.objects.all():
            writer.writerow([
                p.product_id, p.sku, p.name, p.category, float(p.cost_price), float(p.selling_price),
                p.current_stock, p.total_valuation, p.stock_status
            ])

    return response


# -------------------------------------------------------------
# 8. Demand Forecasting & Reorders
# -------------------------------------------------------------

@api_view(["POST"])
def import_demand_csv(request):
    """
    Accepts CSV upload for historical demand observations with strict column and format validation.
    """
    if "file" not in request.FILES:
        return Response({"error": "No file uploaded. Please upload a CSV file with key 'file'."}, status=status.HTTP_400_BAD_REQUEST)

    file_obj = request.FILES["file"]
    try:
        content = file_obj.read().decode("utf-8")
    except UnicodeDecodeError:
        return Response({"error": "File encoding error. Please ensure file is UTF-8 encoded CSV."}, status=status.HTTP_400_BAD_REQUEST)

    result = parse_and_import_demand_csv(content)
    status_code = status.HTTP_200_OK if result["success"] else status.HTTP_400_BAD_REQUEST
    return Response(result, status=status_code)


@api_view(["GET"])
def get_forecast(request, product_id):
    """
    Retrieves or calculates demand forecast and evaluation metrics for a specific product.
    """
    try:
        product = Product.objects.get(product_id=product_id)
    except Product.DoesNotExist:
        return Response({"error": f"Product {product_id} not found."}, status=status.HTTP_404_NOT_FOUND)

    algorithm = request.query_params.get("algorithm", "EXPONENTIAL_SMOOTHING")
    horizon = int(request.query_params.get("horizon", 14))

    result = generate_demand_forecast(product, algorithm=algorithm, horizon_days=horizon)
    result["product"] = {
        "id": product.product_id,
        "name": product.name,
        "sku": product.sku,
        "current_stock": product.current_stock,
        "lead_time_days": product.lead_time_days,
    }
    return Response(result)


@api_view(["GET"])
def reorder_recommendations(request):
    """
    Calculates intelligent reorder recommendations across active catalog using:
    Lead Time Demand + Safety Stock vs (Current Stock + Confirmed Incoming Orders).
    """
    recommendations = compute_reorder_recommendations()
    return Response({
        "count": len(recommendations),
        "needs_reorder_count": sum(1 for r in recommendations if r["needs_reorder"]),
        "recommendations": recommendations,
    })


# -------------------------------------------------------------
# 9. Neo4j Supply-Chain Graph & Risk Analysis
# -------------------------------------------------------------

@api_view(["GET"])
def get_supply_chain_graph(request):
    """
    Returns full node-link graph for visualization.
    """
    data = get_entire_graph_data()
    return Response(data)


@api_view(["POST"])
def sync_supply_chain_graph(request):
    """
    Synchronizes all Products, Suppliers, Warehouses, Components, and relationships
    from Django relational tables to Neo4j.
    """
    neo_health = check_neo4j()
    if neo_health["status"] != "connected":
        return Response({
            "status": "warning",
            "message": "Neo4j is currently offline. Relational graph fallback is active and serving 100% of graph data.",
            "synced": {
                "suppliers": Supplier.objects.count(),
                "warehouses": Warehouse.objects.count(),
                "products": Product.objects.count(),
            },
        })

    ensure_neo4j_constraints()

    products_count = 0
    suppliers_count = 0
    warehouses_count = 0

    # 1. Sync Suppliers
    for s in Supplier.objects.all():
        sync_entity_to_neo4j("Supplier", {
            "id": s.supplier_id,
            "name": s.name,
            "lead_time": s.average_lead_time_days,
            "reliability": s.reliability_score,
        })
        suppliers_count += 1

    # 2. Sync Warehouses
    for w in Warehouse.objects.all():
        sync_entity_to_neo4j("Warehouse", {
            "id": w.warehouse_id,
            "name": w.name,
            "code": w.code,
            "capacity": w.capacity,
        })
        warehouses_count += 1

    # 3. Sync Components
    for c in Component.objects.all():
        sync_entity_to_neo4j("Component", {
            "id": c.component_id,
            "name": c.name,
            "critical": c.is_critical,
            "lead_time": c.lead_time_days,
        })
        if c.supplier:
            sync_relationship_to_neo4j("Supplier", c.supplier.supplier_id, "Component", c.component_id, "SUPPLIES")

    # 4. Sync Products & Relationships
    for p in Product.objects.all():
        sync_entity_to_neo4j("Product", {
            "id": p.product_id,
            "name": p.name,
            "sku": p.sku,
            "category": p.category,
            "current_stock": p.current_stock,
            "min_threshold": p.min_stock_threshold,
        })
        products_count += 1

        if p.preferred_supplier:
            sync_relationship_to_neo4j("Supplier", p.preferred_supplier.supplier_id, "Product", p.product_id, "SUPPLIES", {"lead_time": p.lead_time_days})

        if p.primary_warehouse:
            sync_relationship_to_neo4j("Product", p.product_id, "Warehouse", p.primary_warehouse.warehouse_id, "STORED_AT", {"quantity": p.current_stock})

        for ws in p.warehouse_stocks.all():
            sync_relationship_to_neo4j("Product", p.product_id, "Warehouse", ws.warehouse.warehouse_id, "STORED_AT", {"quantity": ws.quantity})

        for pi in p.bom_items.select_related("component"):
            sync_relationship_to_neo4j("Product", p.product_id, "Component", pi.component.component_id, "DEPENDS_ON", {"quantity_required": pi.quantity_required})

    return Response({
        "status": "success",
        "synced": {
            "suppliers": suppliers_count,
            "warehouses": warehouses_count,
            "products": products_count,
        },
        "message": "Supply chain graph successfully synchronized to Neo4j.",
    })


@api_view(["GET"])
def get_supply_chain_risks(request):
    """
    Executes graph risk detection algorithms in Neo4j and returns explainable risks.
    """
    risks = analyze_graph_risks()
    severity = request.query_params.get("severity")
    if severity:
        risks = [r for r in risks if r["severity"].upper() == severity.upper()]

    return Response({
        "count": len(risks),
        "risks": risks,
    })
