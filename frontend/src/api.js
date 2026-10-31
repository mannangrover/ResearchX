// Set by App once the user logs in (Supabase mode); null in local mode.
let getToken = async () => null;
let onUnauthorized = () => {};

export function configureAuth({ tokenProvider, unauthorized }) {
  getToken = tokenProvider;
  onUnauthorized = unauthorized;
}

async function request(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) onUnauthorized();
  if (!res.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((d) => d.msg.replace(/^Value error, /, "")).join(" ")
      : data.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  health: () => request("/health"),
  authConfig: () => request("/auth/config"),
  listProjects: () => request("/projects"),
  getProject: (id) => request(`/projects/${id}`),
  createProject: (body) => request("/projects", { method: "POST", body: JSON.stringify(body) }),
  deleteProject: (id) => request(`/projects/${id}`, { method: "DELETE" }),
  analyze: (id) => request(`/projects/${id}/analyze`, { method: "POST" }),
  literature: (id, queries) =>
    request(`/projects/${id}/literature`, {
      method: "POST",
      body: JSON.stringify(queries ? { queries } : {}),
    }),
  score: (id) => request(`/projects/${id}/score`, { method: "POST" }),
  // Stage 6 — interactive refinement
  refineStart: (id) => request(`/projects/${id}/refine/start`, { method: "POST" }),
  refineMessage: (id, content) =>
    request(`/projects/${id}/refine/message`, { method: "POST", body: JSON.stringify({ content }) }),
  refinePropose: (id) => request(`/projects/${id}/refine/propose`, { method: "POST" }),
  refineSaveProposal: (id, proposal, approved) =>
    request(`/projects/${id}/refine/proposal`, { method: "PUT", body: JSON.stringify({ proposal, approved }) }),
  refineReset: (id) => request(`/projects/${id}/refine`, { method: "DELETE" }),
  refineApply: (id) => request(`/projects/${id}/refine/apply`, { method: "POST" }),
  // Stage 7 — experiment planning
  plan: (id, options) => request(`/projects/${id}/plan`, { method: "POST", body: JSON.stringify(options) }),
  // Stage 8 — paper evaluation ({ filename, content_base64, change_note })
  paper: (id, body) => request(`/projects/${id}/paper`, { method: "POST", body: JSON.stringify(body) }),
  // Versions inside a project
  switchVersion: (id, n) => request(`/projects/${id}/versions/${n}/switch`, { method: "POST" }),
};
