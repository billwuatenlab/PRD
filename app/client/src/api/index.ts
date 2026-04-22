const BASE = '/api';

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
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
