# Intelligent Inventory & Supply Chain Management System (SupplyIQ)

An enterprise-grade, multi-database inventory and supply chain management platform combining relational transactions (Django / SQLite), distributed high-throughput time-series audit ledgers (Apache Cassandra), and multi-tier dependency risk discovery (Neo4j Graph DBMS).

---

## 🏗️ Architecture & Technology Stack

- **Frontend:** React 19, Vite, Lucide Icons, Vanilla CSS Design System (Sleek Dark Theme)
- **Backend:** Python 3.12+, Django REST Framework (DRF)
- **Time-Series Movement Ledger:** Apache Cassandra 5.0 (Docker)
- **Supply Chain Knowledge Graph:** Neo4j 5 Graph DBMS (Docker)
- **Infrastructure Orchestration:** Docker Compose

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Docker & Docker Desktop
- Python 3.11+
- Node.js 18+ & npm

### 2. Infrastructure Setup (Cassandra & Neo4j)
From the project root:
```bash
cd infrastructure
# Ensure .env is populated (see .env.example)
docker compose up -d
```
Verify containers are healthy:
```bash
docker ps
```
- Cassandra port: `9042`
- Neo4j ports: `7474` (HTTP browser), `7687` (Bolt protocol)

### 3. Backend Setup (Django REST Framework)
From the `backend/` directory:
```bash
cd backend
python -m venv .venv

# On Windows:
.\.venv\Scripts\activate

# Install dependencies:
pip install django djangorestframework django-cors-headers cassandra-driver neo4j python-dotenv

# Run migrations:
python manage.py migrate

# Seed demonstration data across SQLite, Cassandra, and Neo4j:
python manage.py seed_data

# Start backend server:
python manage.py runserver 127.0.0.1:8000
```

### 4. Frontend Setup (React + Vite)
From the `frontend/` directory:
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5175/](http://localhost:5175/) in your browser.

---

## 📊 Core Features

1. **Executive Dashboard Overview:** Live inventory valuation, low stock warnings, category breakdowns, and critical supply chain bottleneck warnings.
2. **Transactional Inventory Operations:** Real-time Stock-In, Stock-Out (preventing negative inventory), Warehouse Transfers, and Stock Reconciliations.
3. **Dual-Write Time-Series Audit Log:** Every inventory transaction is recorded relationally and synchronized into Apache Cassandra for high-volume append-only audit tracking.
4. **Supply Chain Risk Analysis (Neo4j):** Interactive graph modeling showing multi-tier dependencies (Suppliers -> Components -> Products -> Warehouses), identifying single points of failure, bottleneck suppliers, and critical stock exposure.
5. **Demand Forecasting & Reorder Recommendations:** Exponential smoothing demand forecasting and automated reorder calculations based on lead times and safety stock.
6. **Purchase Order Lifecycle:** Full lifecycle management (Draft -> Submitted -> Approved -> Ordered -> Received).

---

## 🛠️ Cassandra CLI Inspection

Inspect Cassandra time-series movement records directly via CQL shell:
```bash
docker exec -it supply-chain-cassandra cqlsh 127.0.0.1 9042
```
```sql
USE supply_chain;
SELECT * FROM inventory_movements LIMIT 10;
```

---

## 📜 License
MIT License.
