function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) {
    headers['X-Telegram-Init-Data'] = initData;
  }
  return headers;
}

async function request(path, options = {}) {
  const { headers: extraHeaders, method = 'GET', body, ...rest } = options;
  const res = await fetch(path, {
    ...rest,
    method,
    body,
    headers: { ...authHeaders(), ...(extraHeaders || {}) },
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 180) };
    }
  }

  if (!res.ok) {
    const allow = res.headers.get('Allow');
    let message = (data && data.error) || `Ошибка ${res.status}`;
    if (typeof message !== 'string') message = `Ошибка ${res.status}`;
    if (res.status === 405 && allow) message = `${message} (Allow: ${allow})`;
    throw new Error(message);
  }
  return data;
}

/** Normalize list endpoints that must be JSON arrays. */
function asArray(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) return data.rows;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

export const api = {
  getCategories: async () => asArray(await request('/api/categories')),
  getMe: () => request('/api/me'),
  getItems: async (search = '') => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    const qs = params.toString();
    return asArray(await request(`/api/items${qs ? `?${qs}` : ''}`));
  },
  createItem: (body) =>
    request('/api/items', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getCandidates: () => request('/api/admin/candidates'),
  approveCandidate: (id, body) =>
    request(`/api/admin/candidates/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rejectCandidate: (id) =>
    request(`/api/admin/candidates/${id}/reject`, { method: 'POST' }),
  getProducts: async (search = '', extra = {}) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (extra.category_id) params.set('category_id', String(extra.category_id));
    const qs = params.toString();
    return asArray(await request(`/api/products${qs ? `?${qs}` : ''}`));
  },
  createProduct: (body) =>
    request('/api/products', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProduct: (id, body) =>
    request(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  createCategory: (body) =>
    request('/api/categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCategory: (id, body) =>
    request(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  getOperations: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const suffix = qs.toString() ? `?${qs}` : '';
    return request(`/api/operations${suffix}`);
  },
  createOperation: (body) =>
    request('/api/operations', { method: 'POST', body: JSON.stringify(body) }),
  updateOperation: (id, body) =>
    request(`/api/operations/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteOperation: (id) =>
    request(`/api/operations/${id}`, { method: 'DELETE' }),
  getAnalytics: (period = 'month') =>
    request(`/api/analytics?period=${encodeURIComponent(period)}`),
};
