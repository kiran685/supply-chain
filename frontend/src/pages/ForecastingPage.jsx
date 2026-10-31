import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  TrendingUp,
  Upload,
  Calendar,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";

export default function ForecastingPage({ onNavigate }) {
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [algorithm, setAlgorithm] = useState("EXPONENTIAL_SMOOTHING");
  const [horizon, setHorizon] = useState(14);
  const [forecastResult, setForecastResult] = useState(null);
  const [loadingForecast, setLoadingForecast] = useState(false);

  // Recommendations state
  const [recs, setRecs] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(true);

  // CSV Import state
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const fetchCatalogAndRecs = async () => {
    try {
      const [prodRes, recsRes] = await Promise.all([api.getProducts(), api.getReorderRecommendations()]);
      setProducts(prodRes);
      setRecs(recsRes.recommendations || []);
      if (prodRes.length > 0 && !selectedProductId) {
        setSelectedProductId(prodRes[0].product_id);
      }
    } catch (err) {
      console.error("Failed to load forecasting prerequisites", err);
    } finally {
      setLoadingRecs(false);
    }
  };

  useEffect(() => {
    fetchCatalogAndRecs();
  }, []);

  const runForecast = async () => {
    if (!selectedProductId) return;
    try {
      setLoadingForecast(true);
      const res = await api.getProductForecast(selectedProductId, algorithm, horizon);
      setForecastResult(res);
    } catch (err) {
      console.error("Failed to run forecast", err);
    } finally {
      setLoadingForecast(false);
    }
  };

  useEffect(() => {
    if (selectedProductId) {
      runForecast();
    }
  }, [selectedProductId, algorithm, horizon]);

  const handleCsvUpload = async (e) => {
    e.preventDefault();
    if (!importFile) return;

    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await api.importDemandCsv(formData);
      setImportResult(res);
      // Refresh current forecast and recommendations
      runForecast();
      api.getReorderRecommendations().then((r) => setRecs(r.recommendations || []));
    } catch (err) {
      setImportResult({ success: false, message: err.message, errors: [err.message] });
    } finally {
      setImporting(false);
    }
  };

  // Helper to render pure SVG time-series chart
  const renderTimeSeriesChart = () => {
    if (!forecastResult) return null;
    const history = forecastResult.historical_points || [];
    const future = forecastResult.forecast_points || [];
    const allPoints = [
      ...history.map((h) => ({ date: h.date, val: h.quantity, isFuture: false })),
      ...future.map((f) => ({ date: f.date, val: f.forecast, isFuture: true, lower: f.lower_bound, upper: f.upper_bound })),
    ];

    if (allPoints.length === 0) {
      return <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px" }}>No time series data points to plot.</p>;
    }

    const width = 850;
    const height = 240;
    const padding = 40;

    const maxVal = Math.max(...allPoints.map((p) => p.upper || p.val), 10) * 1.15;
    const minVal = 0;

    const getX = (idx) => padding + (idx / Math.max(1, allPoints.length - 1)) * (width - 2 * padding);
    const getY = (val) => height - padding - ((val - minVal) / (maxVal - minVal)) * (height - 2 * padding);

    // Build historical path
    const histPoints = allPoints.filter((p) => !p.isFuture);
    const histPath = histPoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(p.val)}`)
      .join(" ");

    // Build future path starting from last historical point
    const futIdxOffset = histPoints.length - 1;
    const futPoints = allPoints.slice(futIdxOffset);
    const futPath = futPoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(futIdxOffset + i)} ${getY(p.val)}`)
      .join(" ");

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        {/* Horizontal gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const val = Math.round(maxVal * pct);
          const y = getY(val);
          return (
            <g key={i}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <text x={padding - 8} y={y + 4} fill="#64748B" fontSize="10" textAnchor="end">
                {val}
              </text>
            </g>
          );
        })}

        {/* Historical Line */}
        {histPoints.length > 0 && (
          <path d={histPath} fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" />
        )}

        {/* Forecast Line */}
        {futPoints.length > 1 && (
          <path d={futPath} fill="none" stroke="#A855F7" strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" />
        )}

        {/* Points */}
        {allPoints.map((p, idx) => (
          <circle
            key={idx}
            cx={getX(idx)}
            cy={getY(p.val)}
            r={p.isFuture ? 3.5 : 3}
            fill={p.isFuture ? "#A855F7" : "#38BDF8"}
            stroke="#0A0E17"
            strokeWidth="1.5"
          >
            <title>{`${p.date}: ${p.val} units ${p.isFuture ? "(Forecast)" : "(Actual)"}`}</title>
          </circle>
        ))}

        {/* Legend */}
        <g transform={`translate(${width - 240}, 15)`}>
          <line x1="0" y1="0" x2="20" y2="0" stroke="#38BDF8" strokeWidth="2.5" />
          <text x="26" y="4" fill="#94A3B8" fontSize="11">Actual History</text>
          <line x1="110" y1="0" x2="130" y2="0" stroke="#A855F7" strokeWidth="2.5" strokeDasharray="4 3" />
          <text x="136" y="4" fill="#94A3B8" fontSize="11">Forecast ({horizon}d)</text>
        </g>
      </svg>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>Demand Forecasting & Replenishment</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Time-series algorithms (SES / Moving Average) with holdout validation and formula-driven reorder logic
          </p>
        </div>
      </div>

      {/* CSV Ingestion Card */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FileSpreadsheet size={18} style={{ color: "var(--accent-secondary)" }} />
            <h3 className="card-title">Import Historical Demand CSV</h3>
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Format: product_id (or sku), date (YYYY-MM-DD), quantity
          </span>
        </div>

        <form onSubmit={handleCsvUpload} style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <input
            type="file"
            accept=".csv"
            className="form-control"
            style={{ maxWidth: "340px", padding: "8px 12px" }}
            onChange={(e) => setImportFile(e.target.files[0])}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={importing || !importFile}>
            <Upload size={14} /> {importing ? "Validating & Ingesting..." : "Upload & Validate CSV"}
          </button>
        </form>

        {importResult && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              borderRadius: "8px",
              background: importResult.success ? "var(--status-success-bg)" : "var(--status-danger-bg)",
              border: `1px solid ${importResult.success ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              fontSize: "0.85rem",
            }}
          >
            <div style={{ fontWeight: "700", marginBottom: "4px" }}>
              {importResult.success ? "Import Succeeded" : "Import Validation Issues Encountered"}
            </div>
            <div>
              Processed: {importResult.rows_processed} rows • Accepted: {importResult.rows_imported} • Skipped: {importResult.rows_skipped}
            </div>
            {importResult.errors && importResult.errors.length > 0 && (
              <div style={{ marginTop: "8px", color: "var(--status-danger)", maxHeight: "90px", overflowY: "auto" }}>
                {importResult.errors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Forecast Visualizer Card */}
      <div className="card">
        {/* Controls bar */}
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ flex: 1, minWidth: "240px" }}>
            <label className="form-label">Select Catalog Product</label>
            <select
              className="form-control"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.product_id}>
                  {p.name} ({p.product_id}) - Stock: {p.current_stock}
                </option>
              ))}
            </select>
          </div>

          <div style={{ width: "230px" }}>
            <label className="form-label">Forecasting Algorithm</label>
            <select
              className="form-control"
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
            >
              <option value="EXPONENTIAL_SMOOTHING">Simple Exponential Smoothing (SES)</option>
              <option value="MOVING_AVERAGE">Simple Moving Average (SMA)</option>
            </select>
          </div>

          <div style={{ width: "160px" }}>
            <label className="form-label">Horizon (Days)</label>
            <select
              className="form-control"
              value={horizon}
              onChange={(e) => setHorizon(parseInt(e.target.value))}
            >
              <option value="7">7 Days</option>
              <option value="14">14 Days</option>
              <option value="21">21 Days</option>
              <option value="30">30 Days</option>
            </select>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={runForecast} style={{ alignSelf: "flex-end" }}>
            <RefreshCw size={14} className={loadingForecast ? "spinner" : ""} /> Recalculate
          </button>
        </div>

        {/* Metrics Row */}
        {forecastResult && forecastResult.metrics && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>
            <div style={{ padding: "12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Mean Absolute Error (MAE)</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "800", color: "var(--accent-secondary)" }}>
                {forecastResult.metrics.mae}
              </div>
            </div>

            <div style={{ padding: "12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Root Mean Sq Error (RMSE)</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "800", color: "#A855F7" }}>
                {forecastResult.metrics.rmse}
              </div>
            </div>

            <div style={{ padding: "12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Mean Abs Pct Error (MAPE)</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "800", color: "#34D399" }}>
                {forecastResult.metrics.mape}%
              </div>
            </div>

            <div style={{ padding: "12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Daily Velocity (Units)</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "800", color: "var(--text-primary)" }}>
                {forecastResult.average_daily_demand} / day
              </div>
            </div>
          </div>
        )}

        {/* Chart */}
        <div style={{ padding: "16px 0", borderTop: "1px solid var(--border-subtle)" }}>
          {loadingForecast ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Computing time-series forecast...</p>
            </div>
          ) : (
            renderTimeSeriesChart()
          )}
        </div>
      </div>

      {/* Reorder Recommendations Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Intelligent Reorder Recommendations</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Formula: Reorder Point (ROP) = (Daily Demand × Lead Time) + Safety Stock vs. (Current Stock + Confirmed Incoming POs)
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchCatalogAndRecs}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {loadingRecs ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Evaluating inventory replenishment thresholds...</p>
          </div>
        ) : recs.length === 0 ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px" }}>
            No reorder recommendations available.
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Product Name / SKU</th>
                  <th>Current Stock</th>
                  <th>Incoming Orders</th>
                  <th>Effective Stock</th>
                  <th>Lead Time Demand</th>
                  <th>Safety Stock</th>
                  <th>Reorder Point</th>
                  <th>Recommended Qty</th>
                  <th>Urgency</th>
                  <th>Explainable Rationale</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.product_id} style={{ background: r.needs_reorder ? "rgba(239, 68, 68, 0.03)" : "transparent" }}>
                    <td>
                      <div style={{ fontWeight: "700" }}>{r.product_name}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--accent-secondary)" }}>
                        {r.product_id} • {r.sku}
                      </div>
                    </td>
                    <td style={{ fontWeight: "700", color: r.current_stock === 0 ? "var(--status-danger)" : "inherit" }}>
                      {r.current_stock}
                    </td>
                    <td>{r.incoming_quantity > 0 ? `+${r.incoming_quantity}` : "0"}</td>
                    <td style={{ fontWeight: "700" }}>{r.effective_stock}</td>
                    <td>{Math.round(r.average_daily_demand * r.lead_time_days)} units ({r.lead_time_days}d)</td>
                    <td>{r.safety_stock}</td>
                    <td style={{ fontWeight: "700", color: "var(--accent-secondary)" }}>{r.reorder_point}</td>
                    <td>
                      {r.needs_reorder ? (
                        <span style={{ fontWeight: "800", color: "var(--status-danger)", fontSize: "0.95rem" }}>
                          +{r.suggested_reorder_quantity} units
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Adequate</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          r.urgency === "CRITICAL"
                            ? "badge-danger"
                            : r.urgency === "HIGH"
                            ? "badge-warning"
                            : "badge-success"
                        }`}
                      >
                        {r.urgency}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-secondary)", maxWidth: "320px" }}>
                      {r.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
