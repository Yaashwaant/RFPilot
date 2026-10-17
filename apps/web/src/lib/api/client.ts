/**
 * Proposal Assistant – Typed API Client
 * Interfaces with FastAPI backend with bearer token authorization.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  let token = localStorage.getItem("proposal_assistant_token");
  if (!token) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/seed-dev`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        token = data.access_token;
        if (token) localStorage.setItem("proposal_assistant_token", token);
      }
    } catch {}
  }
  return token;
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let token = await getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // If unauthorized (e.g. expired dev token), refresh token once and retry
  if (res.status === 401 && typeof window !== "undefined") {
    try {
      const seedRes = await fetch(`${API_BASE}/api/auth/seed-dev`, { method: "POST" });
      if (seedRes.ok) {
        const data = await seedRes.json();
        token = data.access_token;
        if (token) {
          localStorage.setItem("proposal_assistant_token", token);
          headers["Authorization"] = `Bearer ${token}`;
          res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
          });
        }
      }
    } catch {}
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
    let errMsg = "Failed to upload project workbook.";
    try {
      const errData = await res.json();
      errMsg = errData?.detail?.error?.message || errData?.detail || errMsg;
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
    let errMsg = "Failed to upload knowledge document.";
    try {
      const errData = await res.json();
      errMsg = errData?.detail?.error?.message || errData?.detail || errMsg;
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
