import logging
from datetime import datetime, date
from cassandra.cluster import Cluster
from cassandra.query import SimpleStatement
from .db_connections import get_cassandra_session

logger = logging.getLogger(__name__)

INSERT_MOVEMENT_CQL = """
    INSERT INTO supply_chain.inventory_movements (
        product_id, movement_date, movement_time, movement_type, quantity, reference_id, warehouse_id
    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
"""


def log_movement_to_cassandra(product_id: str, movement_date: date, movement_time: datetime,
                              movement_type: str, quantity: int, reference_id: str, warehouse_id: str) -> bool:
    """
    Safely writes inventory movement to the Cassandra time-series table.
    Catches exceptions to prevent breaking the relational transaction, while logging any issue.
    """
    try:
        session = get_cassandra_session()
        session.execute(
            INSERT_MOVEMENT_CQL,
            (
                str(product_id),
                movement_date,
                movement_time,
                str(movement_type),
                int(quantity),
                str(reference_id or ""),
                str(warehouse_id),
            ),
        )
        return True
    except Exception as exc:
        logger.warning(f"Failed to log movement to Cassandra: {exc}")
        return False


def get_cassandra_movements_by_product(product_id: str, movement_date: date, limit: int = 50):
    """
    Queries Cassandra using the partition key ((product_id, movement_date)).
    """
    try:
        session = get_cassandra_session()
        cql = """
            SELECT product_id, movement_date, movement_time, movement_type, quantity, reference_id, warehouse_id
            FROM supply_chain.inventory_movements
            WHERE product_id = %s AND movement_date = %s
            LIMIT %s
        """
        rows = session.execute(cql, (str(product_id), movement_date, limit))
        return [
            {
                "product_id": r.product_id,
                "movement_date": str(r.movement_date),
                "movement_time": r.movement_time.isoformat() if r.movement_time else None,
                "movement_type": r.movement_type,
                "quantity": r.quantity,
                "reference_id": r.reference_id,
                "warehouse_id": r.warehouse_id,
            }
            for r in rows
        ]
    except Exception as exc:
        logger.warning(f"Error querying Cassandra movements: {exc}")
        return []
