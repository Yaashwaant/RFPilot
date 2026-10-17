# API Contracts & SSE Streaming

**Source:** Derived from [`LLD – Proposal Assistant.docx`](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/.memory/LLD%20–%20Proposal%20Assistant.docx) §4 and §5.

---

## 1. REST API Specification

All endpoints require a Bearer token in the `Authorization` header (`Bearer <access_token>`) except `/api/auth/*`. Standard error responses return:
```json
{
  "error": {
    "code": "STRING_IDENTIFIER",
    "message": "Human-readable explanation of error."
  }
}
```

### 1.1 Projects Endpoints

#### `POST /api/projects`
Uploads a new RFP document (`.xlsx` in MVP) and creates a project.
- **Request:** `multipart/form-data` with fields `file` (binary) and `name` (string).
- **Validation:** File must be `.xlsx`, size $\le$ 25 MB, no macro code.
- **Response:** `201 Created`
  ```json
  {
    "id": "7f8c1d2e-4b5a-4f6c-8e1d-2a3b4c5d6e7f",
    "name": "Acme Corp RFP Q4.xlsx",
    "fileType": "xlsx",
    "status": "active"
  }
  ```

#### `GET /api/projects`
Lists all active projects for the authenticated workspace.
- **Response:** `200 OK`
  ```json
  [
    {
      "id": "7f8c1d2e-4b5a-4f6c-8e1d-2a3b4c5d6e7f",
      "name": "Acme Corp RFP Q4.xlsx",
      "filledCount": 18,
      "unreviewedCount": 2,
      "createdAt": "2026-10-17T09:00:00Z",
      "updatedAt": "2026-10-17T11:15:00Z"
    }
  ]
  ```

#### `GET /api/projects/{id}`
Returns project details along with ONLYOFFICE initialization config.
- **Response:** `200 OK`
  ```json
  {
    "id": "7f8c1d2e-4b5a-4f6c-8e1d-2a3b4c5d6e7f",
    "name": "Acme Corp RFP Q4.xlsx",
    "status": "active",
    "editorConfig": {
      "documentServerUrl": "https://editor.internal.local",
      "documentType": "cell",
      "docKey": "7f8c1d2e_v4_171829100",
      "fileUrl": "https://s3.amazonaws.com/tenant-bucket/working.xlsx?X-Amz-Signature=...",
      "callbackUrl": "https://api.internal.local/api/editor/callback?projectId=7f8c1d2e-...",
      "jwtToken": "eyJhbGciOi...",
      "user": {
        "id": "usr-123",
        "name": "Yashwant"
      }
    }
  }
  ```

#### `GET /api/projects/{id}/export?keepTint=false`
Initiates force-save to the editor, checks for unreviewed cells, and returns a pre-signed download link.
- **Query Parameter:** `keepTint` (boolean, default `false`).
- **Response:** `200 OK`
  ```json
  {
    "downloadUrl": "https://s3.amazonaws.com/tenant-bucket/Acme_Corp_RFP_Q4_filled.xlsx?...",
    "fileName": "Acme_Corp_RFP_Q4_filled.xlsx",
    "unreviewedDraftsCount": 2
  }
  ```

---

### 1.2 Jobs & Answers Endpoints

#### `POST /api/projects/{id}/jobs`
Creates an asynchronous answer generation task.
- **Request Body:**
  ```json
  {
    "questionText": "Describe your data retention and purge policy.",
    "questionAnchor": {
      "sheet": "Security & Compliance",
      "address": "B14"
    },
    "answerAnchor": {
      "sheet": "Security & Compliance",
      "address": "C14",
      "mergedRange": "C14:E14"
    },
    "context": {
      "columnHeaders": ["Requirement / Prompt", "Vendor Response", "Compliance Status"],
      "sectionLabel": "Section 4: Data Protection",
      "neighbours": ["Customer data is encrypted at rest using AES-256.", "SOC2 Type II certified."],
      "charLimit": 1000
    },
    "options": {
      "length": "standard",
      "tone": "professional"
    }
  }
  ```
- **Response:** `202 Accepted`
  ```json
  {
    "jobId": "e3b0c442-98fc-1c14-9afb-4c7b8019e648",
    "status": "QUEUED"
  }
  ```

