# Architecture & System Context

**Source:** Derived from [`HLD – Proposal Assistant.docx`](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/.memory/HLD%20–%20Proposal%20Assistant.docx) and architectural deliberations.

---

## 1. Architectural Goals

| Goal | Description & Rationale |
| :--- | :--- |
| **Fidelity First** | The buyer's RFP file must be rendered and exported with formatting, cell styles, merges, formulas, and fonts 100% intact. |
| **Format-Agnostic Core** | Excel (.xlsx) is the primary MVP target, but the flow engine, RAG pipeline, anchor abstractions, and review states must naturally support Word (.docx), PowerPoint (.pptx), and PDF without core redesign. |
| **Strict Isolation** | Multi-tenant by default. Every database table, Redis channel, and object storage key is strictly partitioned by `workspace_id`. |
| **Replaceable AI** | The RAG and answer generation services sit behind clean, pluggable interfaces (`Retriever`, `Reranker`, `Generator`) to allow model upgrades without touching application logic. |
| **Responsive Feel** | Streaming responses via Server-Sent Events (SSE), optimistic UI states, and async non-blocking background workers. |
| **Lean Operations** | Minimal moving parts, containerized local development via Docker Compose, and straightforward deployment to managed cloud infrastructure. |

---

## 2. System Topology & Context Diagram

```
                 Users (Bid Managers, Pre-Sales, Reviewers)
                                     │
                                     ▼
      ┌────────────────────────────────────────────────────────┐
      │                   Web App (Next.js)                    │
      │  UI Chrome, Flow Engine (Zustand), EditorHost Wrapper  │
      └──────────────┬────────────────────────▲────────────────┘
                     │ (HTTPS / SSE)          │ (iframe postMessage / Connector)
                     ▼                        ▼
      ┌──────────────────────────┐     ┌───────────────────────────────────┐
      │   API Service (FastAPI)  │     │   Office Editor Server            │
      │   Auth, Projects, Jobs,  │     │   (ONLYOFFICE Docs in Docker)     │
      │   KB, Editor Callbacks   │     └──────────────┬────────────────────┘
      └───────┬──────────────┬───┘                    │ (Fetch file & save callback)
              │              │                        ▼
              │              │         ┌───────────────────────────────────┐
              │              └────────►│   Object Storage (S3 / MinIO)     │
              │                        │   Originals, Working, Exports, KB │
              ▼                        └───────────────────────────────────┘
      ┌──────────────────────────┐
      │   PostgreSQL + pgvector  │
      │   Relational data + HNSW │
      └──────────────────────────┘
              ▲
              │ Context lookup
      ┌───────┴──────────────────┐
      │   Job Queue (Redis)      │
      └──────────────┬───────────┘
                     │ Celery tasks
                     ▼
      ┌───────────────────────────────────┐
      │   Background Workers (Celery)     │
      │   - Answer Worker (Hybrid RAG)    │────────► LLM Provider (Claude API / OpenAI)
      │   - Knowledge Ingestion Worker    │
      └───────────────────────────────────┘
```

---

## 3. Main System Components

