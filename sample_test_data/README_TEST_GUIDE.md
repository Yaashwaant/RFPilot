# RFPilot – End-to-End Test Guide

This folder contains a complete suite of realistic sample documents and Excel workbooks to test the full lifecycle of **RFPilot**: Knowledge Ingestion (Mem0), Connectors, and Automated RFP Spreadsheet Generation.

---

## 📁 Included Sample Files

| File | Type | Purpose | Where to Upload |
| :--- | :--- | :--- | :--- |
| **`ApexFlow_Security_and_Architecture_Whitepaper.pdf`** | PDF | Official technical security whitepaper (SSO, encryption, 90-day retention, SOC 2 Type II, 99.95% SLA, RTO < 1h, APIs). | **Knowledge Base** (`/knowledge` -> *Document Collateral* tab) |
| **`ApexFlow_Security_and_Architecture_Whitepaper.txt`** | Plain Text | Text equivalent of the whitepaper for testing text uploads. | **Knowledge Base** (`/knowledge` -> *Document Collateral* tab) |
| **`ApexFlow_Enterprise_Trust_Center.md`** | Markdown | Markdown version for testing markdown uploads or pasting into external tools. | **Knowledge Base** (`/knowledge` -> *Document Collateral* tab) |
| **`Past_Completed_RFP_ApexFlow_2025.xlsx`** | Excel | A past completed RFP with questions and pre-approved answers. | **Knowledge Base** (`/knowledge` -> *Connectors* tab -> *Upload Past RFP Workbook*) |
| **`RFP_Evaluation_Worksheet_Blank.xlsx`** | Excel | **The RFP Questionnaire** with 12 enterprise requirements and empty response cells. | **New Project** (`/projects/new` or New Project button) |

---

## 🚀 Step-by-Step Test Walkthrough

### Step 1: Ingest Collateral into Mem0
1. Navigate to `http://localhost:3000/knowledge`.
2. **Option A (Document Upload):**
   - Click the **Document Collateral** tab.
   - Drag and drop or upload `ApexFlow_Security_and_Architecture_Whitepaper.pdf`.
   - RFPilot extracts the text via `pypdf`, splits it into passages, and commits them to **Mem0**.
3. **Option B (Past RFP Workbook Connector):**
   - Click the **Connectors** tab.
   - In the **Upload Past RFP Workbook** card, drop `Past_Completed_RFP_ApexFlow_2025.xlsx`.
   - RFPilot auto-detects the question and approved response columns and ingests all Q&A pairs into **Mem0**.
4. Check the **Mem0 Institutional Memory** tab:
   - Notice the newly indexed facts from ApexFlow! You can type queries like `"retention"` or `"SSO"` to verify instant semantic search.

---

### Step 2: Upload the Blank RFP Spreadsheet
1. Go to `http://localhost:3000/projects`.
2. Click **New Project** (or **Import RFP**).
3. Select `RFP_Evaluation_Worksheet_Blank.xlsx`.
4. Name the project (e.g., `"Acme Bank Security Evaluation 2026"`).
5. Click **Create Project**.

---

### Step 3: Generate RFP Answers
1. Inside the interactive spreadsheet view, you will see 12 enterprise requirements (SAML 2.0/OIDC SSO, AES-256 encryption, 90-day retention with NIST 800-88 wipe, SOC 2 Type II audit by EY, 99.95% uptime SLA, RTO < 1h, 10,000 req/min rate limits).
2. Click any row's empty cell under **Vendor Response (Column D)**.
3. Click **Add Answer** in the bottom floating dock:
   - **Step 1:** Select target cell (already auto-selected).
   - **Step 2:** Select the question prompt (auto-detected).
   - Click **Generate Answer**.
4. Watch RFPilot query **Mem0**, retrieve the exact grounded clauses from `ApexFlow_Security_and_Architecture_Whitepaper.pdf`, and write a concise, professional 3-4 sentence enterprise response!
5. Click **Accept Answer** — RFPilot updates the spreadsheet and reinforces Mem0 continuous learning.

---

### Step 4: Export Completed Workbook
- Click **Export Spreadsheet** in the top navigation bar to download the updated `.xlsx` file with all responses populated.
