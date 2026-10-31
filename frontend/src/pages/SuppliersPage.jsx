import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Truck, Plus, Edit2, Mail, Phone, Clock, Award, Search, RefreshCw } from "lucide-react";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  const [formData, setFormData] = useState({
    supplier_id: "",
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    average_lead_time_days: 10,
    reliability_score: 0.95,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const res = await api.getSuppliers({ search });
      setSuppliers(res);
    } catch (err) {
      console.error("Failed to load suppliers", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuppliers();
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const handleOpenAdd = () => {
    setIsEditing(false);
    setFormData({
      supplier_id: `SUP00${suppliers.length + 1}`,
      name: "",
      contact_person: "",
      email: "",
      phone: "",
      address: "",
      average_lead_time_days: 10,
      reliability_score: 0.95,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (s) => {
    setIsEditing(true);
    setSelectedSupplier(s);
    setFormData({
      supplier_id: s.supplier_id,
      name: s.name,
      contact_person: s.contact_person,
      email: s.email,
      phone: s.phone,
      address: s.address,
      average_lead_time_days: s.average_lead_time_days,
      reliability_score: s.reliability_score,
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
        average_lead_time_days: parseInt(formData.average_lead_time_days),
        reliability_score: parseFloat(formData.reliability_score),
      };
      if (isEditing) {
        await api.updateSupplier(selectedSupplier.id, payload);
      } else {
        await api.createSupplier(payload);
      }
      setShowModal(false);
      fetchSuppliers();
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
          <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>Suppliers & Procurement Vendors</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Track lead times, reliability performance scores, contact records, and catalog allocation
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenAdd}>
          <Plus size={16} /> Add Supplier
        </button>
      </div>

      {/* Search */}
      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, maxWidth: "400px" }}>
          <Search size={16} style={{ position: "absolute", left: "12px", top: "12px", color: "var(--text-muted)" }} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: "36px" }}
            placeholder="Search suppliers by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchSuppliers}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Supplier Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
        {suppliers.map((s) => {
          const relPct = Math.round(s.reliability_score * 100);
          const relColor = relPct >= 90 ? "var(--status-success)" : relPct >= 75 ? "var(--status-warning)" : "var(--status-danger)";

          return (
            <div key={s.id} className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                <div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>{s.name}</h3>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "var(--accent-secondary)" }}>
                    {s.supplier_id}
                  </span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(s)}>
                  <Edit2 size={12} /> Edit
                </button>
              </div>

              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {s.contact_person && <div>Contact: <strong style={{ color: "var(--text-primary)" }}>{s.contact_person}</strong></div>}
                {s.email && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Mail size={13} style={{ color: "var(--text-muted)" }} /> {s.email}
                  </div>
                )}
                {s.phone && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Phone size={13} style={{ color: "var(--text-muted)" }} /> {s.phone}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "4px" }}>
                    <Clock size={13} /> Avg Lead Time
                  </div>
                  <div style={{ fontWeight: "700", fontSize: "0.95rem" }}>{s.average_lead_time_days} days</div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "4px" }}>
                    <Award size={13} /> Reliability
                  </div>
                  <div style={{ fontWeight: "700", fontSize: "0.95rem", color: relColor }}>{relPct}% on-time</div>
                </div>
              </div>

              <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                <span>Supplied Catalog Items:</span>
                <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>{s.supplied_products_count || 0} products</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Supplier Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{isEditing ? `Edit Supplier: ${formData.supplier_id}` : "Onboard New Supplier"}</h3>
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
                  <label className="form-label">Supplier ID *</label>
                  <input type="text" className="form-control" required disabled={isEditing} value={formData.supplier_id} onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Company Name *</label>
                  <input type="text" className="form-control" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Contact Person</label>
                  <input type="text" className="form-control" value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-control" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="text" className="form-control" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Average Lead Time (days)</label>
                  <input type="number" min="1" className="form-control" required value={formData.average_lead_time_days} onChange={(e) => setFormData({ ...formData, average_lead_time_days: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Reliability Score (0.0 to 1.0, e.g. 0.95 = 95%)</label>
                <input type="number" step="0.01" min="0" max="1" className="form-control" required value={formData.reliability_score} onChange={(e) => setFormData({ ...formData, reliability_score: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-control" rows={2} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving..." : isEditing ? "Update Vendor" : "Create Vendor"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
