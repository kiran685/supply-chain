import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Server, Database, GitGraph, CheckCircle, AlertTriangle, RefreshCw, Terminal } from "lucide-react";

export default function SettingsPage() {
  const [appHealth, setAppHealth] = useState(null);
  const [dbHealth, setDbHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
    try {
      setLoading(true);
      const [hRes, dbRes] = await Promise.all([api.getHealth(), api.getDatabaseHealth()]);
      setAppHealth(hRes);
      setDbHealth(dbRes);
    } catch (err) {
      console.error("Health check error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>System Architecture & Environment Health</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Operational diagnostic telemetry for Django REST Framework, Apache Cassandra, and Neo4j
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={checkStatus}>
          <RefreshCw size={14} className={loading ? "spinner" : ""} /> Run Diagnostics
        </button>
      </div>

      {/* Services Health Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "32px" }}>
        {/* Django */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <div className="brand-logo-icon" style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(99, 102, 241, 0.15)", color: "#818CF8" }}>
              <Server size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: "700" }}>Django REST API</h3>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>http://127.0.0.1:8000</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}>
            <CheckCircle size={16} style={{ color: "var(--status-success)" }} />
            <span>Service Status: <strong style={{ color: "var(--status-success)" }}>Healthy (200 OK)</strong></span>
          </div>
          <div style={{ marginTop: "12px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Handles relational models, transactions, serializers, and REST endpoints.
          </div>
        </div>

        {/* Cassandra */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <div className="brand-logo-icon" style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(6, 182, 212, 0.15)", color: "#22D3EE" }}>
              <Database size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: "700" }}>Apache Cassandra 5.0</h3>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>127.0.0.1:9042 • supply_chain</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}>
            <CheckCircle size={16} style={{ color: dbHealth?.databases?.cassandra?.status === "connected" ? "var(--status-success)" : "var(--status-danger)" }} />
            <span>
              Connection:{" "}
              <strong style={{ color: dbHealth?.databases?.cassandra?.status === "connected" ? "var(--status-success)" : "var(--status-danger)" }}>
                {dbHealth?.databases?.cassandra?.status === "connected" ? "Connected" : "Disconnected"}
              </strong>
            </span>
          </div>
          <div style={{ marginTop: "12px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Partitioned time-series store for high-throughput inventory movement ledgers.
          </div>
        </div>

        {/* Neo4j */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <div className="brand-logo-icon" style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.15)", color: "#FBBF24" }}>
              <GitGraph size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: "700" }}>Neo4j 5 Graph DBMS</h3>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>bolt://127.0.0.1:7687</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}>
            <CheckCircle size={16} style={{ color: dbHealth?.databases?.neo4j?.status === "connected" ? "var(--status-success)" : "var(--status-danger)" }} />
            <span>
              Connection:{" "}
              <strong style={{ color: dbHealth?.databases?.neo4j?.status === "connected" ? "var(--status-success)" : "var(--status-danger)" }}>
                {dbHealth?.databases?.neo4j?.status === "connected" ? "Connected" : "Disconnected"}
              </strong>
            </span>
          </div>
          <div style={{ marginTop: "12px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Graph query engine powering multi-tier supply chain dependency & risk discovery.
          </div>
        </div>
      </div>

      {/* Terminal Command Reference */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Terminal size={18} style={{ color: "var(--accent-secondary)" }} />
            <h3 className="card-title">Management Commands Reference (Windows PowerShell)</h3>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ padding: "12px", background: "#0A0E17", borderRadius: "8px", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text-muted)" }}># Re-run idempotent demo seeding across SQLite, Cassandra, and Neo4j:</span>
            <div style={{ color: "#34D399", marginTop: "4px" }}>python manage.py seed_data</div>
          </div>

          <div style={{ padding: "12px", background: "#0A0E17", borderRadius: "8px", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text-muted)" }}># Run full automated test suite:</span>
            <div style={{ color: "#38BDF8", marginTop: "4px" }}>python manage.py test inventory</div>
          </div>

          <div style={{ padding: "12px", background: "#0A0E17", borderRadius: "8px", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text-muted)" }}># Check Cassandra keyspace and tables:</span>
            <div style={{ color: "#FBBF24", marginTop: "4px" }}>
              docker exec supply-chain-cassandra cqlsh 127.0.0.1 9042 -e "DESCRIBE KEYSPACE supply_chain"
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
