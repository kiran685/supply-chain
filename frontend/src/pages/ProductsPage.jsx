import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Plus, Search, Edit2, Trash2, Eye, Filter, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    product_id: "",
    sku: "",
    name: "",
    description: "",
    category: "Semiconductors",
    unit_of_measurement: "pieces",
    cost_price: 10.0,
    selling_price: 20.0,
    current_stock: 50,
    min_stock_threshold: 20,
    safety_stock: 15,
    reorder_quantity: 100,
    lead_time_days: 10,
    preferred_supplier: "",
    primary_warehouse: "",
  });

  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchDependencies = async () => {
    try {
      const [suppRes, whRes] = await Promise.all([api.getSuppliers(), api.getWarehouses()]);
      setSuppliers(suppRes);
      setWarehouses(whRes);
    } catch (err) {
      console.error("Failed to load suppliers/warehouses", err);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await api.getProducts(params);
      setProducts(res);
    } catch (err) {
      console.error("Failed to load products", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDependencies();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, categoryFilter, statusFilter]);

  const handleOpenAdd = () => {
    setIsEditing(false);
    setFormData({
      product_id: `PROD${Math.floor(100 + Math.random() * 900)}`,
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      name: "",
      description: "",
      category: "Semiconductors",
      unit_of_measurement: "pieces",
      cost_price: 12.0,
      selling_price: 25.0,
      current_stock: 50,
      min_stock_threshold: 20,
      safety_stock: 15,
      reorder_quantity: 100,
      lead_time_days: 10,
      preferred_supplier: suppliers[0]?.id || "",
      primary_warehouse: warehouses[0]?.id || "",
    });
    setFormError(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (p) => {
    setIsEditing(true);
    setSelectedProduct(p);
    setFormData({
      product_id: p.product_id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      category: p.category,
      unit_of_measurement: p.unit_of_measurement,
      cost_price: p.cost_price,
      selling_price: p.selling_price,
      current_stock: p.current_stock,
      min_stock_threshold: p.min_stock_threshold,
      safety_stock: p.safety_stock,
      reorder_quantity: p.reorder_quantity,
      lead_time_days: p.lead_time_days,
      preferred_supplier: p.preferred_supplier || "",
      primary_warehouse: p.primary_warehouse || "",
    });
    setFormError(null);
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        ...formData,
        cost_price: parseFloat(formData.cost_price),
        selling_price: parseFloat(formData.selling_price),
        current_stock: parseInt(formData.current_stock),
        min_stock_threshold: parseInt(formData.min_stock_threshold),
        safety_stock: parseInt(formData.safety_stock),
        reorder_quantity: parseInt(formData.reorder_quantity),
        lead_time_days: parseInt(formData.lead_time_days),
        preferred_supplier: formData.preferred_supplier ? parseInt(formData.preferred_supplier) : null,
        primary_warehouse: formData.primary_warehouse ? parseInt(formData.primary_warehouse) : null,
      };

      if (isEditing) {
        await api.updateProduct(selectedProduct.id, payload);
      } else {
        await api.createProduct(payload);
      }
      setShowAddModal(false);
      fetchProducts();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (product) => {
    if (!window.confirm(`Are you sure you want to toggle active status for ${product.name}?`)) {
      return;
    }
    try {
      await api.updateProduct(product.id, { is_active: !product.is_active });
      fetchProducts();
    } catch (err) {
      alert("Error updating product: " + err.message);
    }
  };

  return (
    <div>
      {/* Action Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>Product Catalog</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Manage master product entities, SKU barcodes, inventory thresholds, and BOM links
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenAdd}>
          <Plus size={16} /> Add Product
        </button>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, minWidth: "260px" }}>
          <Search size={16} style={{ position: "absolute", left: "12px", top: "12px", color: "var(--text-muted)" }} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: "36px" }}
            placeholder="Search by product name, SKU, or Product ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="form-control"
          style={{ width: "180px" }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          <option value="Semiconductors">Semiconductors</option>
          <option value="Power Systems">Power Systems</option>
          <option value="Displays">Displays</option>
          <option value="Sensors">Sensors</option>
        </select>

        <select
          className="form-control"
          style={{ width: "170px" }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Stock Statuses</option>
          <option value="OPTIMAL">Optimal</option>
          <option value="LOW_STOCK">Low Stock</option>
          <option value="OUT_OF_STOCK">Out of Stock</option>
        </select>

        <button className="btn btn-secondary btn-sm" onClick={fetchProducts}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Products Table */}
      <div className="card">
        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading catalog items...</p>
          </div>
        ) : products.length === 0 ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px" }}>
            No products match the selected criteria.
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Product ID / SKU</th>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th>Cost / Price</th>
                  <th>Current Stock</th>
                  <th>Min / Safety</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: "700", color: "var(--accent-secondary)", fontSize: "0.85rem" }}>
                        {p.product_id}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {p.sku}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: "600" }}>{p.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{p.description.slice(0, 45)}...</div>
                    </td>
                    <td>
                      <span className="badge badge-info">{p.category}</span>
                    </td>
                    <td>
                      <div>${parseFloat(p.cost_price).toFixed(2)} cost</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        ${parseFloat(p.selling_price).toFixed(2)} retail
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: "800",
                          fontSize: "1rem",
                          color:
                            p.current_stock === 0
                              ? "var(--status-danger)"
                              : p.current_stock <= p.min_stock_threshold
                              ? "var(--status-warning)"
                              : "var(--status-success)",
                        }}
                      >
                        {p.current_stock}
                      </span>{" "}
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{p.unit_of_measurement}</span>
                    </td>
                    <td style={{ fontSize: "0.82rem" }}>
                      Min: {p.min_stock_threshold} / Safe: {p.safety_stock}
                    </td>
                    <td>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        {p.preferred_supplier_name || "—"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          p.stock_status === "OUT_OF_STOCK"
                            ? "badge-danger"
                            : p.stock_status === "LOW_STOCK"
                            ? "badge-warning"
                            : "badge-success"
                        }`}
                      >
                        {p.stock_status.replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          title="View Details"
                          onClick={() => {
                            setSelectedProduct(p);
                            setShowDetailsModal(true);
                          }}
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Edit Product"
                          onClick={() => handleOpenEdit(p)}
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{isEditing ? `Edit Product: ${formData.product_id}` : "Create New Product"}</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                &times;
              </button>
            </div>

            {formError && (
              <div style={{ padding: "10px", background: "var(--status-danger-bg)", color: "var(--status-danger)", borderRadius: "6px", marginBottom: "14px", fontSize: "0.85rem" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Product ID *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    disabled={isEditing}
                    value={formData.product_id}
                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">SKU (Unique) *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Product Name *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-control"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="Semiconductors">Semiconductors</option>
                    <option value="Power Systems">Power Systems</option>
                    <option value="Displays">Displays</option>
                    <option value="Sensors">Sensors</option>
                    <option value="Hardware">Hardware</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Unit of Measurement</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.unit_of_measurement}
                    onChange={(e) => setFormData({ ...formData, unit_of_measurement: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Cost Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    required
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    required
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Initial / Current Stock</label>
                  <input
                    type="number"
                    className="form-control"
                    required
                    value={formData.current_stock}
                    onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Min Stock Threshold</label>
                  <input
                    type="number"
                    className="form-control"
                    required
                    value={formData.min_stock_threshold}
                    onChange={(e) => setFormData({ ...formData, min_stock_threshold: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Safety Stock</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.safety_stock}
                    onChange={(e) => setFormData({ ...formData, safety_stock: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Lead Time (days)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.lead_time_days}
                    onChange={(e) => setFormData({ ...formData, lead_time_days: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Preferred Supplier</label>
                  <select
                    className="form-control"
                    value={formData.preferred_supplier}
                    onChange={(e) => setFormData({ ...formData, preferred_supplier: e.target.value })}
                  >
                    <option value="">None / Unassigned</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.supplier_id})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Primary Warehouse</label>
                  <select
                    className="form-control"
                    value={formData.primary_warehouse}
                    onChange={(e) => setFormData({ ...formData, primary_warehouse: e.target.value })}
                  >
                    <option value="">None / Unassigned</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : isEditing ? "Update Product" : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Details Drawer/Modal */}
      {showDetailsModal && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "680px" }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: "700" }}>{selectedProduct.name}</h3>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--accent-secondary)" }}>
                  {selectedProduct.product_id} • {selectedProduct.sku}
                </span>
              </div>
              <button className="close-btn" onClick={() => setShowDetailsModal(false)}>
                &times;
              </button>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{selectedProduct.description}</p>
            </div>

            {/* Warehouse Stock breakdown */}
            <div style={{ marginBottom: "24px" }}>
              <h4 style={{ fontSize: "0.95rem", fontWeight: "600", marginBottom: "10px" }}>
                Warehouse Stock Distribution
              </h4>
              {selectedProduct.warehouse_stocks && selectedProduct.warehouse_stocks.length > 0 ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Warehouse</th>
                        <th>Code</th>
                        <th>Quantity Stored</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProduct.warehouse_stocks.map((ws) => (
                        <tr key={ws.id}>
                          <td style={{ fontWeight: "600" }}>{ws.warehouse_name}</td>
                          <td>{ws.warehouse_code}</td>
                          <td style={{ fontWeight: "700" }}>{ws.quantity} units</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  No individual warehouse stock breakdown recorded yet.
                </p>
              )}
            </div>

            {/* BOM Components */}
            {selectedProduct.bom_items && selectedProduct.bom_items.length > 0 && (
              <div style={{ marginBottom: "24px" }}>
                <h4 style={{ fontSize: "0.95rem", fontWeight: "600", marginBottom: "10px" }}>
                  Bill of Materials (Tier-2 Sub-Components)
                </h4>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Component</th>
                        <th>Required Qty</th>
                        <th>Criticality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProduct.bom_items.map((item) => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: "600" }}>{item.component_name}</td>
                          <td>{item.quantity_required}x</td>
                          <td>
                            <span className={`badge ${item.is_critical ? "badge-danger" : "badge-info"}`}>
                              {item.is_critical ? "Critical Part" : "Standard"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
