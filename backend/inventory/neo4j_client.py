import logging
from .db_connections import get_neo4j_driver

logger = logging.getLogger(__name__)


def ensure_neo4j_constraints():
    """Create uniqueness constraints on IDs if not already present."""
    try:
        driver = get_neo4j_driver()
        constraints = [
            "CREATE CONSTRAINT product_id_unique IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT supplier_id_unique IF NOT EXISTS FOR (s:Supplier) REQUIRE s.id IS UNIQUE",
            "CREATE CONSTRAINT warehouse_id_unique IF NOT EXISTS FOR (w:Warehouse) REQUIRE w.id IS UNIQUE",
            "CREATE CONSTRAINT component_id_unique IF NOT EXISTS FOR (c:Component) REQUIRE c.id IS UNIQUE",
        ]
        with driver.session() as session:
            for cql in constraints:
                try:
                    session.run(cql)
                except Exception as e:
                    logger.debug(f"Constraint notice: {e}")
    except Exception as exc:
        logger.debug(f"Skipping constraints, Neo4j offline: {exc}")


def sync_entity_to_neo4j(entity_type: str, data: dict):
    """
    Idempotent upsert of a node into Neo4j.
    Supported entity_type: 'Product', 'Supplier', 'Warehouse', 'Component'
    """
    try:
        driver = get_neo4j_driver()
        cql = f"""
            MERGE (n:{entity_type} {{id: $id}})
            SET n += $props
            RETURN n.id AS id
        """
        with driver.session() as session:
            result = session.run(cql, id=data["id"], props=data)
            return result.single()
    except Exception as exc:
        logger.debug(f"Neo4j offline or node upsert skipped for {entity_type}: {exc}")
        return None


def sync_relationship_to_neo4j(from_label: str, from_id: str,
                               to_label: str, to_id: str,
                               rel_type: str, props: dict = None):
    """
    Idempotent upsert of a relationship between two nodes.
    Example: (Supplier)-[:SUPPLIES]->(Product)
    """
    if props is None:
        props = {}
    try:
        driver = get_neo4j_driver()
        cql = f"""
            MATCH (a:{from_label} {{id: $from_id}})
            MATCH (b:{to_label} {{id: $to_id}})
            MERGE (a)-[r:{rel_type}]->(b)
            SET r += $props
            RETURN type(r)
        """
        with driver.session() as session:
            session.run(cql, from_id=from_id, to_id=to_id, props=props)
    except Exception as exc:
        logger.debug(f"Neo4j offline or rel upsert skipped: {exc}")


def get_entire_graph_data():
    """
    Fetches nodes and relationships formatted for React graph visualization.
    Attempts Neo4j first, falls back smoothly to relational graph when Neo4j is offline.
    """
    try:
        driver = get_neo4j_driver()
        nodes = []
        edges = []
        node_ids = set()

        with driver.session() as session:
            # Fetch nodes
            node_result = session.run("""
                MATCH (n)
                RETURN elementId(n) AS element_id, labels(n)[0] AS type, n.id AS business_id,
                       coalesce(n.name, n.code, n.id) AS label, properties(n) AS props
                LIMIT 300
            """)
            for record in list(node_result):
                b_id = record["business_id"] or str(record["element_id"])
                if b_id not in node_ids:
                    node_ids.add(b_id)
                    nodes.append({
                        "id": b_id,
                        "label": record["label"],
                        "type": record["type"] or "Unknown",
                        "properties": record["props"] or {},
                    })

            # Fetch relationships
            rel_result = session.run("""
                MATCH (a)-[r]->(b)
                RETURN coalesce(a.id, toString(elementId(a))) AS source,
                       coalesce(b.id, toString(elementId(b))) AS target,
                       type(r) AS type,
                       properties(r) AS props
                LIMIT 500
            """)
            for record in list(rel_result):
                edges.append({
                    "source": record["source"],
                    "target": record["target"],
                    "type": record["type"],
                    "properties": record["props"] or {},
                })

        if nodes:
            return {"nodes": nodes, "edges": edges, "source": "neo4j"}
    except Exception as exc:
        logger.info(f"Neo4j offline or query failed ({exc}), serving relational graph fallback.")

    return get_relational_graph_data()


