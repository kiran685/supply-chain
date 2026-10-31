import uuid
from decimal import Decimal
from django.db import models
from django.contrib.auth.models import User


class Supplier(models.Model):
    supplier_id = models.CharField(max_length=50, unique=True, help_text="Unique identifier, e.g. SUP001")
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=150, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    address = models.TextField(blank=True, default="")
    average_lead_time_days = models.PositiveIntegerField(default=7)
    reliability_score = models.FloatField(default=0.95, help_text="Reliability score between 0.0 and 1.0 (e.g. 0.95 = 95%)")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["supplier_id"]

    def __str__(self):
        return f"{self.supplier_id} - {self.name}"


class Warehouse(models.Model):
    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("INACTIVE", "Inactive"),
        ("MAINTENANCE", "Under Maintenance"),
    ]

    warehouse_id = models.CharField(max_length=50, unique=True, help_text="Unique identifier, e.g. WH001")
    code = models.CharField(max_length=50, unique=True, help_text="Code e.g. WH-NORTH-01")
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True, default="")
    capacity = models.PositiveIntegerField(default=10000, help_text="Total unit storage capacity")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["warehouse_id"]

    def __str__(self):
        return f"{self.warehouse_id} - {self.name} ({self.code})"

    @property
    def total_stock_stored(self):
        return sum(item.quantity for item in self.stocks.all())

    @property
    def utilization_percentage(self):
        if self.capacity <= 0:
            return 0.0
        return round(min(100.0, (self.total_stock_stored / self.capacity) * 100), 2)


class Component(models.Model):
    """Sub-components for Bill of Materials (BOM) multi-tier supply chain dependencies."""
    component_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    lead_time_days = models.PositiveIntegerField(default=14)
    is_critical = models.BooleanField(default=False)
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL, related_name="supplied_components")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.component_id} - {self.name}"


class Product(models.Model):
    product_id = models.CharField(max_length=50, unique=True, help_text="Unique ID e.g. PROD001")
    sku = models.CharField(max_length=100, unique=True, help_text="Stock Keeping Unit")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    category = models.CharField(max_length=100, default="Electronics")
    unit_of_measurement = models.CharField(max_length=30, default="units")
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    
    current_stock = models.IntegerField(default=0)
    min_stock_threshold = models.PositiveIntegerField(default=20)
    safety_stock = models.PositiveIntegerField(default=15)
    reorder_quantity = models.PositiveIntegerField(default=50)
    lead_time_days = models.PositiveIntegerField(default=7)
    
    preferred_supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL, related_name="supplied_products")
    primary_warehouse = models.ForeignKey(Warehouse, null=True, blank=True, on_delete=models.SET_NULL, related_name="primary_products")
    components = models.ManyToManyField(Component, through="ProductComponent", blank=True, related_name="used_in_products")
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["product_id"]

    def __str__(self):
        return f"{self.product_id} - {self.name} ({self.sku})"

    @property
    def stock_status(self):
        if self.current_stock <= 0:
            return "OUT_OF_STOCK"
        elif self.current_stock <= self.min_stock_threshold:
            return "LOW_STOCK"
        return "OPTIMAL"

    @property
    def total_valuation(self):
        return float(self.current_stock * self.cost_price)


class ProductComponent(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="bom_items")
    component = models.ForeignKey(Component, on_delete=models.CASCADE, related_name="product_usages")
    quantity_required = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ("product", "component")

    def __str__(self):
        return f"{self.quantity_required}x {self.component.name} -> {self.product.name}"


class WarehouseStock(models.Model):
    """Tracks stock of a specific product inside a specific warehouse."""
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="warehouse_stocks")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="stocks")
    quantity = models.IntegerField(default=0)
    min_threshold = models.PositiveIntegerField(default=10)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("product", "warehouse")
        ordering = ["warehouse", "product"]

    def __str__(self):
        return f"{self.product.name} @ {self.warehouse.name}: {self.quantity}"


class StockMovement(models.Model):
    MOVEMENT_TYPES = [
        ("IN", "Stock In (Purchase/Receipt)"),
        ("OUT", "Stock Out (Sale/Dispatch)"),
        ("TRANSFER", "Warehouse Transfer"),
        ("ADJUSTMENT", "Stock Adjustment / Reconciliation"),
        ("RETURN", "Customer Return"),
        ("DAMAGE", "Damaged / Written Off"),
    ]

    movement_id = models.CharField(max_length=64, unique=True, default=uuid.uuid4)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="movements")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="movements")
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPES)
    quantity = models.IntegerField(help_text="Positive for additions, negative or absolute according to operation")
    reference_id = models.CharField(max_length=100, blank=True, default="")
    reason = models.TextField(blank=True, default="")
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    
    source_warehouse = models.ForeignKey(Warehouse, null=True, blank=True, on_delete=models.SET_NULL, related_name="transfers_from")
    destination_warehouse = models.ForeignKey(Warehouse, null=True, blank=True, on_delete=models.SET_NULL, related_name="transfers_to")
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.movement_type}] {self.product.product_id} qty={self.quantity} @ {self.warehouse.warehouse_id}"


class PurchaseOrder(models.Model):
    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("ORDERED", "Ordered"),
        ("PARTIALLY_RECEIVED", "Partially Received"),
        ("RECEIVED", "Received"),
        ("CANCELLED", "Cancelled"),
    ]

    po_number = models.CharField(max_length=60, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name="purchase_orders")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="DRAFT")
    order_date = models.DateField(auto_now_add=True)
    expected_delivery_date = models.DateField(null=True, blank=True)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True, default="")
    destination_warehouse = models.ForeignKey(Warehouse, null=True, blank=True, on_delete=models.SET_NULL, related_name="incoming_orders")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.po_number} ({self.supplier.name}) - {self.status}"


class PurchaseOrderItem(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="po_items")
    quantity_ordered = models.PositiveIntegerField()
    quantity_received = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    def __str__(self):
        return f"{self.purchase_order.po_number}: {self.product.name} ({self.quantity_received}/{self.quantity_ordered})"


class DemandObservation(models.Model):
    """Historical daily/weekly demand records for time-series forecasting."""
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="demand_observations")
    date = models.DateField()
    quantity = models.PositiveIntegerField()
    source = models.CharField(max_length=50, default="MANUAL")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("product", "date")
        ordering = ["date"]

    def __str__(self):
        return f"{self.product.product_id} - {self.date}: {self.quantity}"


class ForecastRun(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="forecast_runs")
    run_at = models.DateTimeField(auto_now_add=True)
    algorithm = models.CharField(max_length=50, default="EXPONENTIAL_SMOOTHING")
    horizon_periods = models.PositiveIntegerField(default=14)
    metrics = models.JSONField(default=dict, blank=True)
    forecast_data = models.JSONField(default=list, blank=True)
    parameters = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-run_at"]

    def __str__(self):
        return f"Forecast for {self.product.product_id} ({self.algorithm}) @ {self.run_at}"
