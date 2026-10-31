import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  ShieldAlert,
  GitGraph,
  RefreshCw,
  AlertOctagon,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Filter,
} from "lucide-react";

export default function SupplyChainRiskPage() {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("");
  const [syncMessage, setSyncMessage] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [gData, rData] = await Promise.all([
        api.getSupplyChainGraph(),
        api.getSupplyChainRisks(severityFilter),
      ]);
      setGraphData(gData);
      setRisks(rData.risks || []);
    } catch (err) {
      console.error("Failed to load supply chain risk graph", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [severityFilter]);

  const handleSyncGraph = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await api.syncSupplyChainGraph();
      setSyncMessage(res.message);
      fetchData();
    } catch (err) {
      alert("Error syncing graph: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  // Pure SVG Interactive Force / Circular Network Layout
  const renderGraphNetwork = () => {
    const { nodes, edges } = graphData;
    if (!nodes || nodes.length === 0) {
      return (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
          No graph data found in Neo4j. Click "Synchronize Relational Data to Neo4j" below.
        </div>
      );
    }

    const width = 860;
    const height = 460;
    const centerX = width / 2;
    const centerY = height / 2;

    // Distribute nodes by types across concentric layers
    // Suppliers: top/outer layer, Products: middle layer, Warehouses: right layer, Components: left layer
    const nodePositions = {};
    const typeColors = {
      Supplier: "#F59E0B",
      Product: "#6366F1",
      Warehouse: "#10B981",
      Component: "#EC4899",
      Unknown: "#94A3B8",
    };

    const suppliers = nodes.filter((n) => n.type === "Supplier");
    const products = nodes.filter((n) => n.type === "Product");
    const warehouses = nodes.filter((n) => n.type === "Warehouse");
    const components = nodes.filter((n) => n.type === "Component");

    // Position Suppliers across top arc
    suppliers.forEach((n, i) => {
      const angle = Math.PI + (i + 0.5) * (Math.PI / Math.max(1, suppliers.length));
      nodePositions[n.id] = {
        x: centerX + 320 * Math.cos(angle),
        y: centerY - 150 + 40 * Math.sin(angle),
      };
    });

    // Position Products in central ellipse
    products.forEach((n, i) => {
      const angle = (i * 2 * Math.PI) / Math.max(1, products.length);
      nodePositions[n.id] = {
        x: centerX + 180 * Math.cos(angle),
        y: centerY + 50 * Math.sin(angle),
      };
    });

    // Position Warehouses across bottom arc
    warehouses.forEach((n, i) => {
      const angle = (i + 0.5) * (Math.PI / Math.max(1, warehouses.length));
      nodePositions[n.id] = {
        x: centerX + 280 * Math.cos(angle),
        y: centerY + 140 + 30 * Math.sin(angle),
      };
    });

    // Position Components on left cluster
    components.forEach((n, i) => {
      nodePositions[n.id] = {
        x: 90 + (i % 2) * 50,
        y: centerY - 70 + i * 75,
      };
    });

    // Fallback for any other node
    nodes.forEach((n, i) => {
      if (!nodePositions[n.id]) {
        nodePositions[n.id] = { x: centerX + (i * 30 - 60), y: centerY };
      }
    });

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: "#0D131F", borderRadius: "12px", border: "1px solid var(--border-subtle)" }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#4B5563" />
          </marker>
        </defs>

        {/* Draw Edges */}
        {edges.map((e, idx) => {
          const src = nodePositions[e.source];
          const tgt = nodePositions[e.target];
          if (!src || !tgt) return null;

          const isHighlighted = selectedNode && (selectedNode.id === e.source || selectedNode.id === e.target);

          return (
            <g key={idx}>
              <line
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={isHighlighted ? "#A5B4FC" : "#334155"}
                strokeWidth={isHighlighted ? 2.5 : 1.2}
                strokeDasharray={e.type === "DEPENDS_ON" ? "4 3" : "none"}
                markerEnd="url(#arrow)"
              />
            </g>
          );
        })}

        {/* Draw Nodes */}
        {nodes.map((n) => {
          const pos = nodePositions[n.id] || { x: centerX, y: centerY };
          const color = typeColors[n.type] || "#94A3B8";
          const isSelected = selectedNode?.id === n.id;

          return (
            <g
              key={n.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ cursor: "pointer" }}
              onClick={() => setSelectedNode(n)}
            >
              <circle
                r={isSelected ? 18 : 14}
                fill={color}
                stroke={isSelected ? "#FFF" : "#0A0E17"}
                strokeWidth={isSelected ? 3 : 2}
                filter="drop-shadow(0 2px 6px rgba(0,0,0,0.5))"
              />
              <text
                y="26"
                textAnchor="middle"
                fill="#F1F5F9"
                fontSize="10"
                fontWeight="600"
                style={{ pointerEvents: "none", textShadow: "0 1px 3px #000" }}
              >
                {n.label?.length > 18 ? `${n.label.slice(0, 16)}...` : n.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>Neo4j Supply Chain Risk Analysis</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Topological graph queries identifying single-source bottlenecks, vendor concentration, and multi-tier component dependencies
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-primary" onClick={handleSyncGraph} disabled={syncing}>
            <GitGraph size={16} className={syncing ? "spinner" : ""} />
            {syncing ? "Synchronizing to Neo4j..." : "Sync Graph from Relational DB"}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div style={{ padding: "12px 16px", background: "var(--status-success-bg)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "var(--status-success)", borderRadius: "8px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle2 size={16} /> {syncMessage}
        </div>
      )}

      {/* Interactive Graph Card */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <GitGraph size={18} style={{ color: "var(--accent-secondary)" }} />
            <h3 className="card-title">Live Supply Chain Network Topology (Neo4j)</h3>
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: "14px", fontSize: "0.78rem" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#F59E0B" }}></span> Supplier
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#6366F1" }}></span> Product
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#10B981" }}></span> Warehouse
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#EC4899" }}></span> Component
            </span>
          </div>
        </div>

        {renderGraphNetwork()}

        {selectedNode && (
          <div style={{ marginTop: "14px", padding: "12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span className="badge badge-info" style={{ marginRight: "8px" }}>{selectedNode.type}</span>
              <strong>{selectedNode.label}</strong> ({selectedNode.id})
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedNode(null)}>
              Clear Selection
            </button>
          </div>
        )}
      </div>

      {/* Risk Analysis Section */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Explainable Risk Detection & Mitigations</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Evaluated with parameterized Cypher queries running on the active Neo4j graph
            </p>
          </div>

          {/* Severity Filter */}
          <div style={{ display: "flex", gap: "8px" }}>
            {["", "CRITICAL", "HIGH", "MEDIUM"].map((sev) => (
              <button
                key={sev}
                className={`btn btn-sm ${severityFilter === sev ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setSeverityFilter(sev)}
              >
                {sev || "All Severities"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Running graph topological algorithms...</p>
          </div>
        ) : risks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
            <ShieldCheck size={32} style={{ color: "var(--status-success)", marginBottom: "8px" }} />
            <p>No open vulnerabilities detected for the selected filter.</p>
          </div>
        ) : (
          <div>
            {risks.map((risk) => (
              <div key={risk.id} className={`risk-card ${risk.severity.toLowerCase()}`}>
                <div className="risk-title">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <AlertOctagon
                      size={18}
                      style={{
                        color:
                          risk.severity === "CRITICAL"
                            ? "var(--status-danger)"
                            : risk.severity === "HIGH"
                            ? "var(--status-warning)"
                            : "var(--status-info)",
                      }}
                    />
                    <span className="risk-entity">{risk.affected_entity}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span className="badge badge-info">{risk.category.replace(/_/g, " ")}</span>
                    <span
                      className={`badge ${
                        risk.severity === "CRITICAL"
                          ? "badge-danger"
                          : risk.severity === "HIGH"
                          ? "badge-warning"
                          : "badge-info"
                      }`}
                    >
                      {risk.severity} ({risk.score}/100)
                    </span>
                  </div>
                </div>

                <div className="risk-path">{risk.path}</div>

                <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "6px" }}>
                  <strong>Evidence:</strong> {risk.evidence}
                </div>

                <div className="risk-explanation">
                  <strong>Cascading Impact:</strong> {risk.explanation}
                </div>

                <div className="risk-mitigation">
                  <strong>Recommended Action:</strong> {risk.mitigation}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