| Component | Technology Stack | Core Responsibility |
| :--- | :--- | :--- |
| **Web Application** | Next.js 14/15, React, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, Zustand, TanStack Query | Renders UI chrome around the document box, executes the Add Answer state machine, manages SSE subscriptions, renders the slide-over Answer Drawer, displays activity logs. |
| **Office Editor Server** | ONLYOFFICE Docs (Enterprise / Community Edition) in Docker | Operates as an independent document server. Renders the workbook with native Office fidelity, executes client-side cell writes and styles, and dispatches periodic save callbacks to the API. |
| **Editor Adapter** | TypeScript (`EditorAdapter` interface) | A decoupled abstraction layer between the Next.js flow engine and the editor iframe. Standardizes cell selection, reading, writing, styling, and navigation. |
| **API Gateway / Service** | FastAPI (Python 3.11+), SQLAlchemy 2.0, Pydantic v2 | Manages authentication, workspace isolation, project lifecycle, job dispatch, document save webhooks from ONLYOFFICE, and export orchestration. |
| **Job Queue & Broker** | Redis 7 | Coordinates asynchronous Celery jobs, message deduplication, and SSE pub/sub relay. |
| **Workers** | Celery (Python) | Executes answer generation and document ingestion off the main HTTP thread to avoid timeouts and blocking. |
| **Answer Service (RAG)** | In-process Python module inside workers (`Retriever`, `Reranker`, `Generator`) | Runs hybrid search (Postgres full-text `tsvector` + vector cosine similarity `pgvector`), reranks chunks, and streams generated tokens back to Redis. |
| **Database** | PostgreSQL 16 with `pgvector` | Stores users, workspaces, projects, answer jobs, versioned answers, knowledge documents, chunk embeddings (1024-dim), and audit logs. |
| **Object Storage** | AWS S3 or MinIO | Stores original uploaded documents, active working copies, exported filled files, and uploaded knowledge base source files. |

---

## 4. Key Architectural Decisions (ADRs)

- **D1: Embed a real Office editor instead of building a custom renderer.**  
  *Rationale:* Complex RFP Excel sheets contain nested formulas, conditional formatting, merged headers, and custom font weights. Custom canvas or DOM renderers fail on edge-case fidelity. ONLYOFFICE guarantees native Office fidelity.
- **D2: Wrap the editor behind a modular `EditorAdapter` interface.**  
  *Rationale:* Insulates the UI flow engine from editor implementation details. Enables future migration to Collabora or file-type expansion (Word, PowerPoint, PDF) with zero changes to the state machine.
- **D3: Client-side write into the editor; editor handles persistence.**  
  *Rationale:* Writing directly into the editor via its connector API preserves the active undo stack, font inheritance, and layout calculation in real time.
- **D4: Structured `CellAnchor` representations rather than ephemeral cursor offsets.**  
  *Rationale:* Storing `{ sheet: string, address: string, mergedRange?: string }` ensures answers survive browser refreshes, drawer toggles, and multi-session reviews.
- **D5: Async background jobs streamed over Server-Sent Events (SSE).**  
  *Rationale:* RAG retrieval + LLM synthesis can take 4–15 seconds. SSE allows immediate time-to-first-token streaming while maintaining connection resiliency.
- **D6: Multi-tenant by workspace ID across all layers.**  
  *Rationale:* Every database row, Redis pub/sub channel (`job:{id}`), and S3 bucket key prefix (`{workspace_id}/...`) is strictly partitioned.
- **D7: In-process RAG in Celery workers for MVP.**  
  *Rationale:* Keeps operational overhead low for early releases while maintaining an internal interface contract that can be split into a separate microservice when load dictates.

---

## 5. Security & Isolation Architecture

1. **Authentication:** Argon2 password hashing, short-lived JWT access tokens (15 minutes), rotating refresh tokens stored in `HttpOnly`, `SameSite=Lax`, `Secure` cookies. Google OAuth 2.0 / SSO ready.
2. **Authorization & RBAC:** Role-based access control (`owner`, `member`, `viewer`). Enforced through FastAPI dependency injection where all SQL queries filter on `workspace_id`.
3. **ONLYOFFICE JWT Validation:** Inter-service security between FastAPI and ONLYOFFICE Docs utilizes a shared HMAC secret. The editor server validates signed JWT payloads before serving or updating documents.
4. **Pre-Signed Storage URLs:** Direct document access is gated by pre-signed S3 URLs with short TTLs (5 minutes).
5. **LLM Data Confidentiality:** Zero-retention enterprise API contracts (e.g., Anthropic Claude / AWS Bedrock). Prompts contain only retrieved knowledge passages and the specific question text.
6. **File Sanitization:** Uploaded files undergo MIME-type verification, extension validation, file-size enforcement (max 25MB), macro inspection (`.xlsm` / VBA macro detection), and antivirus scanning.
