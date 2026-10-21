// api.js — tiny fetch client. Auth token rides in the Authorization header
// (and, for <img>/<audio> media that can't send headers, as ?t= in URLs).

const DEPLOY_BASE = window.OBV_API_BASE || '';
let BASE = DEPLOY_BASE;

// The app may be served from an origin root (local dev, isolated previews) or
// from a nested path (some static hosts). Probe a couple of candidates once and
// remember which one answers; locally the first candidate always works.
let probed = false;
async function resolveBase() {
  if (probed) return BASE;
  probed = true;
  const candidates = [...new Set([DEPLOY_BASE, 'port/5000', ''])];
  for (const c of candidates) {
    try {
      const r = await fetch(c + '/api/bootstrap');
      if (r.ok) { BASE = c; return BASE; }
    } catch (e) { /* try the next candidate */ }
  }
  return BASE;
}

// token persistence via cookie (guarded: silently memory-only where cookies
// are blocked, e.g. sandboxed previews)
const cookie = {
  set(k, v, days = 30) { try { document.cookie = k + '=' + encodeURIComponent(v) + '; max-age=' + days * 86400 + '; path=/; SameSite=Lax'; } catch (e) { /* sandboxed */ } },
  get(k) {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  },
  del(k) { this.set(k, '', -1); }
};

let token = cookie.get('obv-token');

export function getToken() { return token; }
export function setToken(t) { token = t; t ? cookie.set('obv-token', t) : cookie.del('obv-token'); }

async function req(method, path, body, isForm) {
  if (!probed) await resolveBase();
  const opts = { method, headers: {} };
  if (token) opts.headers.Authorization = 'Bearer ' + token;
  if (body && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body) {
    opts.body = body; // FormData
  }
  const res = await fetch(BASE + path, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-json */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  bootstrap: () => req('GET', '/api/bootstrap'),
  demoAccounts: () => req('GET', '/api/demo-accounts'),
  demoLogin: (email) => req('POST', '/api/auth/demo', { email }),
  googleLogin: (credential) => req('POST', '/api/auth/google', { credential }),
  logout: () => req('POST', '/api/auth/logout'),
  feed: (params) => req('GET', '/api/feed' + params),
  post: (id) => req('GET', `/api/posts/${id}`),
  createPost: (formData) => req('POST', '/api/posts', formData, true),
  updatePost: (id, patch) => req('PATCH', `/api/posts/${id}`, patch),
  deletePost: (id) => req('DELETE', `/api/posts/${id}`),
  like: (id) => req('POST', `/api/posts/${id}/like`),
  addComment: (id, body) => req('POST', `/api/posts/${id}/comments`, { body }),
  deleteComment: (id) => req('DELETE', `/api/comments/${id}`),
  user: (id) => req('GET', `/api/users/${id}`),
  updateMe: (patch) => req('PATCH', '/api/users/me', patch),
  uploadAvatar: (formData) => req('POST', '/api/users/me/avatar', formData, true),
  follow: (id) => req('POST', `/api/users/${id}/follow`),
  opportunities: () => req('GET', '/api/opportunities'),
  createOpportunity: (o) => req('POST', '/api/opportunities', o),
  updateOpportunity: (id, patch) => req('PATCH', `/api/opportunities/${id}`, patch),
  deleteOpportunity: (id) => req('DELETE', `/api/opportunities/${id}`),
  interested: (id) => req('POST', `/api/opportunities/${id}/interested`),
  collection: (id) => req('GET', `/api/collections/${id}`),
  createCollection: (c) => req('POST', '/api/collections', c),
  updateCollection: (id, patch) => req('PATCH', `/api/collections/${id}`, patch),
  deleteCollection: (id) => req('DELETE', `/api/collections/${id}`),
  addToCollection: (cid, postId) => req('POST', `/api/collections/${cid}/posts`, { postId }),
  removeFromCollection: (cid, postId) => req('DELETE', `/api/collections/${cid}/posts/${postId}`)
};

export function mediaUrl(filename) {
  const t = token ? `?t=${encodeURIComponent(token)}` : '';
  return `${BASE}/uploads/${encodeURIComponent(filename)}${t}`;
}