def get_relational_graph_data():
    """Fallback graph provider built directly from relational models."""
    from .models import Product, Supplier, Warehouse, Component, ProductComponent, WarehouseStock
    nodes = []
    edges = []
    node_ids = set()

    for s in Supplier.objects.all():
        if s.supplier_id not in node_ids:
            node_ids.add(s.supplier_id)
            nodes.append({
                "id": s.supplier_id,
                "label": s.name,
                "type": "Supplier",
                "properties": {
                    "lead_time": s.average_lead_time_days,
                    "reliability": s.reliability_score,
                    "contact": s.contact_person,
                },
            })

    for w in Warehouse.objects.all():
        if w.warehouse_id not in node_ids:
            node_ids.add(w.warehouse_id)
            nodes.append({
                "id": w.warehouse_id,
                "label": f"{w.name} ({w.code})",
                "type": "Warehouse",
                "properties": {
                    "code": w.code,
                    "capacity": w.capacity,
                    "status": w.status,
                },
            })

    for c in Component.objects.select_related("supplier").all():
        if c.component_id not in node_ids:
            node_ids.add(c.component_id)
            nodes.append({
                "id": c.component_id,
                "label": c.name,
                "type": "Component",
                "properties": {
                    "critical": c.is_critical,
                    "lead_time": c.lead_time_days,
                },
            })
        if c.supplier and c.supplier.supplier_id in node_ids:
            edges.append({
                "source": c.supplier.supplier_id,
                "target": c.component_id,
                "type": "SUPPLIES",
                "properties": {"lead_time": c.lead_time_days},
            })

    for p in Product.objects.select_related("preferred_supplier", "primary_warehouse").all():
        if p.product_id not in node_ids:
            node_ids.add(p.product_id)
            nodes.append({
                "id": p.product_id,
                "label": p.name,
                "type": "Product",
                "properties": {
                    "sku": p.sku,
                    "category": p.category,
                    "current_stock": p.current_stock,
                    "min_threshold": p.min_stock_threshold,
                },
            })

        if p.preferred_supplier and p.preferred_supplier.supplier_id in node_ids:
            edges.append({
                "source": p.preferred_supplier.supplier_id,
                "target": p.product_id,
                "type": "SUPPLIES",
                "properties": {"lead_time": p.lead_time_days},
            })

        if p.primary_warehouse and p.primary_warehouse.warehouse_id in node_ids:
            edges.append({
                "source": p.product_id,
                "target": p.primary_warehouse.warehouse_id,
                "type": "STORED_AT",
                "properties": {"quantity": p.current_stock},
            })

    for ws in WarehouseStock.objects.select_related("product", "warehouse").all():
        if ws.product.product_id in node_ids and ws.warehouse.warehouse_id in node_ids:
            already_exists = any(
                e["source"] == ws.product.product_id and e["target"] == ws.warehouse.warehouse_id for e in edges
            )
            if not already_exists:
                edges.append({
                    "source": ws.product.product_id,
                    "target": ws.warehouse.warehouse_id,
                    "type": "STORED_AT",
                    "properties": {"quantity": ws.quantity},
                })

    for pi in ProductComponent.objects.select_related("product", "component").all():
        if pi.product.product_id in node_ids and pi.component.component_id in node_ids:
            edges.append({
                "source": pi.product.product_id,
                "target": pi.component.component_id,
                "type": "DEPENDS_ON",
                "properties": {"quantity_required": pi.quantity_required},
            })

    return {"nodes": nodes, "edges": edges, "source": "relational_fallback"}


