
import os
import socket

from cassandra.cluster import Cluster
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "infrastructure",
        ".env",
    )
)

_cassandra_cluster = None
_cassandra_session = None
_neo4j_driver = None


def is_port_open(host: str, port: int, timeout: float = 0.25) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def get_cassandra_session():
    global _cassandra_cluster, _cassandra_session

    if not is_port_open("127.0.0.1", 9042, timeout=1.0):
        raise ConnectionError("Cassandra cluster is not reachable on port 9042.")

    if _cassandra_session is None:
        _cassandra_cluster = Cluster(["127.0.0.1"], connect_timeout=5.0)
        _cassandra_session = _cassandra_cluster.connect("supply_chain")

    return _cassandra_session


def get_neo4j_driver():
    global _neo4j_driver

    if not is_port_open("127.0.0.1", 7687, timeout=1.0):
        raise ConnectionError("Neo4j database is not reachable on port 7687.")

    if _neo4j_driver is None:
        password = os.getenv("NEO4J_PASSWORD")
        if not password:
            raise RuntimeError("NEO4J_PASSWORD is missing from infrastructure/.env")

        _neo4j_driver = GraphDatabase.driver(
            "bolt://127.0.0.1:7687",
            auth=("neo4j", password),
            connection_timeout=5.0,
        )

    return _neo4j_driver

