import React, { useEffect, useState } from "react";
import { api } from "../api";
import { ShoppingCart, Plus, CheckCircle, Clock, PackageCheck, AlertCircle, RefreshCw } from "lucide-react";

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [formData, setFormData] = useState({
    po_number: "",
    supplier: "",
    destination_warehouse: "",
    notes: "",
    items: [{ product_id: "", quantity: 50, unit_cost: 10.0 }],
  });

  const [receiveInputs, setReceiveInputs] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [poRes, suppRes, whRes, prodRes] = await Promise.all([
        api.getPurchaseOrders(),
        api.getSuppliers(),
        api.getWarehouses(),
        api.getProducts(),
      ]);
      setOrders(poRes);
      setSuppliers(suppRes);
      setWarehouses(whRes);
      setProducts(prodRes);

      if (suppRes.length > 0 && whRes.length > 0 && prodRes.length > 0) {
        setFormData((prev) => ({
          ...prev,
          supplier: suppRes[0].id,
          destination_warehouse: whRes[0].id,
          items: [{ product_id: prodRes[0].id, quantity: 50, unit_cost: parseFloat(prodRes[0].cost_price) || 10.0 }],
        }));
      }
    } catch (err) {
      console.error("Failed to load PO data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCreate = () => {
    setFormData({
      po_number: `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      supplier: suppliers[0]?.id || "",
      destination_warehouse: warehouses[0]?.id || "",
      notes: "Standard procurement replenishment",
      items: [{ product_id: products[0]?.id || "", quantity: 50, unit_cost: parseFloat(products[0]?.cost_price) || 10.0 }],
    });
    setErrorMsg(null);
    setShowCreateModal(true);
  };

  const handleAddItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { product_id: products[0]?.id || "", quantity: 20, unit_cost: 10.0 }],
    });
  };

  const handleRemoveItemRow = (index) => {
    const updated = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: updated });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const total = formData.items.reduce((acc, item) => acc + item.quantity * item.unit_cost, 0);
      const payload = {
        po_number: formData.po_number,
        supplier: parseInt(formData.supplier),
        destination_warehouse: parseInt(formData.destination_warehouse),
        notes: formData.notes,
        status: "ORDERED",
        total_amount: total.toFixed(2),
      };
      await api.createPurchaseOrder(payload);
      setSuccessMsg(`Purchase order ${formData.po_number} successfully submitted.`);
      setShowCreateModal(false);
      fetchData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenReceive = (order) => {
    setSelectedOrder(order);
    const initialInputs = {};
    order.items?.forEach((item) => {
      initialInputs[item.product_id_str] = Math.max(0, item.quantity_ordered - item.quantity_received);
    });
    setReceiveInputs(initialInputs);
    setErrorMsg(null);
    setShowReceiveModal(true);
  };

  const handleReceiveSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const itemsPayload = Object.entries(receiveInputs).map(([prodId, qty]) => ({
        product_id: prodId,
        quantity: parseInt(qty),
      }));

      const res = await api.receivePurchaseOrder(selectedOrder.id, { items: itemsPayload });
      setSuccessMsg(`Receipt confirmed! Items added to destination warehouse stock and recorded in Cassandra audit.`);
      setShowReceiveModal(false);
      fetchData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>Purchase Orders & Inbound Shipments</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Draft, order, and receive supplier shipments with automatic warehouse stocking
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenCreate}>
          <Plus size={16} /> New Purchase Order
        </button>
      </div>

      {successMsg && (
        <div style={{ padding: "12px 16px", background: "var(--status-success-bg)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "var(--status-success)", borderRadius: "8px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle size={16} /> {successMsg}
          </div>
          <button style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }} onClick={() => setSuccessMsg(null)}>
            &times;
          </button>
        </div>
      )}

      {/* PO Table */}
      <div className="card">
        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading purchase orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px" }}>
            No purchase orders found. Click "New Purchase Order" to create one.
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Vendor / Supplier</th>
                  <th>Destination Hub</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                  <th>Items Ordered / Received</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => (
                  <tr key={po.id}>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: "700", color: "var(--accent-secondary)" }}>
                      {po.po_number}
                    </td>
                    <td style={{ fontWeight: "600" }}>{po.supplier_name}</td>
                    <td>{po.warehouse_name || "Central Logistics Hub"}</td>
                    <td style={{ fontWeight: "700" }}>${parseFloat(po.total_amount).toLocaleString()}</td>
                    <td>
                      <span
                        className={`badge ${
                          po.status === "RECEIVED"
                            ? "badge-success"
                            : po.status === "ORDERED" || po.status === "APPROVED"
                            ? "badge-info"
                            : po.status === "PARTIALLY_RECEIVED"
                            ? "badge-warning"
                            : "badge-danger"
                        }`}
                      >
                        {po.status.replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      {po.items && po.items.length > 0 ? (
                        <div style={{ fontSize: "0.82rem" }}>
                          {po.items.map((item) => (
                            <div key={item.id}>
                              {item.product_name}: {item.quantity_received} / {item.quantity_ordered} units
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>No items</span>
                      )}
                    </td>
                    <td>
                      {po.status !== "RECEIVED" && po.status !== "CANCELLED" && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleOpenReceive(po)}>
                          <PackageCheck size={13} /> Receive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create PO Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "650px" }}>
            <div className="modal-header">
              <h3>Create Purchase Order</h3>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>&times;</button>
            </div>
            {errorMsg && <div style={{ padding: "10px", background: "var(--status-danger-bg)", color: "var(--status-danger)", borderRadius: "6px", marginBottom: "14px", fontSize: "0.85rem" }}>{errorMsg}</div>}
            <form onSubmit={handleCreateSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">PO Number *</label>
                  <input type="text" className="form-control" required value={formData.po_number} onChange={(e) => setFormData({ ...formData, po_number: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Vendor / Supplier *</label>
                  <select className="form-control" value={formData.supplier} onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Destination Warehouse Hub *</label>
                <select className="form-control" value={formData.destination_warehouse} onChange={(e) => setFormData({ ...formData, destination_warehouse: e.target.value })}>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                </select>
              </div>

              {/* Items Table */}
              <div style={{ marginBottom: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Line Items to Procure</label>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddItemRow}>
                    + Add Item
                  </button>
                </div>
                {formData.items.map((row, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
                    <select
                      className="form-control"
                      value={row.product_id}
                      onChange={(e) => {
                        const updated = [...formData.items];
                        updated[idx].product_id = e.target.value;
                        const p = products.find((prod) => prod.id === parseInt(e.target.value));
                        if (p) updated[idx].unit_cost = parseFloat(p.cost_price);
                        setFormData({ ...formData, items: updated });
                      }}
                    >
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.product_id})</option>)}
                    </select>

                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      placeholder="Qty"
                      value={row.quantity}
                      onChange={(e) => {
                        const updated = [...formData.items];
                        updated[idx].quantity = parseInt(e.target.value) || 1;
                        setFormData({ ...formData, items: updated });
                      }}
                    />

                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      placeholder="Cost ($)"
                      value={row.unit_cost}
                      onChange={(e) => {
                        const updated = [...formData.items];
                        updated[idx].unit_cost = parseFloat(e.target.value) || 0;
                        setFormData({ ...formData, items: updated });
                      }}
                    />

                    {formData.items.length > 1 && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRemoveItemRow(idx)}>
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">Order Notes</label>
                <textarea className="form-control" rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Submitting..." : "Issue Purchase Order"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive PO Modal */}
      {showReceiveModal && selectedOrder && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Confirm Shipment Receipt: {selectedOrder.po_number}</h3>
              <button className="close-btn" onClick={() => setShowReceiveModal(false)}>&times;</button>
            </div>
            {errorMsg && <div style={{ padding: "10px", background: "var(--status-danger-bg)", color: "var(--status-danger)", borderRadius: "6px", marginBottom: "14px", fontSize: "0.85rem" }}>{errorMsg}</div>}
            <form onSubmit={handleReceiveSubmit}>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "16px" }}>
                Confirm physical items inspected and accepted into destination warehouse: <strong>{selectedOrder.warehouse_name}</strong>.
              </p>

              {selectedOrder.items?.map((item) => {
                const remaining = Math.max(0, item.quantity_ordered - item.quantity_received);
                return (
                  <div key={item.id} className="form-group" style={{ padding: "12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.88rem" }}>
                      <strong style={{ color: "var(--text-primary)" }}>{item.product_name}</strong>
                      <span style={{ color: "var(--text-muted)" }}>
                        Remaining to receive: {remaining} / {item.quantity_ordered} units
                      </span>
                    </div>
                    <label className="form-label">Units Accepted Now:</label>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      className="form-control"
                      value={receiveInputs[item.product_id_str] || 0}
                      onChange={(e) => setReceiveInputs({ ...receiveInputs, [item.product_id_str]: e.target.value })}
                    />
                  </div>
                );
              })}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowReceiveModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Processing Receipt..." : "Accept Into Warehouse Stock"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
