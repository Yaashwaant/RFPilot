# Database Schema & Multi-Tenancy

**Source:** Derived from [`LLD – Proposal Assistant.docx`](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/.memory/LLD%20–%20Proposal%20Assistant.docx) §3 and [`HLD`](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/.memory/HLD%20–%20Proposal%20Assistant.docx) §7.

---

## 1. Overview & Data Model Design

The database layer utilizes **PostgreSQL 16** with the **`pgvector`** extension. The schema balances relational integrity (foreign key cascades, status checks) with document-level flexibility (`JSONB` for anchors and metadata).

All tables are multi-tenant by design through explicit `workspace_id` partitioning, supplemented by PostgreSQL Row-Level Security (RLS) policies.

```
       ┌────────────────┐
       │   workspace    │
       └───┬────────────┘
           │
           ├────────────────────────────┬────────────────────────────┐
           ▼                            ▼                            ▼
      ┌──────────┐               ┌───────────────┐           ┌──────────────┐
      │ app_user │               │ knowledge_doc │           │   project    │
      └────┬─────┘               └───────┬───────┘           └───────┬──────┘
           │                             │ 1:N                       │
           │                             ▼                           │ 1:N
           │                       ┌──────────┐                      ▼
           │                       │ kb_chunk │                ┌────────────┐
           │                       └──────────┘                │ answer_job │
           │                                                   └─────┬──────┘
           │                                                         │ 1:N
           │                                                         ▼
           │                                                   ┌────────────┐
           └────────────────── audit_event ────────────────────┤   answer   │
                                                               └────────────┘
```

---

## 2. Complete DDL Schema

```sql
-- Enable necessary extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- 1. Workspace (Tenant root)
create table workspace (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial',
  created_at timestamptz not null default now()
);

-- 2. App Users
create table app_user (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  email text not null unique,
  name text,
  role text not null check (role in ('owner', 'member', 'viewer')),
  password_hash text,
  created_at timestamptz not null default now()
);
create index idx_user_workspace on app_user(workspace_id);

-- 3. Projects (RFP / RFI working files)
create table project (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  name text not null,
  file_type text not null default 'xlsx',
  original_key text not null,          -- S3 key for unaltered file
  working_key text not null,           -- S3 key for current working version
  editor_doc_key text not null,        -- ONLYOFFICE document key, rotated on each save
  keep_ai_tint_on_export boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  created_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_project_workspace on project(workspace_id);

-- 4. Answer Generation Jobs
create table answer_job (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  workspace_id uuid not null references workspace(id) on delete cascade,
  question_text text not null,
  question_anchor jsonb not null,      -- e.g. {"sheet": "Sheet1", "address": "B14"}
  answer_anchor jsonb not null,        -- e.g. {"sheet": "Sheet1", "address": "C14"}
  context jsonb,                       -- headers, section labels, neighbors, charLimit
  options jsonb,                       -- length, tone, custom instructions
  status text not null check (status in ('QUEUED', 'RUNNING', 'DONE', 'NO_SOURCE', 'FAILED', 'CANCELLED')),
  error_code text,
  created_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index idx_answer_job_project_created on answer_job(project_id, created_at desc);
create index idx_answer_job_workspace on answer_job(workspace_id);

-- 5. Generated Answers & Versions
create table answer (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references answer_job(id) on delete cascade,
  project_id uuid not null references project(id) on delete cascade,
  workspace_id uuid not null references workspace(id) on delete cascade,
  answer_anchor jsonb not null,
  version int not null default 1,
  text text not null,
  sources jsonb not null default '[]', -- array of {doc, section, snippet, score}
  confidence text check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  status text not null check (status in ('DRAFT', 'ACCEPTED', 'EDITED', 'REJECTED', 'UNDONE')),
  previous_value jsonb,                -- pre-generation cell snapshot for undo
  truncated boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_answer_project_status on answer(project_id, status);
create index idx_answer_workspace on answer(workspace_id);

-- 6. Knowledge Base Documents
create table knowledge_doc (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  name text not null,
  file_key text not null,              -- S3 key for stored document
  mime_type text,
  status text not null check (status in ('UPLOADED', 'PROCESSING', 'READY', 'FAILED')),
  error text,
  uploaded_by uuid references app_user(id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index idx_kb_doc_workspace on knowledge_doc(workspace_id);

-- 7. Knowledge Base Chunks (Hybrid Search with tsvector & vector)
create table kb_chunk (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references knowledge_doc(id) on delete cascade,
  workspace_id uuid not null references workspace(id) on delete cascade,
  section text,
  content text not null,
  tsv tsvector generated always as (to_tsvector('english', content)) stored,
  embedding vector(1024)               -- Dimension matches chosen embedding model
);

-- Fast keyword search index
create index idx_kb_chunk_tsv on kb_chunk using gin (tsv);

-- High-performance approximate nearest neighbor index for vector search
create index idx_kb_chunk_embedding on kb_chunk using hnsw (embedding vector_cosine_ops);
create index idx_kb_chunk_workspace on kb_chunk(workspace_id);

-- 8. Audit Events
create table audit_event (
  id bigserial primary key,
  workspace_id uuid not null references workspace(id) on delete cascade,
  user_id uuid references app_user(id) on delete set null,
  project_id uuid references project(id) on delete cascade,
  action text not null,                -- 'UPLOAD', 'FILL', 'ACCEPT', 'EDIT', 'UNDO', 'DOWNLOAD'
  detail jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_workspace_created on audit_event(workspace_id, created_at desc);
```

---

## 3. Row-Level Security (RLS) Multi-Tenancy Defense

In addition to programmatic filtering in FastAPI query builders, PostgreSQL Row-Level Security guarantees cross-tenant isolation at the engine level:

```sql
alter table project enable row level security;
alter table answer_job enable row level security;
alter table answer enable row level security;
alter table knowledge_doc enable row level security;
alter table kb_chunk enable row level security;

-- Policy template for tenant isolation:
create policy tenant_isolation_project on project
  for all using (workspace_id = current_setting('app.current_workspace_id')::uuid);
```
FastAPI sets the session configuration variable `set local app.current_workspace_id = :ws_id` on every acquired database connection.