def analyze_graph_risks():
    """
    Executes graph risk detection algorithms.
    Attempts Neo4j first, falls back smoothly to relational evaluation when Neo4j is offline.
    """
    try:
        driver = get_neo4j_driver()
        risks = []

        with driver.session() as session:
            # 1. Single-Source Supplier Vulnerability
            single_source_cql = """
                MATCH (p:Product)
                OPTIONAL MATCH (s:Supplier)-[:SUPPLIES]->(p)
                WITH p, count(s) AS supplierCount, collect(s.name) AS suppliers, collect(s.id) AS supplierIds
                WHERE supplierCount <= 1
                RETURN p.id AS product_id, p.name AS product_name,
                       p.current_stock AS current_stock, p.min_threshold AS min_threshold,
                       supplierCount, suppliers, supplierIds
            """
            for r in session.run(single_source_cql):
                supp_count = r["supplierCount"]
                suppliers = r["suppliers"]
                prod_name = r["product_name"] or r["product_id"]
                
                if supp_count == 0:
                    risks.append({
                        "id": f"RISK-SUP-ZERO-{r['product_id']}",
                        "category": "SUPPLIER_DISRUPTION",
                        "severity": "CRITICAL",
                        "score": 95,
                        "affected_entity": f"Product: {prod_name} ({r['product_id']})",
                        "path": f"None -> [NO_SUPPLIER] -> {prod_name}",
                        "evidence": f"Product {prod_name} has 0 registered suppliers in the active supply chain graph.",
                        "explanation": f"Any depletion of current stock cannot be replenished until a supplier is onboarded.",
                        "mitigation": "Immediately qualify and onboard a verified supplier for this product.",
                    })
                elif supp_count == 1:
                    risks.append({
                        "id": f"RISK-SUP-SINGLE-{r['product_id']}",
                        "category": "SINGLE_SOURCE_DEPENDENCY",
                        "severity": "HIGH",
                        "score": 75,
                        "affected_entity": f"Product: {prod_name} ({r['product_id']})",
                        "path": f"Supplier({suppliers[0]}) -> [:SUPPLIES] -> Product({prod_name})",
                        "evidence": f"Only 1 supplier ({suppliers[0]}) supplies this product.",
                        "explanation": f"Single point of failure: disruption or shipment delay at {suppliers[0]} halts fulfillment.",
                        "mitigation": "Qualify a secondary or backup supplier to distribute procurement risk.",
                    })

            # 2. Supplier Concentration Risk
            concentration_cql = """
                MATCH (s:Supplier)-[:SUPPLIES]->(p:Product)
                WITH s, count(p) AS suppliedCount, collect(p.name) AS products
                WHERE suppliedCount >= 3
                RETURN s.id AS supplier_id, s.name AS supplier_name, s.reliability AS reliability,
                       suppliedCount, products
            """
            for r in session.run(concentration_cql):
                supp_name = r["supplier_name"] or r["supplier_id"]
                count = r["suppliedCount"]
                risks.append({
                    "id": f"RISK-CONCENTRATION-{r['supplier_id']}",
                    "category": "SUPPLIER_CONCENTRATION",
                    "severity": "MEDIUM",
                    "score": 60,
                    "affected_entity": f"Supplier: {supp_name} ({r['supplier_id']})",
                    "path": f"Supplier({supp_name}) -> [:SUPPLIES] -> {count} Products",
                    "evidence": f"Supplier {supp_name} controls the supply of {count} separate catalog products ({', '.join(r['products'][:3])}{'...' if len(r['products']) > 3 else ''}).",
                    "explanation": "High organizational dependency on a single vendor. Any operational breakdown cascades across multiple product lines.",
                    "mitigation": "Establish multi-sourcing contracts to reduce total portfolio exposure to below 25% per vendor.",
                })

            # 3. Warehouse Bottleneck Analysis
            warehouse_cql = """
                MATCH (w:Warehouse)
                OPTIONAL MATCH (p:Product)-[r:STORED_AT]->(w)
                WITH w, count(p) AS productCount, coalesce(sum(r.quantity), 0) AS storedStock, w.capacity AS capacity
                WHERE capacity > 0 AND (toFloat(storedStock) / toFloat(capacity)) >= 0.80
                RETURN w.id AS warehouse_id, w.name AS warehouse_name, capacity, storedStock,
                       (toFloat(storedStock) / toFloat(capacity)) * 100 AS utilization
            """
            for r in session.run(warehouse_cql):
                w_name = r["warehouse_name"] or r["warehouse_id"]
                util = round(r["utilization"], 1)
                risks.append({
                    "id": f"RISK-WH-CAPACITY-{r['warehouse_id']}",
                    "category": "WAREHOUSE_BOTTLENECK",
                    "severity": "HIGH" if util >= 90 else "MEDIUM",
                    "score": 85 if util >= 90 else 65,
                    "affected_entity": f"Warehouse: {w_name} ({r['warehouse_id']})",
                    "path": f"Multiple Products -> [:STORED_AT] -> Warehouse({w_name}) [{util}% full]",
                    "evidence": f"Warehouse utilization has reached {util}% ({r['storedStock']}/{r['capacity']} units).",
                    "explanation": "Impending storage saturation limits incoming replenishment orders and causes handling delays.",
                    "mitigation": "Initiate inter-warehouse inventory transfer to secondary distribution centers with available capacity.",
                })

            # 4. Multi-hop Component Dependencies
            bom_cql = """
                MATCH (p:Product)-[:DEPENDS_ON]->(c:Component)
                OPTIONAL MATCH (s:Supplier)-[:SUPPLIES]->(c)
                WITH p, c, count(s) AS compSuppliers, collect(s.name) AS supplierNames
                WHERE compSuppliers <= 1 OR c.critical = true
                RETURN p.id AS product_id, p.name AS product_name,
                       c.id AS component_id, c.name AS component_name, c.critical AS critical,
                       compSuppliers, supplierNames
            """
            for r in session.run(bom_cql):
                p_name = r["product_name"] or r["product_id"]
                c_name = r["component_name"] or r["component_id"]
                is_crit = r["critical"]
                supp_count = r["compSuppliers"]
                suppliers = r["supplierNames"]

                risks.append({
                    "id": f"RISK-BOM-{r['product_id']}-{r['component_id']}",
                    "category": "TIER_2_COMPONENT_RISK",
                    "severity": "HIGH" if is_crit else "MEDIUM",
                    "score": 80 if is_crit else 55,
                    "affected_entity": f"Sub-Component: {c_name} for Product: {p_name}",
                    "path": f"Supplier({suppliers[0] if suppliers else 'None'}) -> Component({c_name}) -> Product({p_name})",
                    "evidence": f"Component {c_name} is {'critical' if is_crit else 'vital'} to assembling {p_name} and has {supp_count} vendor(s).",
                    "explanation": "Multi-tier supply chain vulnerability. A stockout of this raw part halts the assembly of the finished good.",
                    "mitigation": "Increase safety stock for critical components and audit Tier-2 supplier lead times.",
                })

        risks.sort(key=lambda x: x["score"], reverse=True)
        if risks:
            return risks
    except Exception as exc:
        logger.info(f"Neo4j offline or risk query failed ({exc}), serving relational risk analysis.")

    return analyze_relational_risks()