#### `POST /api/jobs/{id}/cancel`
Aborts an in-flight Celery job.
- **Response:** `200 OK` `{"status": "CANCELLED"}`

#### `GET /api/jobs/{id}`
Returns final or current status of a job (used during network reconnection).
- **Response:** `200 OK`
  ```json
  {
    "id": "e3b0c442-98fc-1c14-9afb-4c7b8019e648",
    "status": "DONE",
    "answer": {
      "id": "ans-99",
      "text": "Our systems retain operational data for 90 days...",
      "sources": [...],
      "confidence": "HIGH"
    }
  }
  ```

#### `PATCH /api/answers/{id}`
Updates review status or manual edits.
- **Request Body:**
  ```json
  {
    "status": "ACCEPTED", // 'ACCEPTED' | 'EDITED' | 'REJECTED' | 'UNDONE'
    "text": "Optional updated text if user edited in drawer"
  }
  ```

#### `POST /api/answers/{id}/regenerate`
Clones original anchors and context to spawn a fresh answer generation job.

---

### 1.3 Knowledge Base Endpoints

| Method | Path | Request | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/knowledge` | `multipart/form-data` (`file`) | Uploads reference PDF/DOCX; queues parsing & embedding. |
| `GET` | `/api/knowledge` | Query: `status`, `page` | Lists indexed collateral with chunk count and sync state. |
| `DELETE` | `/api/knowledge/{id}` | None | Cascades deletion of document and associated vector chunks. |

---

## 2. Server-Sent Events (SSE) Streaming Protocol

Real-time answer streaming connects via `GET /api/jobs/{id}/stream`. The client receives standardized SSE event frames:

```
event: heartbeat
data: {"ts": 1718291200}

event: token
data: {"t": "We retain "}

event: token
data: {"t": "customer data "}

event: token
data: {"t": "for 90 days."}

event: sources
data: {"items": [{"doc": "Security-Whitepaper.pdf", "section": "4.2 Data Lifecycle", "snippet": "Customer records are expunged within 90 days...", "score": 0.88}]}

event: done
data: {"answerId": "ans-99", "status": "OK", "confidence": "HIGH", "truncated": false}
```

### Event Taxonomy
- `token`: Incrementally delivered text chunk from the LLM generator.
- `sources`: Grounded citations retrieved from the knowledge base.
- `done`: Finalization payload containing DB answer ID and confidence rating.
- `error`: Error payload (`{"code": "NO_SOURCE" | "LLM_TIMEOUT" | "RATE_LIMIT"}`).
- `heartbeat`: Dispatched every 15 seconds to prevent browser/proxy connection timeouts.

### Reconnection Contract (`useJobStream.ts`)
1. On unexpected disconnect before `done`, retry connection up to 3 times with exponential backoff (500ms, 1500ms, 4500ms).
2. If stream fails to re-establish, make an atomic fallback `GET /api/jobs/{id}` request to recover the finalized state from Postgres.

---

## 3. ONLYOFFICE Editor Webhook Lifecycle

ONLYOFFICE Docs sends document state updates to `POST /api/editor/callback?projectId={id}`.

### Callback Payload Schema
```json
{
  "key": "7f8c1d2e_v4_171829100",
  "status": 2,
  "url": "https://editor.internal.local/output/download/7f8c1d2e.xlsx",
  "users": ["usr-123"],
  "actions": [{"type": 0, "userid": "usr-123"}]
}
```

### ONLYOFFICE Status Codes
- `1`: Document is actively open and being edited.
- `2`: Document is ready for saving (all users closed or auto-save triggered).
- `3`: Document saving error has occurred.
- `4`: Document closed without changes.
- `6`: Document is being force-saved (invoked via export service).

### Webhook Processing Routine
1. Validate JWT signature in `Authorization` header against shared secret.
2. If `status` is `2` or `6`:
   - Asynchronously stream-download the updated file from `url`.
   - Upload file to MinIO/S3 under project's `working_key`.
   - Generate a new `editor_doc_key` timestamp string.
   - Update `project` record in PostgreSQL.
3. Immediately return `{"error": 0}` to prevent ONLYOFFICE retry loops.
