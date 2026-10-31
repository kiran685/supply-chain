from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    health_check,
    ProductViewSet,
    SupplierViewSet,
    WarehouseViewSet,
    PurchaseOrderViewSet,
)

router = DefaultRouter()
router.register(r"products", ProductViewSet, basename="product")
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"warehouses", WarehouseViewSet, basename="warehouse")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchase-order")

urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("", include(router.urls)),
]