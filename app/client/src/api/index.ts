const BASE = '/api';

// Attach current user to mutation requests so the server can audit
function mutHeaders(extra?: Record<string, string>): Record<string, string> {
  const user = localStorage.getItem('prd.currentUser') || '';
  return {
    'Content-Type': 'application/json',
    ...(user ? { 'X-User': user } : {}),
    ...(extra || {}),
  };
}

export async function fetchCategoryTree() {
  const res = await fetch(`${BASE}/categories/tree`);
  return res.json();
}

export async function fetchProducts(params: Record<string, string | number>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, String(v));
  }
  const res = await fetch(`${BASE}/products?${qs}`);
  return res.json();
}

export async function fetchProduct(id: number) {
  const res = await fetch(`${BASE}/products/${id}`);
  return res.json();
}

export async function updateProduct(id: number, data: Record<string, any>) {
  const res = await fetch(`${BASE}/products/${id}`, {
    method: 'PUT',
    headers: mutHeaders(),
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function reorderProducts(updates: Array<{ id: number; level?: number; sort_order?: number }>) {
  const res = await fetch(`${BASE}/products/reorder`, {
    method: 'PATCH',
    headers: mutHeaders(),
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function deleteProduct(id: number) {
  const res = await fetch(`${BASE}/products/${id}`, { method: 'DELETE', headers: mutHeaders() });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

export async function fetchAuditLog(params: { entity_type?: string; entity_id?: number; user?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, String(v));
  }
  const res = await fetch(`${BASE}/audit?${qs}`);
  return res.json();
}

export async function createCategory(data: { parent_id: number | null; code: string; name: string }) {
  const res = await fetch(`${BASE}/categories`, {
    method: 'POST',
    headers: mutHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Create failed');
  return res.json();
}

export async function updateCategory(id: number, data: { name?: string; code?: string; parent_id?: number | null; sort_order?: number }) {
  const res = await fetch(`${BASE}/categories/${id}`, {
    method: 'PATCH',
    headers: mutHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
  return res.json();
}

export async function deleteCategory(id: number) {
  const res = await fetch(`${BASE}/categories/${id}`, { method: 'DELETE', headers: mutHeaders() });
  if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
  return res.json();
}

export async function searchProducts(q: string) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`);
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${BASE}/stats`);
  return res.json();
}
