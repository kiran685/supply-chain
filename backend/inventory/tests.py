from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Supplier,
    Warehouse,
    Product,
    WarehouseStock,
    StockMovement,
    PurchaseOrder,
    PurchaseOrderItem,
    DemandObservation,
)
from .forecasting import (
    generate_demand_forecast,
    compute_reorder_recommendations,
    parse_and_import_demand_csv,
    calculate_metrics,
)
from .neo4j_client import get_entire_graph_data, analyze_graph_risks


class InventoryModelAndOperationTests(APITestCase):
    def setUp(self):
        self.supplier = Supplier.objects.create(
            supplier_id="TEST-SUP-1",
            name="Test Supplier Alpha",
            average_lead_time_days=7,
            reliability_score=0.92,
        )
        self.warehouse1 = Warehouse.objects.create(
            warehouse_id="TEST-WH-1",
            code="WH-TEST-01",
            name="Test Warehouse One",
            capacity=1000,
        )
        self.warehouse2 = Warehouse.objects.create(
            warehouse_id="TEST-WH-2",
            code="WH-TEST-02",
            name="Test Warehouse Two",
            capacity=1000,
        )
        self.product = Product.objects.create(
            product_id="TEST-PROD-1",
            sku="SKU-TEST-001",
            name="Test Product 1",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("20.00"),
            current_stock=100,
            min_stock_threshold=20,
            safety_stock=15,
            reorder_quantity=50,
            lead_time_days=7,
            preferred_supplier=self.supplier,
            primary_warehouse=self.warehouse1,
        )
        self.wh_stock1 = WarehouseStock.objects.create(
            product=self.product,
            warehouse=self.warehouse1,
            quantity=100,
        )

    def test_duplicate_sku_rejection(self):
        """Validates unique SKU requirement."""
        with self.assertRaises(Exception):
            Product.objects.create(
                product_id="TEST-PROD-2",
                sku="SKU-TEST-001",  # duplicate
                name="Duplicate SKU Product",
            )

    def test_stock_in_operation(self):
        """Verifies stock-in increases warehouse stock and aggregate product stock."""
        url = reverse("stock_in")
        payload = {
            "product_id": self.product.product_id,
            "warehouse_id": self.warehouse1.warehouse_id,
            "quantity": 50,
            "reference_id": "REF-IN-101",
            "reason": "Test Stock In",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.product.refresh_from_db()
        self.wh_stock1.refresh_from_db()

        self.assertEqual(self.product.current_stock, 150)
        self.assertEqual(self.wh_stock1.quantity, 150)
        self.assertTrue(StockMovement.objects.filter(reference_id="REF-IN-101").exists())

    def test_stock_out_operation_and_negative_stock_prevention(self):
        """Verifies stock-out deducts correctly and rejects quantity exceeding available balance."""
        url = reverse("stock_out")
        
        # 1. Valid Stock Out
        valid_payload = {
            "product_id": self.product.product_id,
            "warehouse_id": self.warehouse1.warehouse_id,
            "quantity": 40,
            "reference_id": "REF-OUT-101",
        }
        res = self.client.post(url, valid_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.assertEqual(self.product.current_stock, 60)

        # 2. Reject Stock Out exceeding available stock
        excess_payload = {
            "product_id": self.product.product_id,
            "warehouse_id": self.warehouse1.warehouse_id,
            "quantity": 500,  # exceeds 60
            "reference_id": "REF-OUT-EXCESS",
        }
        res2 = self.client.post(url, excess_payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Insufficient stock", res2.data["error"])

        # Ensure stock remained 60 and did not become negative
        self.product.refresh_from_db()
        self.assertEqual(self.product.current_stock, 60)

    def test_warehouse_transfer_operation(self):
        """Verifies transfer deducts source, adds destination, and keeps total stock intact."""
        url = reverse("stock_transfer")
        payload = {
            "product_id": self.product.product_id,
            "source_warehouse_id": self.warehouse1.warehouse_id,
            "destination_warehouse_id": self.warehouse2.warehouse_id,
            "quantity": 30,
            "reference_id": "REF-XFER-101",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.wh_stock1.refresh_from_db()
        wh_stock2 = WarehouseStock.objects.get(product=self.product, warehouse=self.warehouse2)

        self.assertEqual(self.wh_stock1.quantity, 70)
        self.assertEqual(wh_stock2.quantity, 30)
        self.assertEqual(self.product.current_stock, 100)  # Net stock invariant!

    def test_purchase_order_receiving(self):
        """Verifies purchase order receipt updates inventory and state."""
        po = PurchaseOrder.objects.create(
            po_number="PO-TEST-001",
            supplier=self.supplier,
            destination_warehouse=self.warehouse1,
            status="ORDERED",
        )
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            product=self.product,
            quantity_ordered=50,
            quantity_received=0,
            unit_cost=Decimal("10.00"),
        )

        url = f"/api/purchase-orders/{po.id}/receive/"
        res = self.client.post(url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        po.refresh_from_db()
        self.assertEqual(po.status, "RECEIVED")
        self.product.refresh_from_db()
        self.assertEqual(self.product.current_stock, 150)  # 100 initial + 50 received


class ForecastingAndAnalyticsTests(TestCase):
    def setUp(self):
        self.supplier = Supplier.objects.create(supplier_id="SUP-FC-1", name="FC Supplier", average_lead_time_days=10)
        self.product = Product.objects.create(
            product_id="PROD-FC-1",
            sku="SKU-FC-001",
            name="Forecasting Test Item",
            current_stock=15,
            min_stock_threshold=30,
            safety_stock=20,
            reorder_quantity=100,
            lead_time_days=10,
            preferred_supplier=self.supplier,
        )

        # Create 20 days of historical demand observations
        today = date.today()
        for i in range(20, 0, -1):
            DemandObservation.objects.create(
                product=self.product,
                date=today - timedelta(days=i),
                quantity=10 + (i % 4),
            )

    def test_metrics_calculation(self):
        actuals = [10.0, 12.0, 15.0, 20.0]
        forecasts = [11.0, 11.0, 14.0, 19.0]
        metrics = calculate_metrics(actuals, forecasts)
        self.assertAlmostEqual(metrics["mae"], 1.0)
        self.assertAlmostEqual(metrics["rmse"], 1.0)

    def test_exponential_smoothing_forecast(self):
        forecast_res = generate_demand_forecast(self.product, algorithm="EXPONENTIAL_SMOOTHING", horizon_days=7)
        self.assertEqual(forecast_res["algorithm"], "EXPONENTIAL_SMOOTHING")
        self.assertEqual(len(forecast_res["forecast_points"]), 7)
        self.assertIn("metrics", forecast_res)
        self.assertGreater(forecast_res["average_daily_demand"], 0)

    def test_reorder_recommendation_logic(self):
        recs = compute_reorder_recommendations()
        prod_rec = next((r for r in recs if r["product_id"] == self.product.product_id), None)
        self.assertIsNotNone(prod_rec)
        self.assertTrue(prod_rec["needs_reorder"])
        self.assertGreater(prod_rec["suggested_reorder_quantity"], 0)
        self.assertIn("Reorder Point", prod_rec["reason"])

    def test_csv_import_validation(self):
        # Valid CSV
        csv_data = f"product_id,date,quantity\n{self.product.product_id},2026-01-01,25\n"
        res = parse_and_import_demand_csv(csv_data)
        self.assertTrue(res["success"])
        self.assertEqual(res["rows_imported"], 1)

        # Invalid CSV: non-existent product
        invalid_csv = "product_id,date,quantity\nNONEXISTENT_PROD,2026-01-01,25\n"
        res_invalid = parse_and_import_demand_csv(invalid_csv)
        self.assertEqual(res_invalid["rows_imported"], 0)
        self.assertEqual(res_invalid["rows_skipped"], 1)


class Neo4jGraphRiskTests(TestCase):
    def test_graph_data_retrieval(self):
        data = get_entire_graph_data()
        self.assertIn("nodes", data)
        self.assertIn("edges", data)
        self.assertIsInstance(data["nodes"], list)
        self.assertIsInstance(data["edges"], list)

    def test_risk_analysis(self):
        risks = analyze_graph_risks()
        self.assertIsInstance(risks, list)
        if risks:
            first_risk = risks[0]
            self.assertIn("id", first_risk)
            self.assertIn("category", first_risk)
            self.assertIn("score", first_risk)
            self.assertIn("evidence", first_risk)
            self.assertIn("mitigation", first_risk)
