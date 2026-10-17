# Proposal Assistant — LLM Wiki Memory Index

Welcome to the **Proposal Assistant LLM Wiki**. This repository memory layer is compiled from the system's foundational specifications in [`.memory/`](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/.memory), including the High-Level Design (HLD), Low-Level Design (LLD), Product Requirements, and architectural dialogue.

This wiki functions as persistent long-term memory for AI agents and human developers across sessions.

---

## 🧭 Wiki Directory & Knowledge Graph

| Wiki Page | Focus Area | Primary Source in `.memory/` |
| :--- | :--- | :--- |
| **[Architecture & System Context](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/wiki/architecture.md)** | System topology, component roles, Docker/cloud environments, multi-tenancy, security model | `HLD – Proposal Assistant.docx` |
| **[Add Answer Flow & State Machine](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/wiki/flow-and-state-machine.md)** | Zustand state machine, UX transitions, pointer-down anchor capture, focus loss prevention | `LLD – Proposal Assistant.docx`, Claude dialogue |
| **[Editor Adapter & Document Host](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/wiki/editor-adapter.md)** | `EditorAdapter` interface, ONLYOFFICE connector API, cell anchors, draft tints, multi-format path | `LLD – Proposal Assistant.docx`, HLD §10 |
| **[Database Schema & Multi-Tenancy](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/wiki/database-schema.md)** | PostgreSQL + pgvector DDL, indexes, tenant isolation, audit logging, relations | `LLD – Proposal Assistant.docx` §3 |
| **[API Contracts & SSE Streaming](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/wiki/api-and-streaming.md)** | REST endpoints, Server-Sent Events (SSE) protocol, editor callback webhook, reconnection | `LLD – Proposal Assistant.docx` §4 |
| **[RAG Pipeline & Knowledge Ingestion](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/wiki/rag-pipeline.md)** | Document parsing, chunking, hybrid search (tsvector + HNSW), reranking, generator prompt | `HLD` §6.4, `LLD` §5.2-§5.5 |
| **[Excel & Office Edge Case Rules](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/wiki/excel-and-office-rules.md)** | Merged cells, validation lists, locked cells, character limits, formula guards, draft styling | `LLD – Proposal Assistant.docx` §6 |
| **[Master Implementation Plan](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/wiki/implementation-plan.md)** | 8-week structured roadmap, milestones, directory structure, testing strategy, verification | `LLD` §10, `HLD` §12 |

---

## 🎯 Executive Summary of Product

**Proposal Assistant** is an AI-powered enterprise application designed for bid managers, solution architects, and pre-sales teams responding to Requests for Proposals (RFPs) and Requests for Information (RFIs).

### The Core Problem Solved
Responding to complex RFP questionnaires (often delivered as heavily styled `.xlsx`, `.docx`, or `.pptx` documents) usually requires manual copy-pasting into disconnected web forms or ChatGPT windows. This risks:
1. **Loss of File Fidelity:** Broken formulas, ruined cell formatting, altered colors, damaged merged cells.
2. **Context Switching Fatigue:** Flipping back and forth between document editors and corporate knowledge bases.
3. **Hallucination & Lack of Auditability:** Answers generated without strict provenance or grounding in approved collateral.

### The Solution
A web application hosting an embedded, high-fidelity Office editor (ONLYOFFICE Docs) wrapped with a modern web application chrome (Next.js, Tailwind CSS, shadcn/ui, Framer Motion).
- **In-Situ Selection:** Users position their cursor where the answer belongs, click **"Add Answer"**, select the question cell/text, and click **"Go"**.
- **Contextual Hybrid RAG:** Grounded search over indexed company whitepapers, security documents, and past winning proposals.
- **Direct Live Streaming:** Tokens stream directly into the target cell with throttled updates (or atomic insertion on completion) while displaying citations in an attached slide-over review drawer.
- **Review & Export:** Users can Accept, Edit, Undo, or Regenerate before downloading a 100% fidelity `<original>_filled.xlsx` file.

---

## 🧱 Provenance & Sources

All knowledge in this wiki is synthesized from the authoritative source files preserved in `.memory/`:
- `AI-powered proposal assistant with document upload and auto-fill - Claude.html`: Architectural feasibility discussion and requirements dialogue.
- `AI-powered proposal assistant with document upload and auto-fill.pdf`: Original problem formulation and requirements exploration.
- `HLD – Proposal Assistant.docx`: High-Level Design specification (v0.1, 17 Oct 2026).
- `LLD – Proposal Assistant.docx`: Low-Level Design specification (v0.1, 17 Oct 2026).
