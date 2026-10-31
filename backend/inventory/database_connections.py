
import os
import socket

from cassandra.cluster import Cluster
from neo4j import GraphDatabase
from dotenv import load_dotenv

# Load the environment variables from infrastructure/.env
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
ENV_FILE = os.path.join(PROJECT_ROOT, "infrastructure", ".env")

load_dotenv(ENV_FILE)


def is_port_open(host: str, port: int, timeout: float = 0.25) -> bool:
    """Fast socket probe to determine whether a service port is listening."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def check_cassandra():
    if not is_port_open("127.0.0.1", 9042, timeout=1.0):
        return {"status": "error", "message": "Cassandra service is offline (port 9042 closed)."}

    cluster = None
    try:
        cluster = Cluster(["127.0.0.1"], port=9042, connect_timeout=5.0)
        session = cluster.connect()
        session.execute("SELECT release_version FROM system.local")
        return {"status": "connected"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
    finally:
        if cluster is not None:
            try:
                cluster.shutdown()
            except Exception:
                pass


def check_neo4j():
    if not is_port_open("127.0.0.1", 7687, timeout=1.0):
        return {"status": "error", "message": "Neo4j service is offline (port 7687 closed)."}

    uri = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
    username = os.getenv("NEO4J_USERNAME", "neo4j")
    password = os.getenv("NEO4J_PASSWORD")

    if not password:
        return {
            "status": "error",
            "message": "NEO4J_PASSWORD is missing from infrastructure/.env",
        }

    driver = None
    try:
        driver = GraphDatabase.driver(
            uri,
            auth=(username, password),
            connection_timeout=5.0,
        )
        driver.verify_connectivity()
        return {"status": "connected"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
    finally:
        if driver is not None:
            try:
                driver.close()
            except Exception:
                pass
