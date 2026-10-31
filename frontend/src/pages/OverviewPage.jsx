import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  Package,
  Layers,
  DollarSign,
  AlertTriangle,
  XCircle,
  Truck,
  Warehouse,
  FileText,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from "lucide-react";

export default function OverviewPage({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchDashboard = async () => {
    try {
      setRefreshing(true);
      const res = await api.getDashboardAnalytics();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load dashboard analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading real-time supply chain analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ borderColor: "var(--status-danger)" }}>
        <h3 style={{ color: "var(--status-danger)", marginBottom: "8px" }}>Dashboard Error</h3>
        <p style={{ color: "var(--text-secondary)" }}>{error}</p>
        <button className="btn btn-secondary btn-sm" onClick={fetchDashboard} style={{ marginTop: "16px" }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const { kpis, stock_by_category, warehouse_summaries, recent_movements, critical_low_stock, top_risks } = data;

  return (
    <div>
      {/* Top action bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>Operations Overview</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Live metrics from PostgreSQL, Apache Cassandra, and Neo4j graph engine
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchDashboard} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? "spinner" : ""} /> Refresh Analytics
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Total Catalog Products</span>
            <div className="kpi-icon" style={{ background: "rgba(99, 102, 241, 0.15)", color: "#818CF8" }}>
              <Package size={20} />
            </div>
          </div>
          <div className="kpi-value">{kpis.total_products}</div>
          <div className="kpi-subtitle">Active managed SKUs</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Total Physical Units</span>
            <div className="kpi-icon" style={{ background: "rgba(6, 182, 212, 0.15)", color: "#22D3EE" }}>
              <Layers size={20} />
            </div>
          </div>
          <div className="kpi-value">{kpis.total_inventory_units.toLocaleString()}</div>
          <div className="kpi-subtitle">Stored across all depots</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Inventory Valuation</span>
            <div className="kpi-icon" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34D399" }}>
              <DollarSign size={20} />
            </div>
          </div>
          <div className="kpi-value">${kpis.total_inventory_valuation.toLocaleString()}</div>
          <div className="kpi-subtitle">At current cost basis</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Low / Out of Stock</span>
            <div className="kpi-icon" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#F87171" }}>
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: kpis.low_stock_count > 0 ? "var(--status-danger)" : "var(--text-primary)" }}>
            {kpis.low_stock_count + kpis.out_of_stock_count}
          </div>
          <div className="kpi-subtitle">
            {kpis.out_of_stock_count} stockouts, {kpis.low_stock_count} low
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Graph Risks Identified</span>
            <div className="kpi-icon" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#FBBF24" }}>
              <ShieldAlert size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: "var(--status-warning)" }}>{kpis.open_risks_count}</div>
          <div className="kpi-subtitle">Neo4j topological vulnerabilities</div>
        </div>
      </div>

      {/* Main Grid: Visual Charts & Critical Stock */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px", marginBottom: "28px" }}>
        {/* Category Distribution Chart */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Stock Valuation by Category</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Units & Proportions</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {stock_by_category && stock_by_category.map((cat, idx) => {
              const maxUnits = Math.max(...stock_by_category.map((c) => c.units || 1));
              const pct = Math.round(((cat.units || 0) / maxUnits) * 100);
              const colors = ["#6366F1", "#06B6D4", "#10B981", "#F59E0B", "#EC4899"];
              const color = colors[idx % colors.length];

              return (
                <div key={cat.category}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "600" }}>{cat.category}</span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {cat.units.toLocaleString()} units ({cat.count} products)
                    </span>
                  </div>
                  <div style={{ height: "10px", background: "rgba(255, 255, 255, 0.06)", borderRadius: "6px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: color,
                        borderRadius: "6px",
                        transition: "width 0.8s ease-out",
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Warehouse Utilization */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Warehouse Utilization</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("warehouses")}>
              Manage
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {warehouse_summaries && warehouse_summaries.map((wh) => (
              <div key={wh.warehouse_id} style={{ padding: "12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontWeight: "600", fontSize: "0.88rem" }}>{wh.name}</span>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: "700",
                      color: wh.utilization >= 90 ? "var(--status-danger)" : wh.utilization >= 75 ? "var(--status-warning)" : "var(--status-success)",
                    }}
                  >
                    {wh.utilization}% Full
                  </span>
                </div>
                <div style={{ height: "8px", background: "rgba(255, 255, 255, 0.08)", borderRadius: "4px", overflow: "hidden", marginBottom: "6px" }}>
                  <div
                    style={{
                      width: `${wh.utilization}%`,
                      height: "100%",
                      background: wh.utilization >= 90 ? "var(--status-danger)" : wh.utilization >= 75 ? "var(--status-warning)" : "var(--status-success)",
                      borderRadius: "4px",
                    }}
                  ></div>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {wh.stored_units.toLocaleString()} / {wh.capacity.toLocaleString()} units capacity
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Second Row: Critical Low Stock & Graph Risks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "28px" }}>
        {/* Critical Low Stock */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Critical Stock Alerts</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("forecasting")}>
              Reorder Action
            </button>
          </div>
          {critical_low_stock && critical_low_stock.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Stock</th>
                    <th>Min</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {critical_low_stock.map((item) => (
                    <tr key={item.product_id}>
                      <td style={{ fontWeight: "600" }}>{item.name}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>{item.sku}</td>
                      <td style={{ fontWeight: "700", color: item.current_stock === 0 ? "var(--status-danger)" : "var(--status-warning)" }}>
                        {item.current_stock}
                      </td>
                      <td>{item.min_threshold}</td>
                      <td>
                        <span className={`badge ${item.status === "OUT_OF_STOCK" ? "badge-danger" : "badge-warning"}`}>
                          {item.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>All product stocks are currently optimal.</p>
          )}
        </div>

        {/* Top Graph Risks Preview */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Neo4j Supply Chain Risks</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("supply-chain")}>
              Graph Visualizer
            </button>
          </div>
          <div>
            {top_risks && top_risks.slice(0, 3).map((risk) => (
              <div key={risk.id} className={`risk-card ${risk.severity.toLowerCase()}`}>
                <div className="risk-title">
                  <span className="risk-entity">{risk.affected_entity}</span>
                  <span className={`badge ${risk.severity === "CRITICAL" ? "badge-danger" : risk.severity === "HIGH" ? "badge-warning" : "badge-info"}`}>
                    {risk.severity} (Score {risk.score})
                  </span>
                </div>
                <div className="risk-path">{risk.path}</div>
                <div className="risk-explanation">{risk.explanation}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Movements Ledger */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Stock Movement Audit Ledger</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("inventory")}>
            Full History
          </button>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Movement ID</th>
                <th>Product</th>
                <th>Depot</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Reference</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recent_movements && recent_movements.map((mov) => (
                <tr key={mov.movement_id}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--accent-secondary)" }}>
                    {mov.movement_id}
                  </td>
                  <td style={{ fontWeight: "600" }}>{mov.product_name}</td>
                  <td>{mov.warehouse_name}</td>
                  <td>
                    <span
                      className={`badge ${
                        mov.movement_type === "IN"
                          ? "badge-success"
                          : mov.movement_type === "OUT"
                          ? "badge-danger"
                          : "badge-info"
                      }`}
                    >
                      {mov.movement_type}
                    </span>
                  </td>
                  <td style={{ fontWeight: "700" }}>{mov.quantity > 0 ? `+${mov.quantity}` : mov.quantity}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{mov.reference_id || "—"}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                    {new Date(mov.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
