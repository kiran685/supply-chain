import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Repeat,
  Sliders,
  Database,
  Search,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState("movements"); // 'movements' | 'balances'
  const [stocks, setStocks] = useState([]);
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterProduct, setFilterProduct] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("");
  const [filterType, setFilterType] = useState("");
  const [useCassandraAudit, setUseCassandraAudit] = useState(false);
  const [cassandraLogs, setCassandraLogs] = useState([]);

  // Operation Modals
  const [activeModal, setActiveModal] = useState(null); // 'IN' | 'OUT' | 'ADJUST' | 'TRANSFER'
  const [submitting, setSubmitting] = useState(false);
  const [opError, setOpError] = useState(null);
  const [opSuccess, setOpSuccess] = useState(null);

  const [inForm, setInForm] = useState({ product_id: "", warehouse_id: "", quantity: 10, reference_id: "", reason: "" });
  const [outForm, setOutForm] = useState({ product_id: "", warehouse_id: "", quantity: 5, reference_id: "", reason: "" });
  const [adjForm, setAdjForm] = useState({ product_id: "", warehouse_id: "", new_quantity: 0, reference_id: "", reason: "" });
  const [xferForm, setXferForm] = useState({
    product_id: "",
    source_warehouse_id: "",
    destination_warehouse_id: "",
    quantity: 10,
    reference_id: "",
    reason: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [stockRes, movRes, prodRes, whRes] = await Promise.all([
        api.getWarehouseStock(),
        api.getMovements({
          product_id: filterProduct,
          warehouse_id: filterWarehouse,
          movement_type: filterType,
          cassandra: useCassandraAudit ? "true" : "false",
        }),
        api.getProducts(),
        api.getWarehouses(),
      ]);
      setStocks(stockRes);
      setMovements(movRes.movements || []);
      setCassandraLogs(movRes.cassandra_records || []);
      setProducts(prodRes);
      setWarehouses(whRes);

      // Default select first product and warehouse
      if (prodRes.length > 0 && whRes.length > 0) {
        setInForm((prev) => ({ ...prev, product_id: prodRes[0].product_id, warehouse_id: whRes[0].warehouse_id }));
        setOutForm((prev) => ({ ...prev, product_id: prodRes[0].product_id, warehouse_id: whRes[0].warehouse_id }));
        setAdjForm((prev) => ({ ...prev, product_id: prodRes[0].product_id, warehouse_id: whRes[0].warehouse_id }));
        setXferForm((prev) => ({
          ...prev,
          product_id: prodRes[0].product_id,
          source_warehouse_id: whRes[0].warehouse_id,
          destination_warehouse_id: whRes[1]?.warehouse_id || whRes[0].warehouse_id,
        }));
      }
    } catch (err) {
      console.error("Failed to load inventory data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterProduct, filterWarehouse, filterType, useCassandraAudit]);

  const handleStockInSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setOpError(null);
    try {
      const res = await api.stockIn({
        ...inForm,
        quantity: parseInt(inForm.quantity),
      });
      setOpSuccess(`Successfully received ${res.added_quantity} units. Movement ID: ${res.movement_id}`);
      setActiveModal(null);
      fetchData();
    } catch (err) {
      setOpError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStockOutSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setOpError(null);
    try {
      const res = await api.stockOut({
        ...outForm,
        quantity: parseInt(outForm.quantity),
      });
      setOpSuccess(`Successfully dispatched ${res.dispatched_quantity} units. Movement ID: ${res.movement_id}`);
      setActiveModal(null);
      fetchData();
    } catch (err) {
      setOpError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setOpError(null);
    try {
      const res = await api.stockAdjustment({
        ...adjForm,
        new_quantity: parseInt(adjForm.new_quantity),
      });
      setOpSuccess(`Stock reconciled: count adjusted to ${res.new_quantity} units. Movement ID: ${res.movement_id}`);
      setActiveModal(null);
      fetchData();
    } catch (err) {
      setOpError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setOpError(null);
    try {
      const res = await api.stockTransfer({
        ...xferForm,
        quantity: parseInt(xferForm.quantity),
      });
      setOpSuccess(`Inter-warehouse transfer completed: ${res.transferred_quantity} units moved. Movement ID: ${res.movement_id}`);
      setActiveModal(null);
      fetchData();
    } catch (err) {
      setOpError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Title & Quick Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>Inventory & Stock Operations</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Execute transactional stock operations synchronized to SQLite, Apache Cassandra, and Neo4j
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-primary" onClick={() => setActiveModal("IN")}>
            <ArrowDownLeft size={16} /> Stock In
          </button>
          <button className="btn btn-secondary" onClick={() => setActiveModal("OUT")}>
            <ArrowUpRight size={16} /> Stock Out
          </button>
          <button className="btn btn-secondary" onClick={() => setActiveModal("TRANSFER")}>
            <Repeat size={16} /> Transfer
          </button>
          <button className="btn btn-secondary" onClick={() => setActiveModal("ADJUST")}>
            <Sliders size={16} /> Adjustment
          </button>
        </div>
      </div>

      {opSuccess && (
        <div style={{ padding: "12px 16px", background: "var(--status-success-bg)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "var(--status-success)", borderRadius: "8px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle size={16} /> {opSuccess}
          </div>
          <button style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }} onClick={() => setOpSuccess(null)}>
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid var(--border-subtle)", marginBottom: "24px" }}>
        <button
          style={{
            padding: "10px 18px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "movements" ? "2px solid var(--accent-primary)" : "2px solid transparent",
            color: activeTab === "movements" ? "#FFF" : "var(--text-muted)",
            fontWeight: "600",
            cursor: "pointer",
          }}
          onClick={() => setActiveTab("movements")}
        >
          Stock Movements Ledger
        </button>
        <button
          style={{
            padding: "10px 18px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "balances" ? "2px solid var(--accent-primary)" : "2px solid transparent",
            color: activeTab === "balances" ? "#FFF" : "var(--text-muted)",
            fontWeight: "600",
            cursor: "pointer",
          }}
          onClick={() => setActiveTab("balances")}
        >
          Stock Balances by Warehouse
        </button>
      </div>

      {activeTab === "movements" ? (
        <div>
          {/* Filters Bar */}
          <div className="filter-bar">
            <select
              className="form-control"
              style={{ width: "200px" }}
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
            >
              <option value="">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.product_id}>
                  {p.name} ({p.product_id})
                </option>
              ))}
            </select>

            <select
              className="form-control"
              style={{ width: "190px" }}
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
            >
              <option value="">All Warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.warehouse_id}>
                  {w.name}
                </option>
              ))}
            </select>

            <select
              className="form-control"
              style={{ width: "160px" }}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All Movement Types</option>
              <option value="IN">IN (Receipt)</option>
              <option value="OUT">OUT (Fulfillment)</option>
              <option value="TRANSFER">TRANSFER</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
            </select>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "var(--accent-secondary)", cursor: "pointer", marginLeft: "auto" }}>
              <input
                type="checkbox"
                checked={useCassandraAudit}
                onChange={(e) => setUseCassandraAudit(e.target.checked)}
              />
              <Database size={14} /> Compare with Cassandra Time-Series
            </label>
          </div>

          {/* Movements Ledger Table */}
          <div className="card">
            {loading ? (
              <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading movement audit trail...</p>
              </div>
            ) : movements.length === 0 ? (
              <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px" }}>
                No stock movements found matching filter criteria.
              </p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Movement ID</th>
                      <th>Product</th>
                      <th>Warehouse</th>
                      <th>Type</th>
                      <th>Quantity</th>
                      <th>Reference</th>
                      <th>Reason / Note</th>
                      <th>Recorded At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--accent-secondary)" }}>
                          {m.movement_id}
                        </td>
                        <td>
                          <div style={{ fontWeight: "600" }}>{m.product_name}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {m.product_id_str}
                          </div>
                        </td>
                        <td>
                          <div>{m.warehouse_name}</div>
                          {m.movement_type === "TRANSFER" && (
                            <div style={{ fontSize: "0.75rem", color: "var(--accent-secondary)" }}>
                              {m.source_warehouse_name} &rarr; {m.destination_warehouse_name}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              m.movement_type === "IN"
                                ? "badge-success"
                                : m.movement_type === "OUT"
                                ? "badge-danger"
                                : m.movement_type === "TRANSFER"
                                ? "badge-info"
                                : "badge-warning"
                            }`}
                          >
                            {m.movement_type}
                          </span>
                        </td>
                        <td style={{ fontWeight: "700" }}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{m.reference_id || "—"}</td>
                        <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{m.reason || "—"}</td>
                        <td style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          {new Date(m.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Stock Balances Table */
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Product ID</th>
                  <th>Warehouse</th>
                  <th>Warehouse Code</th>
                  <th>Quantity on Hand</th>
                  <th>Min Alert Threshold</th>
                  <th>Stock Health</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: "600" }}>{s.product_name}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--accent-secondary)" }}>
                      {s.product_id_str}
                    </td>
                    <td>{s.warehouse_name}</td>
                    <td>{s.warehouse_code}</td>
                    <td style={{ fontWeight: "800", fontSize: "1rem" }}>{s.quantity} units</td>
                    <td>{s.min_threshold} units</td>
                    <td>
                      <span
                        className={`badge ${
                          s.quantity === 0
                            ? "badge-danger"
                            : s.quantity <= s.min_threshold
                            ? "badge-warning"
                            : "badge-success"
                        }`}
                      >
                        {s.quantity === 0 ? "Depleted" : s.quantity <= s.min_threshold ? "Low Balance" : "Normal"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODALS */}

      {/* Stock In Modal */}
      {activeModal === "IN" && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Record Stock In (Receipt)</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            {opError && <div style={{ padding: "10px", background: "var(--status-danger-bg)", color: "var(--status-danger)", borderRadius: "6px", marginBottom: "14px", fontSize: "0.85rem" }}>{opError}</div>}
            <form onSubmit={handleStockInSubmit}>
              <div className="form-group">
                <label className="form-label">Product</label>
                <select className="form-control" value={inForm.product_id} onChange={(e) => setInForm({ ...inForm, product_id: e.target.value })}>
                  {products.map((p) => <option key={p.id} value={p.product_id}>{p.name} ({p.product_id})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Destination Warehouse</label>
                <select className="form-control" value={inForm.warehouse_id} onChange={(e) => setInForm({ ...inForm, warehouse_id: e.target.value })}>
                  {warehouses.map((w) => <option key={w.id} value={w.warehouse_id}>{w.name} ({w.code})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Quantity to Add *</label>
                <input type="number" min="1" className="form-control" required value={inForm.quantity} onChange={(e) => setInForm({ ...inForm, quantity: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Reference Number (PO / Waybill)</label>
                <input type="text" className="form-control" placeholder="e.g. PO-2026-0042" value={inForm.reference_id} onChange={(e) => setInForm({ ...inForm, reference_id: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Reason / Notes</label>
                <input type="text" className="form-control" placeholder="Supplier consignment receipt" value={inForm.reason} onChange={(e) => setInForm({ ...inForm, reason: e.target.value })} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Processing..." : "Confirm Stock In"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Out Modal */}
      {activeModal === "OUT" && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Record Stock Out (Fulfillment / Dispatch)</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            {opError && <div style={{ padding: "10px", background: "var(--status-danger-bg)", color: "var(--status-danger)", borderRadius: "6px", marginBottom: "14px", fontSize: "0.85rem" }}>{opError}</div>}
            <form onSubmit={handleStockOutSubmit}>
              <div className="form-group">
                <label className="form-label">Product</label>
                <select className="form-control" value={outForm.product_id} onChange={(e) => setOutForm({ ...outForm, product_id: e.target.value })}>
                  {products.map((p) => <option key={p.id} value={p.product_id}>{p.name} ({p.product_id})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Source Warehouse</label>
                <select className="form-control" value={outForm.warehouse_id} onChange={(e) => setOutForm({ ...outForm, warehouse_id: e.target.value })}>
                  {warehouses.map((w) => <option key={w.id} value={w.warehouse_id}>{w.name} ({w.code})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Quantity to Dispatch *</label>
                <input type="number" min="1" className="form-control" required value={outForm.quantity} onChange={(e) => setOutForm({ ...outForm, quantity: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Reference Number (Sales Order / Invoice)</label>
                <input type="text" className="form-control" placeholder="e.g. SO-98124" value={outForm.reference_id} onChange={(e) => setOutForm({ ...outForm, reference_id: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Reason / Purpose</label>
                <input type="text" className="form-control" placeholder="Customer order dispatch" value={outForm.reason} onChange={(e) => setOutForm({ ...outForm, reason: e.target.value })} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Processing..." : "Confirm Stock Out"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Transfer Modal */}
      {activeModal === "TRANSFER" && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Inter-Warehouse Transfer</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            {opError && <div style={{ padding: "10px", background: "var(--status-danger-bg)", color: "var(--status-danger)", borderRadius: "6px", marginBottom: "14px", fontSize: "0.85rem" }}>{opError}</div>}
            <form onSubmit={handleTransferSubmit}>
              <div className="form-group">
                <label className="form-label">Product</label>
                <select className="form-control" value={xferForm.product_id} onChange={(e) => setXferForm({ ...xferForm, product_id: e.target.value })}>
                  {products.map((p) => <option key={p.id} value={p.product_id}>{p.name} ({p.product_id})</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">From Source Warehouse *</label>
                  <select className="form-control" value={xferForm.source_warehouse_id} onChange={(e) => setXferForm({ ...xferForm, source_warehouse_id: e.target.value })}>
                    {warehouses.map((w) => <option key={w.id} value={w.warehouse_id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">To Destination Warehouse *</label>
                  <select className="form-control" value={xferForm.destination_warehouse_id} onChange={(e) => setXferForm({ ...xferForm, destination_warehouse_id: e.target.value })}>
                    {warehouses.map((w) => <option key={w.id} value={w.warehouse_id}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Quantity to Transfer *</label>
                <input type="number" min="1" className="form-control" required value={xferForm.quantity} onChange={(e) => setXferForm({ ...xferForm, quantity: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Transfer Reference ID</label>
                <input type="text" className="form-control" placeholder="e.g. TR-2026-X1" value={xferForm.reference_id} onChange={(e) => setXferForm({ ...xferForm, reference_id: e.target.value })} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Transferring..." : "Execute Transfer"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {activeModal === "ADJUST" && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Reconcile Stock Count (Adjustment)</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            {opError && <div style={{ padding: "10px", background: "var(--status-danger-bg)", color: "var(--status-danger)", borderRadius: "6px", marginBottom: "14px", fontSize: "0.85rem" }}>{opError}</div>}
            <form onSubmit={handleAdjustmentSubmit}>
              <div className="form-group">
                <label className="form-label">Product</label>
                <select className="form-control" value={adjForm.product_id} onChange={(e) => setAdjForm({ ...adjForm, product_id: e.target.value })}>
                  {products.map((p) => <option key={p.id} value={p.product_id}>{p.name} ({p.product_id})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Warehouse</label>
                <select className="form-control" value={adjForm.warehouse_id} onChange={(e) => setAdjForm({ ...adjForm, warehouse_id: e.target.value })}>
                  {warehouses.map((w) => <option key={w.id} value={w.warehouse_id}>{w.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Actual Counted Quantity *</label>
                <input type="number" min="0" className="form-control" required value={adjForm.new_quantity} onChange={(e) => setAdjForm({ ...adjForm, new_quantity: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Audit Reason *</label>
                <input type="text" className="form-control" required placeholder="e.g. Quarterly physical cycle count discrepancy" value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving..." : "Save Count Adjustment"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
