from rest_framework import serializers
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


class SupplierSerializer(serializers.ModelSerializer):
    supplied_products_count = serializers.IntegerField(source="supplied_products.count", read_only=True)

    class Meta:
        model = Supplier
        fields = [
            "id",
            "supplier_id",
            "name",
            "contact_person",
            "email",
            "phone",
            "address",
            "average_lead_time_days",
            "reliability_score",
            "is_active",
            "supplied_products_count",
            "created_at",
            "updated_at",
        ]


class WarehouseSerializer(serializers.ModelSerializer):
    total_stock = serializers.IntegerField(source="total_stock_stored", read_only=True)
    utilization = serializers.FloatField(source="utilization_percentage", read_only=True)

    class Meta:
        model = Warehouse
        fields = [
            "id",
            "warehouse_id",
            "code",
            "name",
            "address",
            "capacity",
            "status",
            "total_stock",
            "utilization",
            "created_at",
            "updated_at",
        ]


class ComponentSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default=None)

    class Meta:
        model = Component
        fields = [
            "id",
            "component_id",
            "name",
            "description",
            "cost",
            "lead_time_days",
            "is_critical",
            "supplier",
            "supplier_name",
            "created_at",
        ]


class ProductComponentSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source="component.name", read_only=True)
    component_id = serializers.CharField(source="component.component_id", read_only=True)
    is_critical = serializers.BooleanField(source="component.is_critical", read_only=True)

    class Meta:
        model = ProductComponent
        fields = [
            "id",
            "component",
            "component_id",
            "component_name",
            "is_critical",
            "quantity_required",
        ]


class WarehouseStockSerializer(serializers.ModelSerializer):
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_id_str = serializers.CharField(source="product.product_id", read_only=True)

    class Meta:
        model = WarehouseStock
        fields = [
            "id",
            "product",
            "product_id_str",
            "product_name",
            "warehouse",
            "warehouse_code",
            "warehouse_name",
            "quantity",
            "min_threshold",
            "updated_at",
        ]


class ProductSerializer(serializers.ModelSerializer):
    stock_status = serializers.CharField(read_only=True)
    total_valuation = serializers.FloatField(read_only=True)
    preferred_supplier_name = serializers.CharField(source="preferred_supplier.name", read_only=True, default=None)
    primary_warehouse_name = serializers.CharField(source="primary_warehouse.name", read_only=True, default=None)
    warehouse_stocks = WarehouseStockSerializer(many=True, read_only=True)
    bom_items = ProductComponentSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "product_id",
            "sku",
            "name",
            "description",
            "category",
            "unit_of_measurement",
            "cost_price",
            "selling_price",
            "current_stock",
            "min_stock_threshold",
            "safety_stock",
            "reorder_quantity",
            "lead_time_days",
            "preferred_supplier",
            "preferred_supplier_name",
            "primary_warehouse",
            "primary_warehouse_name",
            "stock_status",
            "total_valuation",
            "is_active",
            "warehouse_stocks",
            "bom_items",
            "created_at",
            "updated_at",
        ]


class StockMovementSerializer(serializers.ModelSerializer):
    product_id_str = serializers.CharField(source="product.product_id", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    source_warehouse_name = serializers.CharField(source="source_warehouse.name", read_only=True, default=None)
    destination_warehouse_name = serializers.CharField(source="destination_warehouse.name", read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "movement_id",
            "product",
            "product_id_str",
            "product_name",
            "warehouse",
            "warehouse_code",
            "warehouse_name",
            "movement_type",
            "quantity",
            "reference_id",
            "reason",
            "source_warehouse",
            "source_warehouse_name",
            "destination_warehouse",
            "destination_warehouse_name",
            "created_at",
        ]


class StockInSerializer(serializers.Serializer):
    product_id = serializers.CharField(required=True)
    warehouse_id = serializers.CharField(required=True)
    quantity = serializers.IntegerField(min_value=1)
    reference_id = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=False, allow_blank=True, default="Standard Stock In")


class StockOutSerializer(serializers.Serializer):
    product_id = serializers.CharField(required=True)
    warehouse_id = serializers.CharField(required=True)
    quantity = serializers.IntegerField(min_value=1)
    reference_id = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=False, allow_blank=True, default="Fulfillment / Sale")


class StockAdjustmentSerializer(serializers.Serializer):
    product_id = serializers.CharField(required=True)
    warehouse_id = serializers.CharField(required=True)
    new_quantity = serializers.IntegerField(min_value=0)
    reference_id = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=True)


class WarehouseTransferSerializer(serializers.Serializer):
    product_id = serializers.CharField(required=True)
    source_warehouse_id = serializers.CharField(required=True)
    destination_warehouse_id = serializers.CharField(required=True)
    quantity = serializers.IntegerField(min_value=1)
    reference_id = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=False, allow_blank=True, default="Inter-warehouse stock rebalance")


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_id_str = serializers.CharField(source="product.product_id", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrderItem
        fields = [
            "id",
            "product",
            "product_id_str",
            "product_name",
            "quantity_ordered",
            "quantity_received",
            "unit_cost",
            "subtotal",
        ]

    def get_subtotal(self, obj):
        return float(obj.quantity_ordered * obj.unit_cost)


class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    warehouse_name = serializers.CharField(source="destination_warehouse.name", read_only=True, default=None)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "po_number",
            "supplier",
            "supplier_name",
            "status",
            "order_date",
            "expected_delivery_date",
            "total_amount",
            "notes",
            "destination_warehouse",
            "warehouse_name",
            "items",
            "created_at",
            "updated_at",
        ]


class DemandObservationSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = DemandObservation
        fields = ["id", "product", "product_name", "date", "quantity", "source", "created_at"]
