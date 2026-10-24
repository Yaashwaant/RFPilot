/**
 * Proposal Assistant – Typed API Client
 * Interfaces with FastAPI backend with bearer token authorization.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL !== undefined
  ? process.env.NEXT_PUBLIC_API_URL
  : (typeof window !== "undefined" ? "" : (process.env.INTERNAL_API_URL || "http://127.0.0.1:8000"));

export async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("proposal_assistant_token");
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
    throw new Error("Authentication required. Redirecting to login...");
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // If unauthorized, clear invalid session and redirect to /login
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("proposal_assistant_token");
    localStorage.removeItem("proposal_assistant_user");
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    let errBody: any = {};
    try {
      errBody = await res.json();
    } catch {}
    const msg = errBody?.detail?.error?.message || errBody?.detail || `API error ${res.status}`;
    throw new Error(msg);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

// ─── Projects API ─────────────────────────────────────

export async function apiCreateProject(file: File, name?: string) {
  let token = await getAuthToken();
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);

  let res = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (res.status === 401 && typeof window !== "undefined") {
    try {
      const seedRes = await fetch(`${API_BASE}/api/auth/seed-dev`, { method: "POST" });
      if (seedRes.ok) {
        const data = await seedRes.json();
        token = data.access_token;
        if (token) {
          localStorage.setItem("proposal_assistant_token", token);
          res = await fetch(`${API_BASE}/api/projects`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
        }
      }
    } catch {}
  }

  if (!res.ok) {
    let errMsg = `Failed to upload project workbook (HTTP ${res.status})`;
    try {
      const text = await res.text();
      try {
        const errData = JSON.parse(text);
        errMsg = errData?.detail?.error?.message || (typeof errData?.detail === 'string' ? errData.detail : JSON.stringify(errData?.detail)) || errMsg;
      } catch {
        if (text) errMsg = `Server error (${res.status}): ${text.slice(0, 150)}`;
      }
    } catch {}
    throw new Error(errMsg);
  }
  return res.json();
}

export async function apiListProjects() {
  return apiFetch<any[]>("/api/projects");
}

export async function apiGetProject(id: string) {
  return apiFetch<any>(`/api/projects/${id}`);
}

export async function apiExportProject(id: string, keepTint: boolean = false) {
  return apiFetch<{ downloadUrl: string; fileName: string; unreviewedDraftsCount: number }>(
    `/api/projects/${id}/export?keepTint=${keepTint}`
  );
}

export async function apiGetProjectSheetData(projectId: string) {
  return apiFetch<any>(`/api/projects/${projectId}/sheet-data`);
}

// ─── Jobs & Answers API ───────────────────────────────

export async function apiCreateJob(projectId: string, payload: any) {
  return apiFetch<{ jobId: string; status: string }>(`/api/projects/${projectId}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function apiCancelJob(jobId: string) {
  return apiFetch<{ status: string }>(`/api/jobs/${jobId}/cancel`, {
    method: "POST",
  });
}

export async function apiPatchAnswer(answerId: string, payload: { status?: string; text?: string }) {
  return apiFetch<any>(`/api/answers/${answerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function apiRegenerateAnswer(answerId: string) {
  return apiFetch<{ jobId: string; status: string }>(`/api/answers/${answerId}/regenerate`, {
    method: "POST",
  });
}

export async function apiListProjectAnswers(projectId: string) {
  return apiFetch<any[]>(`/api/answers/project/${projectId}`);
}

// ─── Knowledge Base API ───────────────────────────────

export async function apiUploadKnowledge(file: File) {
  let token = await getAuthToken();
  const formData = new FormData();
  formData.append("file", file);

  let res = await fetch(`${API_BASE}/api/knowledge`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (res.status === 401 && typeof window !== "undefined") {
    try {
      const seedRes = await fetch(`${API_BASE}/api/auth/seed-dev`, { method: "POST" });
      if (seedRes.ok) {
        const data = await seedRes.json();
        token = data.access_token;
        if (token) {
          localStorage.setItem("proposal_assistant_token", token);
          res = await fetch(`${API_BASE}/api/knowledge`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
        }
      }
    } catch {}
  }

  if (!res.ok) {
    let errMsg = `Failed to upload knowledge document (HTTP ${res.status})`;
    try {
      const text = await res.text();
      try {
        const errData = JSON.parse(text);
        errMsg = errData?.detail?.error?.message || (typeof errData?.detail === 'string' ? errData.detail : JSON.stringify(errData?.detail)) || errMsg;
      } catch {
        if (text) errMsg = `Server error (${res.status}): ${text.slice(0, 150)}`;
      }
    } catch {}
    throw new Error(errMsg);
  }
  return res.json();
}

export async function apiListKnowledge() {
  return apiFetch<any[]>("/api/knowledge");
}

export async function apiDeleteKnowledge(id: string) {
  return apiFetch<void>(`/api/knowledge/${id}`, {
    method: "DELETE",
  });
}

// ─── Mem0 Memory API ────────────────────────────────────────────────────────

export async function apiListMemories(projectId?: string): Promise<any[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return apiFetch<any[]>(`/api/memory${query}`);
}

export async function apiCreateMemory(text: string, projectId?: string): Promise<any> {
  return apiFetch<any>("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, projectId: projectId || null }),
  });
}

export async function apiDeleteMemory(memoryId: string): Promise<any> {
  return apiFetch<any>(`/api/memory/${encodeURIComponent(memoryId)}`, {
    method: "DELETE",
  });
}

export async function apiSearchMemories(query: string, projectId?: string): Promise<any[]> {
  return apiFetch<any[]>("/api/memory/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, projectId: projectId || null, limit: 5 }),
  });
}

// ─── Enterprise Connectors API ──────────────────────────────────────────────

export async function apiListConnectors(): Promise<any[]> {
  return apiFetch<any[]>("/api/connectors");
}

export async function apiTestConnector(connectorId: string, config: Record<string, any>): Promise<any> {
  return apiFetch<any>(`/api/connectors/${encodeURIComponent(connectorId)}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
}

export async function apiSyncConnector(
  connectorId: string,
  config: Record<string, any>,
  projectId?: string
): Promise<any> {
  return apiFetch<any>(`/api/connectors/${encodeURIComponent(connectorId)}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config, projectId: projectId || null }),
  });
}

export async function apiUploadPastRfp(file: File, projectId?: string): Promise<any> {
  let token = await getAuthToken();
  const formData = new FormData();
  formData.append("file", file);
  if (projectId) formData.append("projectId", projectId);

  let res = await fetch(`${API_BASE}/api/connectors/upload-past-rfp`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    let errMsg = "Failed to upload past RFP.";
    try {
      const errData = await res.json();
      errMsg = errData?.detail?.error?.message || errData?.detail || errMsg;
    } catch {}
    throw new Error(errMsg);
  }
  return res.json();
}