def analyze_relational_risks():
    """Fallback risk analytics algorithm executed directly on relational models."""
    from .models import Product, Supplier, Warehouse, Component, ProductComponent
    risks = []

    # 1. Single-Source / Zero-Source Supplier Vulnerability
    for p in Product.objects.select_related("preferred_supplier").all():
        prod_name = p.name or p.product_id
        if not p.preferred_supplier:
            risks.append({
                "id": f"RISK-SUP-ZERO-{p.product_id}",
                "category": "SUPPLIER_DISRUPTION",
                "severity": "CRITICAL",
                "score": 95,
                "affected_entity": f"Product: {prod_name} ({p.product_id})",
                "path": f"None -> [NO_SUPPLIER] -> {prod_name}",
                "evidence": f"Product {prod_name} has 0 registered suppliers in the active supply chain catalog.",
                "explanation": "Any depletion of current stock cannot be replenished until a supplier is onboarded.",
                "mitigation": "Immediately qualify and onboard a verified supplier for this product.",
            })
        else:
            risks.append({
                "id": f"RISK-SUP-SINGLE-{p.product_id}",
                "category": "SINGLE_SOURCE_DEPENDENCY",
                "severity": "HIGH",
                "score": 75,
                "affected_entity": f"Product: {prod_name} ({p.product_id})",
                "path": f"Supplier({p.preferred_supplier.name}) -> [:SUPPLIES] -> Product({prod_name})",
                "evidence": f"Only 1 supplier ({p.preferred_supplier.name}) supplies this product.",
                "explanation": f"Single point of failure: disruption or shipment delay at {p.preferred_supplier.name} halts fulfillment.",
                "mitigation": "Qualify a secondary or backup supplier to distribute procurement risk.",
            })

    # 2. Supplier Concentration Risk
    for s in Supplier.objects.prefetch_related("supplied_products").all():
        supplied_products = list(s.supplied_products.all())
        count = len(supplied_products)
        if count >= 3:
            prod_names = [p.name for p in supplied_products]
            risks.append({
                "id": f"RISK-CONCENTRATION-{s.supplier_id}",
                "category": "SUPPLIER_CONCENTRATION",
                "severity": "MEDIUM",
                "score": 60,
                "affected_entity": f"Supplier: {s.name} ({s.supplier_id})",
                "path": f"Supplier({s.name}) -> [:SUPPLIES] -> {count} Products",
                "evidence": f"Supplier {s.name} controls the supply of {count} separate catalog products ({', '.join(prod_names[:3])}{'...' if len(prod_names) > 3 else ''}).",
                "explanation": "High organizational dependency on a single vendor. Any operational breakdown cascades across multiple product lines.",
                "mitigation": "Establish multi-sourcing contracts to reduce total portfolio exposure to below 25% per vendor.",
            })

    # 3. Warehouse Bottleneck Analysis
    for w in Warehouse.objects.prefetch_related("stocks").all():
        util = w.utilization_percentage
        stored = w.total_stock_stored
        if w.capacity > 0 and util >= 80.0:
            risks.append({
                "id": f"RISK-WH-CAPACITY-{w.warehouse_id}",
                "category": "WAREHOUSE_BOTTLENECK",
                "severity": "HIGH" if util >= 90.0 else "MEDIUM",
                "score": 85 if util >= 90.0 else 65,
                "affected_entity": f"Warehouse: {w.name} ({w.warehouse_id})",
                "path": f"Multiple Products -> [:STORED_AT] -> Warehouse({w.name}) [{util}% full]",
                "evidence": f"Warehouse utilization has reached {util}% ({stored}/{w.capacity} units).",
                "explanation": "Impending storage saturation limits incoming replenishment orders and causes handling delays.",
                "mitigation": "Initiate inter-warehouse inventory transfer to secondary distribution centers with available capacity.",
            })

    # 4. Multi-hop Component Dependencies
    for pi in ProductComponent.objects.select_related("product", "component", "component__supplier").all():
        c = pi.component
        p = pi.product
        is_crit = c.is_critical
        supp_name = c.supplier.name if c.supplier else "None"
        supp_count = 1 if c.supplier else 0

        risks.append({
            "id": f"RISK-BOM-{p.product_id}-{c.component_id}",
            "category": "TIER_2_COMPONENT_RISK",
            "severity": "HIGH" if is_crit else "MEDIUM",
            "score": 80 if is_crit else 55,
            "affected_entity": f"Sub-Component: {c.name} for Product: {p.name}",
            "path": f"Supplier({supp_name}) -> Component({c.name}) -> Product({p.name})",
            "evidence": f"Component {c.name} is {'critical' if is_crit else 'vital'} to assembling {p.name} and has {supp_count} vendor(s).",
            "explanation": "Multi-tier supply chain vulnerability. A stockout of this raw part halts the assembly of the finished good.",
            "mitigation": "Increase safety stock for critical components and audit Tier-2 supplier lead times.",
        })

    risks.sort(key=lambda x: x["score"], reverse=True)
    return risks
