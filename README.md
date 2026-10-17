# Proposal Assistant (Excel MVP)

> **Enterprise AI Proposal Assistant:** An AI-powered RFP co-pilot that embeds real office spreadsheets (ONLYOFFICE Docs) inside a modern Next.js workspace, allowing bid managers to select cells, capture questions, and stream grounded, citation-backed answers directly into active Excel workbooks with 100% formatting fidelity.

---

## 1. System Topology & Architecture

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
      │   - Answer Worker (Hybrid RAG)    │────────► Grounded LLM Generator
      │   - Knowledge Ingestion Worker    │
      └───────────────────────────────────┘
```

### Core Architectural Decisions (ADRs)
1. **D1: Embedded Real Office Editor (ONLYOFFICE Docs):** Guarantees 100% rendering and export fidelity for complex spreadsheets with formulas, formatting, and merges.
2. **D2: Front-End `EditorAdapter` Abstraction:** Insulates flow logic from editor quirks, allowing future format extensions (Word, PPT, PDF) and alternative engines without touching UI components.
3. **D3: Client-Side Cell Writing:** Writes execute in the active editor instance, preserving font inheritance, row auto-fit, and editor undo trees.
4. **D4: Structured `CellAnchor` Representation:** `{ sheet, address, mergedRange }` coordinates survive browser reloads, drawer toggles, and multi-user sessions.
5. **D5: Async Celery Jobs + SSE Streaming:** Offloads heavy LLM and vector operations while maintaining instant time-to-first-token visual feedback.
6. **D6: Multi-Tenant Workspace Partitioning:** Enforced across all database rows, storage keys (`{workspace_id}/...`), and Redis channels.
7. **D7: Zero-Hallucination Guardrail:** `NO_SOURCE` fallback terminates generation when retrieved passages fail minimum relevance thresholds.

---

## 2. In-Situ Add Answer Flow & State Machine

```
[IDLE] ──(onPointerDown AddAnswerButton)──► [PICK_QUESTION]
                                                    │
                                           (Select question cell)
                                                    ▼
[REVIEW] ◄──(SSE 'done' event)── [GENERATING] ◄── [READY] (Click "Go")
   │
   ├── Accept: clears AI draft blue tint, persists ACCEPTED in DB
   ├── Undo: executes adapter.restoreCell(), reverts cell to pre-generation snapshot
   └── Regenerate: re-posts job with alternative phrasing
```

> **Preventing Focus Loss:** When clicking the external "Add Answer" button, browser focus normally shifts away from the editor iframe, clearing the active selection. Binding to `onPointerDown` captures the selection *before* the blur event fires.

---

## 3. Directory Layout

```
Proposal Assistant/
├── apps/
│   ├── web/                     # Next.js 16 (React 19, TypeScript, Tailwind CSS)
│   │   ├── src/app/
│   │   │   ├── projects/        # Proposal dashboard & upload modal
│   │   │   ├── projects/[id]/   # Workspace editor screen (ONLYOFFICE & document box)
│   │   │   └── knowledge/       # Collateral manager (upload, chunk stats)
│   │   ├── src/components/
│   │   │   ├── document-box/    # EditorHost, AddAnswerButton, StepBanner, QuestionChip
│   │   │   ├── drawer/          # AnswerDrawer, SourcesList, ReviewActions
│   │   │   └── activity/        # ActivityList with jump-to-cell navigation
│   │   └── src/lib/
│   │       ├── editor/          # EditorAdapter & OnlyOfficeExcelAdapter
│   │       ├── flow/            # Zustand flow state machine
│   │       └── api/             # Typed API client & useJobStream SSE hook
│   │
│   └── api/                     # FastAPI Backend (Python 3.11+)
│       ├── app/
│       │   ├── core/            # Config, Database, Security, Storage
│       │   ├── models/          # SQLAlchemy ORM models (Workspace, User, Project, Answer, KBChunk)
│       │   ├── schemas/         # Pydantic v2 DTOs (Job, Project, Answer, Knowledge)
│       │   ├── routers/         # REST & SSE endpoints
│       │   ├── rag/             # Hybrid Retriever, Reranker, Grounded Generator
│       │   └── workers/         # Celery tasks (Answer worker & Ingestion worker)
│       ├── Dockerfile
│       └── requirements.txt
│
├── infra/
│   ├── docker-compose.yml       # Stack: postgres+pgvector, redis, minio, onlyoffice, api, worker
│   └── postgres/init.sql        # Database extensions (uuid-ossp, pgcrypto, vector)
│
├── packages/contracts/          # Shared TypeScript contracts & DTO types
├── design-system/               # Proposal Assistant design system & tokens
└── wiki/                        # Architecture & technical documentation
```

---

## 4. Quickstart Guide

### Option A: Complete Docker Compose Stack
```bash
docker compose up -d
```
- Web Application: `http://localhost:3000`
- API Documentation: `http://localhost:8000/docs`
- ONLYOFFICE Server: `http://localhost:8080`
- MinIO Console: `http://localhost:9001`

### Option B: Local Development
1. **Frontend:**
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```
2. **Backend:**
   ```bash
   cd apps/api
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```
