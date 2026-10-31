import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Package,
  Layers,
  Warehouse,
  Truck,
  ShoppingCart,
  TrendingUp,
  ShieldAlert,
  FileText,
  Settings,
  Activity,
  Database,
} from "lucide-react";
import OverviewPage from "./pages/OverviewPage";
import ProductsPage from "./pages/ProductsPage";
import InventoryPage from "./pages/InventoryPage";
import WarehousesPage from "./pages/WarehousesPage";
import SuppliersPage from "./pages/SuppliersPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import ForecastingPage from "./pages/ForecastingPage";
import SupplyChainRiskPage from "./pages/SupplyChainRiskPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import { api } from "./api";

export default function App() {
  const [currentPage, setCurrentPage] = useState("overview");
  const [dbStatus, setDbStatus] = useState("checking");
  const [openRisksCount, setOpenRisksCount] = useState(0);

  useEffect(() => {
    // Check background health and open risks
    api
      .getDatabaseHealth()
      .then((res) => {
        const ok =
          res.databases?.cassandra?.status === "connected" &&
          res.databases?.neo4j?.status === "connected";
        setDbStatus(ok ? "healthy" : "degraded");
      })
      .catch(() => setDbStatus("offline"));

    api
      .getSupplyChainRisks()
      .then((res) => setOpenRisksCount(res.count || 0))
      .catch(() => {});
  }, [currentPage]);

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "products", label: "Products", icon: Package },
    { id: "inventory", label: "Inventory & Stock", icon: Layers },
    { id: "warehouses", label: "Warehouses", icon: Warehouse },
    { id: "suppliers", label: "Suppliers", icon: Truck },
    { id: "orders", label: "Purchase Orders", icon: ShoppingCart },
    { id: "forecasting", label: "Demand Forecasting", icon: TrendingUp },
    {
      id: "supply-chain",
      label: "Supply-Chain Risk",
      icon: ShieldAlert,
      badge: openRisksCount > 0 ? openRisksCount : null,
    },
    { id: "reports", label: "Reports & Export", icon: FileText },
    { id: "settings", label: "Settings & Health", icon: Settings },
  ];

  const renderPage = () => {
    switch (currentPage) {
      case "overview":
        return <OverviewPage onNavigate={setCurrentPage} />;
      case "products":
        return <ProductsPage />;
      case "inventory":
        return <InventoryPage />;
      case "warehouses":
        return <WarehousesPage />;
      case "suppliers":
        return <SuppliersPage />;
      case "orders":
        return <PurchaseOrdersPage />;
      case "forecasting":
        return <ForecastingPage onNavigate={setCurrentPage} />;
      case "supply-chain":
        return <SupplyChainRiskPage />;
      case "reports":
        return <ReportsPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <OverviewPage onNavigate={setCurrentPage} />;
    }
  };

  const currentNav = navItems.find((n) => n.id === currentPage) || navItems[0];

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-logo-icon">
            <Activity size={22} />
          </div>
          <div className="brand-text">
            <h1>SupplyIQ</h1>
            <span>Intelligent SCM</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => setCurrentPage(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div
            className="status-dot"
            style={{
              backgroundColor:
                dbStatus === "healthy"
                  ? "var(--status-success)"
                  : dbStatus === "degraded"
                  ? "var(--status-warning)"
                  : "var(--status-danger)",
            }}
          ></div>
          <div style={{ fontSize: "0.76rem" }}>
            <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>
              Cassandra & Neo4j
            </div>
            <div style={{ color: "var(--text-muted)" }}>
              {dbStatus === "healthy"
                ? "Active & Connected"
                : dbStatus === "checking"
                ? "Checking Status..."
                : "Degraded Connection"}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content View */}
      <div className="main-wrapper">
        <header className="top-navbar">
          <div className="page-title">
            <h2>{currentNav.label}</h2>
            <p>Intelligent Inventory & Supply Chain Management System</p>
          </div>

          <div className="top-actions">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 12px",
                background: "rgba(255, 255, 255, 0.04)",
                borderRadius: "var(--radius-full)",
                fontSize: "0.78rem",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <Database size={13} style={{ color: "var(--accent-secondary)" }} />
              <span>Multi-DB: SQLite + Cassandra 5.0 + Neo4j 5</span>
            </div>
          </div>
        </header>

        <main className="content-body">{renderPage()}</main>
      </div>
    </div>
  );
}
