import random
import uuid
from datetime import datetime, date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from inventory.models import (
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
)
from inventory.cassandra_client import log_movement_to_cassandra
from inventory.neo4j_client import (
    ensure_neo4j_constraints,
    sync_entity_to_neo4j,
    sync_relationship_to_neo4j,
)


class Command(BaseCommand):
    help = "Seeds repeatable, realistic demonstration data across SQLite, Cassandra, and Neo4j."

    def handle(self, *args, **options):
        self.stdout.write("Starting idempotent database seeding...")

        with transaction.atomic():
            # 1. Suppliers
            suppliers_data = [
                {
                    "supplier_id": "SUP001",
                    "name": "Apex Semiconductors Ltd",
                    "contact_person": "Vikram Malhotra",
                    "email": "v.malhotra@apexsemi.com",
                    "phone": "+91 98765 43210",
                    "address": "Electronic City, Phase 1, Bangalore, India",
                    "average_lead_time_days": 10,
                    "reliability_score": 0.94,
                },
                {
                    "supplier_id": "SUP002",
                    "name": "Global Power Systems",
                    "contact_person": "Sarah Jenkins",
                    "email": "orders@globalpower.tech",
                    "phone": "+1 415 555 2671",
                    "address": "Silicon Valley Blvd, San Jose, CA, USA",
                    "average_lead_time_days": 18,
                    "reliability_score": 0.88,
                },
                {
                    "supplier_id": "SUP003",
                    "name": "Precision Optics & Displays",
                    "contact_person": "Chen Wei",
                    "email": "chen.w@precisionoptics.cn",
                    "phone": "+86 755 8321 0099",
                    "address": "Futian District, Shenzhen, China",
                    "average_lead_time_days": 21,
                    "reliability_score": 0.79,
                },
                {
                    "supplier_id": "SUP004",
                    "name": "Omni Sensor Technologies",
                    "contact_person": "Klaus Richter",
                    "email": "k.richter@omnisensors.de",
                    "phone": "+49 89 2345 6789",
                    "address": "Technopark Strasse 14, Munich, Germany",
                    "average_lead_time_days": 7,
                    "reliability_score": 0.97,
                },
            ]

            suppliers = {}
            for s_data in suppliers_data:
                supp, _ = Supplier.objects.update_or_create(
                    supplier_id=s_data["supplier_id"],
                    defaults=s_data,
                )
                suppliers[supp.supplier_id] = supp
            self.stdout.write(f"  [OK] Seeded {len(suppliers)} Suppliers.")

            # 2. Warehouses
            warehouses_data = [
                {
                    "warehouse_id": "WH001",
                    "code": "WH-CENTRAL-01",
                    "name": "Central Logistics Hub",
                    "address": "Bhiwandi Industrial Estate, Mumbai, India",
                    "capacity": 2500,
                    "status": "ACTIVE",
                },
                {
                    "warehouse_id": "WH002",
                    "code": "WH-SOUTH-02",
                    "name": "Southern Distribution Center",
                    "address": "Hosur Road Industrial Corridor, Bangalore, India",
                    "capacity": 2000,
                    "status": "ACTIVE",
                },
                {
                    "warehouse_id": "WH003",
                    "code": "WH-NORTH-03",
                    "name": "Northern Regional Depot",
                    "address": "Manesar Logistics Park, Gurugram, India",
                    "capacity": 1500,
                    "status": "ACTIVE",
                },
            ]

            warehouses = {}
            for w_data in warehouses_data:
                wh, _ = Warehouse.objects.update_or_create(
                    warehouse_id=w_data["warehouse_id"],
                    defaults=w_data,
                )
                warehouses[wh.warehouse_id] = wh
            self.stdout.write(f"  [OK] Seeded {len(warehouses)} Warehouses.")

            # 3. Sub-Components (Tier 2 BOM)
            components_data = [
                {
                    "component_id": "COMP-SILICON-WAFER",
                    "name": "300mm Monocrystalline Silicon Wafer",
                    "description": "Raw substrate for IC fabrication",
                    "cost": Decimal("45.00"),
                    "lead_time_days": 30,
                    "is_critical": True,
                    "supplier": suppliers["SUP001"],
                },
                {
                    "component_id": "COMP-LITHIUM-CELL",
                    "name": "Grade-A 21700 Cylindrical Lithium Cell",
                    "description": "Chemical battery cell",
                    "cost": Decimal("4.20"),
                    "lead_time_days": 25,
                    "is_critical": True,
                    "supplier": suppliers["SUP002"],
                },
                {
                    "component_id": "COMP-GLASS-SUBSTRATE",
                    "name": "Corning Gorilla Glass Cover Panel",
                    "description": "Scratch-resistant cover glass",
                    "cost": Decimal("8.50"),
                    "lead_time_days": 15,
                    "is_critical": False,
                    "supplier": suppliers["SUP003"],
                },
            ]

            components = {}
            for c_data in components_data:
                comp, _ = Component.objects.update_or_create(
                    component_id=c_data["component_id"],
                    defaults=c_data,
                )
                components[comp.component_id] = comp
            self.stdout.write(f"  [OK] Seeded {len(components)} BOM Components.")

            # 4. Products
            products_data = [
                {
                    "product_id": "PROD001",
                    "sku": "SKU-MCU-ARM4",
                    "name": "STM32F4 Cortex-M4 Microcontroller",
                    "description": "High-performance 32-bit MCU with DSP and FPU, 168 MHz",
                    "category": "Semiconductors",
                    "unit_of_measurement": "pieces",
                    "cost_price": Decimal("12.50"),
                    "selling_price": Decimal("24.00"),
                    "current_stock": 420,
                    "min_stock_threshold": 100,
                    "safety_stock": 80,
                    "reorder_quantity": 300,
                    "lead_time_days": 10,
                    "preferred_supplier": suppliers["SUP001"],
                    "primary_warehouse": warehouses["WH001"],
                },
                {
                    "product_id": "PROD002",
                    "sku": "SKU-BAT-LIPO48",
                    "name": "48V 20Ah LiFePO4 Power Module",
                    "description": "Industrial rechargeable energy storage unit with smart BMS",
                    "category": "Power Systems",
                    "unit_of_measurement": "units",
                    "cost_price": Decimal("145.00"),
                    "selling_price": Decimal("280.00"),
                    "current_stock": 18,  # LOW STOCK SCENARIO
                    "min_stock_threshold": 25,
                    "safety_stock": 20,
                    "reorder_quantity": 50,
                    "lead_time_days": 18,
                    "preferred_supplier": suppliers["SUP002"],
                    "primary_warehouse": warehouses["WH001"],
                },
                {
                    "product_id": "PROD003",
                    "sku": "SKU-DISP-OLED7",
                    "name": "7.0-inch AMOLED Capacitive Touch Display",
                    "description": "1080x1920 Full HD industrial ruggedized touch module",
                    "category": "Displays",
                    "unit_of_measurement": "pieces",
                    "cost_price": Decimal("38.00"),
                    "selling_price": Decimal("75.00"),
                    "current_stock": 0,  # OUT OF STOCK CRITICAL SCENARIO
                    "min_stock_threshold": 30,
                    "safety_stock": 25,
                    "reorder_quantity": 100,
                    "lead_time_days": 21,
                    "preferred_supplier": suppliers["SUP003"],
                    "primary_warehouse": warehouses["WH002"],
                },
                {
                    "product_id": "PROD004",
                    "sku": "SKU-SENS-ENV6",
                    "name": "BME680 Environmental Gas & Pressure Sensor",
                    "description": "Digital 4-in-1 sensor with VOC, barometric pressure, humidity",
                    "category": "Sensors",
                    "unit_of_measurement": "pieces",
                    "cost_price": Decimal("7.20"),
                    "selling_price": Decimal("15.50"),
                    "current_stock": 650,
                    "min_stock_threshold": 120,
                    "safety_stock": 100,
                    "reorder_quantity": 400,
                    "lead_time_days": 7,
                    "preferred_supplier": suppliers["SUP004"],
                    "primary_warehouse": warehouses["WH002"],
                },
                {
                    "product_id": "PROD005",
                    "sku": "SKU-SOC-WIFI6",
                    "name": "ESP32-S3 Dual-Core AI SoC",
                    "description": "Wi-Fi + Bluetooth 5 LE MCU with vector instructions for edge ML",
                    "category": "Semiconductors",
                    "unit_of_measurement": "pieces",
                    "cost_price": Decimal("4.80"),
                    "selling_price": Decimal("9.90"),
                    "current_stock": 310,
                    "min_stock_threshold": 80,
                    "safety_stock": 60,
                    "reorder_quantity": 250,
                    "lead_time_days": 10,
                    "preferred_supplier": suppliers["SUP001"],  # Apex also supplies this -> supplier concentration!
                    "primary_warehouse": warehouses["WH001"],
                },
                {
                    "product_id": "PROD006",
                    "sku": "SKU-REG-DCDC12",
                    "name": "Synchronous Buck Converter Step-Down IC",
                    "description": "Wide input 4.5V-36V, 5A switching regulator",
                    "category": "Power Systems",
                    "unit_of_measurement": "pieces",
                    "cost_price": Decimal("2.10"),
                    "selling_price": Decimal("5.20"),
                    "current_stock": 800,
                    "min_stock_threshold": 150,
                    "safety_stock": 100,
                    "reorder_quantity": 500,
                    "lead_time_days": 10,
                    "preferred_supplier": suppliers["SUP001"],  # Apex supplies 3rd product!
                    "primary_warehouse": warehouses["WH001"],
                },
            ]

            products = {}
            for p_data in products_data:
                prod, _ = Product.objects.update_or_create(
                    product_id=p_data["product_id"],
                    defaults=p_data,
                )
                products[prod.product_id] = prod
            self.stdout.write(f"  [OK] Seeded {len(products)} Products.")

            # 5. Bill of Materials linkages
            ProductComponent.objects.update_or_create(
                product=products["PROD001"],
                component=components["COMP-SILICON-WAFER"],
                defaults={"quantity_required": 1},
            )
            ProductComponent.objects.update_or_create(
                product=products["PROD002"],
                component=components["COMP-LITHIUM-CELL"],
                defaults={"quantity_required": 14},
            )
            ProductComponent.objects.update_or_create(
                product=products["PROD003"],
                component=components["COMP-GLASS-SUBSTRATE"],
                defaults={"quantity_required": 1},
            )

            # 6. Warehouse Stock Allocations
            stock_allocations = [
                # WH001 (Central Hub - high stock)
                (products["PROD001"], warehouses["WH001"], 320),
                (products["PROD001"], warehouses["WH002"], 100),
                (products["PROD002"], warehouses["WH001"], 18),
                (products["PROD004"], warehouses["WH001"], 250),
                (products["PROD004"], warehouses["WH002"], 400),
                (products["PROD005"], warehouses["WH001"], 310),
                (products["PROD006"], warehouses["WH001"], 800),
            ]

            for prod, wh, qty in stock_allocations:
                WarehouseStock.objects.update_or_create(
                    product=prod,
                    warehouse=wh,
                    defaults={"quantity": qty, "min_threshold": prod.min_stock_threshold},
                )

            # 7. Purchase Orders (Demonstrating pipeline)
            po1, _ = PurchaseOrder.objects.update_or_create(
                po_number="PO-2026-00101",
                supplier=suppliers["SUP003"],
                defaults={
                    "status": "ORDERED",
                    "destination_warehouse": warehouses["WH002"],
                    "expected_delivery_date": date.today() + timedelta(days=7),
                    "total_amount": Decimal("3800.00"),
                    "notes": "Urgent replenishment for out-of-stock OLED modules.",
                },
            )
            PurchaseOrderItem.objects.update_or_create(
                purchase_order=po1,
                product=products["PROD003"],
                defaults={"quantity_ordered": 100, "quantity_received": 0, "unit_cost": Decimal("38.00")},
            )

            po2, _ = PurchaseOrder.objects.update_or_create(
                po_number="PO-2026-00102",
                supplier=suppliers["SUP002"],
                defaults={
                    "status": "APPROVED",
                    "destination_warehouse": warehouses["WH001"],
                    "expected_delivery_date": date.today() + timedelta(days=12),
                    "total_amount": Decimal("7250.00"),
                    "notes": "Scheduled replenishment of 48V Power Modules.",
                },
            )
            PurchaseOrderItem.objects.update_or_create(
                purchase_order=po2,
                product=products["PROD002"],
                defaults={"quantity_ordered": 50, "quantity_received": 0, "unit_cost": Decimal("145.00")},
            )

            # 8. Historical Stock Movements (Dual write to SQLite and Cassandra)
            base_time = datetime.now() - timedelta(days=30)
            sample_movements = [
                (products["PROD001"], warehouses["WH001"], "IN", 400, "PO-INIT-001", "Initial inventory stocking"),
                (products["PROD001"], warehouses["WH001"], "OUT", 80, "ORD-FULFILL-101", "OEM client batch shipment"),
                (products["PROD002"], warehouses["WH001"], "IN", 50, "PO-INIT-002", "Initial battery shipment"),
                (products["PROD002"], warehouses["WH001"], "OUT", 32, "ORD-FULFILL-102", "Fleet customer delivery"),
                (products["PROD004"], warehouses["WH002"], "IN", 700, "PO-INIT-003", "Factory bulk consignment"),
                (products["PROD004"], warehouses["WH002"], "OUT", 50, "ORD-FULFILL-103", "Commercial dispatch"),
                (products["PROD005"], warehouses["WH001"], "IN", 350, "PO-INIT-004", "Production batch receipt"),
                (products["PROD005"], warehouses["WH001"], "OUT", 40, "ORD-FULFILL-104", "Evaluation kit assembly"),
            ]

            for i, (prod, wh, m_type, qty, ref, rsn) in enumerate(sample_movements):
                m_date = (base_time + timedelta(days=i * 3)).date()
                m_time = base_time + timedelta(days=i * 3, hours=random.randint(1, 8))
                m_id = f"MOV-SEED-{prod.product_id}-{i+1:03d}"

                StockMovement.objects.update_or_create(
                    movement_id=m_id,
                    defaults={
                        "product": prod,
                        "warehouse": wh,
                        "movement_type": m_type,
                        "quantity": qty,
                        "reference_id": ref,
                        "reason": rsn,
                    },
                )
                # Mirror to Cassandra
                log_movement_to_cassandra(prod.product_id, m_date, m_time, m_type, qty, ref, wh.warehouse_id)

            self.stdout.write("  [OK] Seeded Stock Movements in SQLite & Cassandra.")

            # 9. Time-Series Historical Demand Observations for Forecasting
            # Seed 30 daily data points per product with realistic trend & variance
            random.seed(42)  # Stable deterministic seed
            today = date.today()
            observations_count = 0

            demand_profiles = {
                "PROD001": (18, 4),   # base 18, std 4
                "PROD002": (3, 1),    # base 3, std 1
                "PROD003": (6, 2),    # base 6, std 2
                "PROD004": (25, 6),   # base 25, std 6
                "PROD005": (14, 3),   # base 14, std 3
                "PROD006": (35, 8),   # base 35, std 8
            }

            for p_id, (base_qty, variance) in demand_profiles.items():
                prod = products[p_id]
                for day_offset in range(35, 0, -1):
                    obs_date = today - timedelta(days=day_offset)
                    # Gentle weekday seasonality
                    weekday_boost = 1.2 if obs_date.weekday() in [1, 3] else 0.9
                    qty = max(1, int((base_qty + random.randint(-variance, variance)) * weekday_boost))
                    
                    DemandObservation.objects.update_or_create(
                        product=prod,
                        date=obs_date,
                        defaults={"quantity": qty, "source": "SEED_HISTORY"},
                    )
                    observations_count += 1

            self.stdout.write(f"  [OK] Seeded {observations_count} Historical Demand Observations for forecasting.")

        # 10. Sync to Neo4j Graph
        self.stdout.write("Synchronizing Supply Chain Graph to Neo4j...")
        try:
            ensure_neo4j_constraints()

            for s in Supplier.objects.all():
                sync_entity_to_neo4j("Supplier", {
                    "id": s.supplier_id,
                    "name": s.name,
                    "lead_time": s.average_lead_time_days,
                    "reliability": s.reliability_score,
                })

            for w in Warehouse.objects.all():
                sync_entity_to_neo4j("Warehouse", {
                    "id": w.warehouse_id,
                    "name": w.name,
                    "code": w.code,
                    "capacity": w.capacity,
                })

            for c in Component.objects.all():
                sync_entity_to_neo4j("Component", {
                    "id": c.component_id,
                    "name": c.name,
                    "critical": c.is_critical,
                    "lead_time": c.lead_time_days,
                })
                if c.supplier:
                    sync_relationship_to_neo4j("Supplier", c.supplier.supplier_id, "Component", c.component_id, "SUPPLIES")

            for p in Product.objects.all():
                sync_entity_to_neo4j("Product", {
                    "id": p.product_id,
                    "name": p.name,
                    "sku": p.sku,
                    "category": p.category,
                    "current_stock": p.current_stock,
                    "min_threshold": p.min_stock_threshold,
                })

                if p.preferred_supplier:
                    sync_relationship_to_neo4j("Supplier", p.preferred_supplier.supplier_id, "Product", p.product_id, "SUPPLIES", {"lead_time": p.lead_time_days})

                for ws in p.warehouse_stocks.all():
                    sync_relationship_to_neo4j("Product", p.product_id, "Warehouse", ws.warehouse.warehouse_id, "STORED_AT", {"quantity": ws.quantity})

                for pi in p.bom_items.select_related("component"):
                    sync_relationship_to_neo4j("Product", p.product_id, "Component", pi.component.component_id, "DEPENDS_ON", {"quantity_required": pi.quantity_required})

            # Connect warehouses
            sync_relationship_to_neo4j("Warehouse", "WH001", "Warehouse", "WH002", "CONNECTED_TO", {"transit_days": 2})
            sync_relationship_to_neo4j("Warehouse", "WH001", "Warehouse", "WH003", "CONNECTED_TO", {"transit_days": 3})

            self.stdout.write("  [OK] Neo4j graph nodes and relationships synchronized successfully.")
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f"  [!] Neo4j sync notice: {exc}"))

        self.stdout.write(self.style.SUCCESS("Database seeding completed successfully!"))
