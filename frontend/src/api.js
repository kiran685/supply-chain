const BASE_URL = "/api";

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = options.headers || {};
  
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: `Request failed with status ${response.status}` };
    }
    const err = new Error(errorData.error || errorData.detail || JSON.stringify(errorData));
    err.data = errorData;
    err.status = response.status;
    throw err;
  }

  // Handle empty responses
  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  // Health
  getHealth: () => request("/health/"),
  getDatabaseHealth: () => request("/health/databases/"),

  // Dashboard & Analytics
  getDashboardAnalytics: () => request("/analytics/dashboard/"),
  getExportUrl: (type = "inventory") => `${BASE_URL}/analytics/export/?type=${type}`,

  // Products
  getProducts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/products/${query ? `?${query}` : ""}`);
  },
  getProduct: (id) => request(`/products/${id}/`),
  createProduct: (data) => request("/products/", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id, data) => request(`/products/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProduct: (id) => request(`/products/${id}/`, { method: "DELETE" }),

  // Suppliers
  getSuppliers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/suppliers/${query ? `?${query}` : ""}`);
  },
  createSupplier: (data) => request("/suppliers/", { method: "POST", body: JSON.stringify(data) }),
  updateSupplier: (id, data) => request(`/suppliers/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),

  // Warehouses
  getWarehouses: () => request("/warehouses/"),
  createWarehouse: (data) => request("/warehouses/", { method: "POST", body: JSON.stringify(data) }),
  updateWarehouse: (id, data) => request(`/warehouses/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),

  // Inventory & Stock
  getWarehouseStock: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/inventory/stock/${query ? `?${query}` : ""}`);
  },
  getMovements: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/inventory/movements/${query ? `?${query}` : ""}`);
  },
  stockIn: (data) => request("/inventory/stock-in/", { method: "POST", body: JSON.stringify(data) }),
  stockOut: (data) => request("/inventory/stock-out/", { method: "POST", body: JSON.stringify(data) }),
  stockAdjustment: (data) => request("/inventory/adjustments/", { method: "POST", body: JSON.stringify(data) }),
  stockTransfer: (data) => request("/inventory/transfers/", { method: "POST", body: JSON.stringify(data) }),

  // Purchase Orders
  getPurchaseOrders: () => request("/purchase-orders/"),
  createPurchaseOrder: (data) => request("/purchase-orders/", { method: "POST", body: JSON.stringify(data) }),
  receivePurchaseOrder: (id, data = {}) => request(`/purchase-orders/${id}/receive/`, { method: "POST", body: JSON.stringify(data) }),

  // Demand Forecasting
  importDemandCsv: (formData) => request("/forecasting/import/", { method: "POST", body: formData }),
  getProductForecast: (productId, algorithm = "EXPONENTIAL_SMOOTHING", horizon = 14) =>
    request(`/forecasting/${productId}/?algorithm=${algorithm}&horizon=${horizon}`),
  getReorderRecommendations: () => request("/forecasting/reorder-recommendations/"),

  // Supply Chain Graph & Risk
  getSupplyChainGraph: () => request("/supply-chain/graph/"),
  syncSupplyChainGraph: () => request("/supply-chain/sync/", { method: "POST" }),
  getSupplyChainRisks: (severity = "") => {
    const query = severity ? `?severity=${severity}` : "";
    return request(`/supply-chain/risks/${query}`);
  },
};
