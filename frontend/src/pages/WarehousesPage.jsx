import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Warehouse as WarehouseIcon, Plus, Edit2, MapPin, Layers, RefreshCw } from "lucide-react";

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedWh, setSelectedWh] = useState(null);

  const [formData, setFormData] = useState({
    warehouse_id: "",
    code: "",
    name: "",
    address: "",
    capacity: 2000,
    status: "ACTIVE",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [whRes, stockRes] = await Promise.all([api.getWarehouses(), api.getWarehouseStock()]);
      setWarehouses(whRes);
      setStocks(stockRes);
    } catch (err) {
      console.error("Failed to load warehouse data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAdd = () => {
    setIsEditing(false);
    setFormData({
      warehouse_id: `WH00${warehouses.length + 1}`,
      code: `WH-REG-0${warehouses.length + 1}`,
      name: "",
      address: "",
      capacity: 2500,
      status: "ACTIVE",
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (w) => {
    setIsEditing(true);
    setSelectedWh(w);
    setFormData({
      warehouse_id: w.warehouse_id,
      code: w.code,
      name: w.name,
      address: w.address,
      capacity: w.capacity,
      status: w.status,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        ...formData,
        capacity: parseInt(formData.capacity),
      };
      if (isEditing) {
        await api.updateWarehouse(selectedWh.id, payload);
      } else {
        await api.createWarehouse(payload);
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>Warehouses & Storage Hubs</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Monitor spatial capacity utilization, physical hubs, and localized inventory allocations
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenAdd}>
          <Plus size={16} /> Add Warehouse
        </button>
      </div>

      {/* Warehouse Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px", marginBottom: "32px" }}>
        {warehouses.map((w) => {
          const util = w.utilization || 0;
          const statusColor = util >= 90 ? "var(--status-danger)" : util >= 75 ? "var(--status-warning)" : "var(--status-success)";
          const storedItems = stocks.filter((s) => s.warehouse === w.id);

          return (
            <div key={w.id} className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div className="brand-logo-icon" style={{ width: "32px", height: "32px", borderRadius: "8px" }}>
                      <WarehouseIcon size={18} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: "1.05rem", fontWeight: "700" }}>{w.name}</h3>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {w.code} ({w.warehouse_id})
                      </span>
                    </div>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(w)}>
                  <Edit2 size={12} /> Edit
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                <MapPin size={14} style={{ color: "var(--accent-secondary)" }} />
                <span>{w.address || "No address specified"}</span>
              </div>

              {/* Progress Utilization */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "6px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Capacity Utilization</span>
                  <span style={{ fontWeight: "700", color: statusColor }}>{util}% Full</span>
                </div>
                <div style={{ height: "9px", background: "rgba(255, 255, 255, 0.08)", borderRadius: "5px", overflow: "hidden" }}>
                  <div style={{ width: `${util}%`, height: "100%", background: statusColor, borderRadius: "5px" }}></div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  <span>{w.total_stock?.toLocaleString() || 0} units stored</span>
                  <span>{w.capacity?.toLocaleString() || 0} max capacity</span>
                </div>
              </div>

              {/* Stored SKUs count */}
              <div style={{ paddingTop: "12px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Managed Stock Items:</span>
                <span style={{ fontWeight: "700", color: "var(--accent-secondary)" }}>{storedItems.length} SKUs</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{isEditing ? `Edit Warehouse: ${formData.code}` : "Register New Warehouse Hub"}</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            {formError && (
              <div style={{ padding: "10px", background: "var(--status-danger-bg)", color: "var(--status-danger)", borderRadius: "6px", marginBottom: "14px", fontSize: "0.85rem" }}>
                {formError}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Warehouse ID *</label>
                  <input type="text" className="form-control" required disabled={isEditing} value={formData.warehouse_id} onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Code *</label>
                  <input type="text" className="form-control" required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Warehouse Name *</label>
                <input type="text" className="form-control" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Physical Address</label>
                <input type="text" className="form-control" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Total Unit Capacity *</label>
                  <input type="number" min="100" className="form-control" required value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="MAINTENANCE">Maintenance</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving..." : isEditing ? "Update Hub" : "Create Hub"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
