from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from inventory.views import (
    health_check,
    database_health,
    ProductViewSet,
    SupplierViewSet,
    WarehouseViewSet,
    PurchaseOrderViewSet,
    list_warehouse_stock,
    list_stock_movements,
    stock_in,
    stock_out,
    stock_adjustment,
    stock_transfer,
    dashboard_analytics,
    export_csv_report,
    import_demand_csv,
    get_forecast,
    reorder_recommendations,
    get_supply_chain_graph,
    sync_supply_chain_graph,
    get_supply_chain_risks,
)

router = DefaultRouter()
router.register(r"products", ProductViewSet, basename="product")
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"warehouses", WarehouseViewSet, basename="warehouse")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchase-order")

urlpatterns = [
    path("admin/", admin.site.urls),

    # Preserved Health Endpoints
    path("api/health/", health_check, name="health_check"),
    path("api/health/databases/", database_health, name="database_health"),

    # Inventory & Movements
    path("api/inventory/stock/", list_warehouse_stock, name="inventory_stock"),
    path("api/inventory/movements/", list_stock_movements, name="inventory_movements"),
    path("api/inventory/stock-in/", stock_in, name="stock_in"),
    path("api/inventory/stock-out/", stock_out, name="stock_out"),
    path("api/inventory/adjustments/", stock_adjustment, name="stock_adjustment"),
    path("api/inventory/transfers/", stock_transfer, name="stock_transfer"),

    # Analytics & Reports
    path("api/analytics/dashboard/", dashboard_analytics, name="dashboard_analytics"),
    path("api/analytics/export/", export_csv_report, name="export_csv_report"),

    # Demand Forecasting & Reorders
    path("api/forecasting/import/", import_demand_csv, name="import_demand_csv"),
    path("api/forecasting/reorder-recommendations/", reorder_recommendations, name="reorder_recommendations"),
    path("api/forecasting/<str:product_id>/", get_forecast, name="get_forecast"),

    # Supply Chain Graph & Risk Analysis
    path("api/supply-chain/graph/", get_supply_chain_graph, name="supply_chain_graph"),
    path("api/supply-chain/sync/", sync_supply_chain_graph, name="sync_supply_chain_graph"),
    path("api/supply-chain/risks/", get_supply_chain_risks, name="supply_chain_risks"),

    # Routers (Products, Suppliers, Warehouses, Purchase Orders)
    path("api/", include(router.urls)),
]
