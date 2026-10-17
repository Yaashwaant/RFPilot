# RAG Pipeline & Knowledge Ingestion

**Source:** Derived from [`LLD – Proposal Assistant.docx`](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/.memory/LLD%20–%20Proposal%20Assistant.docx) §5.2–§5.5 and [`HLD`](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/.memory/HLD%20–%20Proposal%20Assistant.docx) §6.4.

---

## 1. RAG Architecture & Execution Flow

```
   [User presses "Go"]
           │
           ▼
   ┌────────────────────────────────────────────────────────┐
   │ Context Builder (Question text + Section + Neighbors)   │
   └───────────────────────┬────────────────────────────────┘
                           │ Query String
                           ▼
   ┌────────────────────────────────────────────────────────┐
   │ Hybrid Search (PostgreSQL)                             │
   │ - Full-Text Search: tsv @@ plainto_tsquery             │
   │ - Vector Search: HNSW (embedding <=> query_vec)        │
   │ - Reciprocal Rank Fusion (RRF) -> Top 30 Candidates    │
   └───────────────────────┬────────────────────────────────┘
                           │ 30 Candidates
                           ▼
   ┌────────────────────────────────────────────────────────┐
   │ Cross-Encoder / Reranker                               │
   │ Selects Top 6 most relevant chunks                     │
   └───────────────────────┬────────────────────────────────┘
                           │
                 Is top score >= MIN_SCORE?
                 ├─── NO ──► Publish "NO_SOURCE" event (Zero Hallucination)
                 └─── YES
                           │ Top 6 Chunks
                           ▼
   ┌────────────────────────────────────────────────────────┐
   │ Generator (Claude API / Streaming LLM)                 │
   │ - Grounded prompt with citation instructions           │
   │ - Character limit enforcement                          │
   │ - Streams tokens to Redis Pub/Sub                      │
   └───────────────────────┬────────────────────────────────┘
                           │
                           ▼
   ┌────────────────────────────────────────────────────────┐
   │ Result Finalizer (Citations, Confidence Scoring)       │
   │ Persists to DB -> Dispatches "done" SSE event          │
   └────────────────────────────────────────────────────────┘
```

---

## 2. Ingestion Pipeline (`run_kb_ingestion_job`)

When users upload collateral (past proposals, security whitepapers, SOC2 reports, architecture diagrams):
1. **Document Extraction:**
   - **PDF:** Extracts structural headings, body paragraphs, and tabular grids.
   - **DOCX / XLSX / TXT:** Extracts raw text grouped by heading hierarchies and spreadsheet rows.
2. **Semantic Chunking:**
   - Target size: 300 to 500 tokens with 50-token rolling overlap.
   - Chunks never split across major section breaks or table rows.
   - Section headers are prepended to each chunk (e.g., `Section 4.1: Access Control > Sub-requirement A`).
3. **Embedding Generation:**
   - Batched inference (32 chunks per call) using a 1024-dimensional embedding model (e.g., `voyage-3`, `text-embedding-3-large`, or `bge-large-en`).
4. **Database Ingestion:**
   - Chunks are inserted into `kb_chunk` with automatic PostgreSQL `tsvector` generation and HNSW index indexing.
   - Document status transitions from `PROCESSING` to `READY`.

---

## 3. Hybrid Search & Fusion

Pure vector search frequently misses exact keyword terms (e.g., acronyms like "FIPS 140-2", ISO codes, or product SKUs), while pure keyword search misses conceptual synonyms. We implement **Reciprocal Rank Fusion (RRF)** over both:

```sql
-- Hybrid query combining vector similarity and full-text matching:
with text_matches as (
  select id, rank() over (order by ts_rank_cd(tsv, plainto_tsquery('english', :query)) desc) as t_rank
  from kb_chunk
  where workspace_id = :workspace_id and tsv @@ plainto_tsquery('english', :query)
  limit 50
),
vector_matches as (
  select id, rank() over (order by embedding <=> :query_vec asc) as v_rank
  from kb_chunk
  where workspace_id = :workspace_id
  order by embedding <=> :query_vec asc
  limit 50
)
select 
  c.id, c.doc_id, c.section, c.content,
  coalesce(1.0 / (60 + tm.t_rank), 0.0) + coalesce(1.0 / (60 + vm.v_rank), 0.0) as rrf_score
from kb_chunk c
left join text_matches tm on c.id = tm.id
left join vector_matches vm on c.id = vm.id
where tm.id is not null or vm.id is not null
order by rrf_score desc
limit 30;
```

---

## 4. Reranker & "Zero-Hallucination" Guardrail

1. The top 30 candidates are passed to a lightweight cross-encoder reranker (or LLM scoring pass) to yield the top 6 passages.
2. **Relevance Threshold Check:** If the top-scoring passage does not meet `MIN_SCORE` (e.g., 0.65 threshold), the worker **immediately aborts generation** and publishes a `NO_SOURCE` event.
   - *User Experience:* The UI notifies the user that the knowledge base lacks sufficient documentation for this question, inviting manual entry or knowledge base expansion rather than generating a false claim.

---

## 5. Generator Prompt Engineering

The system prompt enforces strict RFP compliance and tone rules:

```markdown
You are an expert bid manager and proposal architect responding to an RFP questionnaire.

CONTEXT RULES:
1. Base your answer EXCLUSIVELY on the provided REFERENCE PASSAGES.
2. If the passages do not provide adequate evidence to answer the question truthfully and completely, respond with: "NO_SOURCE".
3. Do not invent capabilities, certifications, or statistics.
4. Maintain a confident, professional, and compliant tone.
5. If a character limit is specified, your answer MUST NOT exceed that character limit.

QUESTION:
{question_text}

SPREADSHEET CONTEXT:
- Section: {section_label}
- Column Name: {column_header}
- Neighboring Context: {neighbours}
- Character Limit: {char_limit}

REFERENCE PASSAGES:
{passages_with_ids}

FORMATTING INSTRUCTIONS:
- Directly answer the prompt without conversational filler (do NOT say "Sure, here is the answer:").
- Include citations in bracketed format referencing Passage IDs.
```
