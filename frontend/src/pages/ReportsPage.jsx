import React, { useState } from "react";
import { api } from "../api";
import { Download, FileText, Table, Clock, AlertTriangle, Truck } from "lucide-react";

export default function ReportsPage() {
  const reports = [
    {
      id: "inventory",
      title: "Master Inventory & Valuation Summary",
      description: "Complete list of products, stock on hand, valuation basis, SKU barcodes, and current stock status.",
      icon: Table,
      color: "#6366F1",
    },
    {
      id: "movements",
      title: "Stock Movements Audit Trail",
      description: "Chronological ledger of receipts, dispatches, adjustments, and warehouse transfers.",
      icon: Clock,
      color: "#06B6D4",
    },
    {
      id: "low-stock",
      title: "Critical Low Stock & Replenishment Report",
      description: "Products at or below reorder threshold, safety stock requirements, and assigned preferred vendors.",
      icon: AlertTriangle,
      color: "#EF4444",
    },
    {
      id: "suppliers",
      title: "Supplier Lead Times & Reliability Directory",
      description: "Vendor registry with recorded lead times, reliability performance percentage, and contact details.",
      icon: Truck,
      color: "#10B981",
    },
  ];

  const handleDownload = (reportId) => {
    const url = api.getExportUrl(reportId);
    window.open(url, "_blank");
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>Export Reports & Audit Data</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Generate standardized CSV exports for operational audits, ERP reconciliation, and stakeholder reporting
        </p>
      </div>

      {/* Reports Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>
        {reports.map((rep) => {
          const Icon = rep.icon;
          return (
            <div key={rep.id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                  <div
                    className="brand-logo-icon"
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "8px",
                      background: `${rep.color}20`,
                      color: rep.color,
                      boxShadow: "none",
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>{rep.title}</h3>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "20px", lineHeight: 1.5 }}>
                  {rep.description}
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-primary btn-sm" onClick={() => handleDownload(rep.id)}>
                  <Download size={14} /> Download CSV Export
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
