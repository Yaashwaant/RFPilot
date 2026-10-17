# Excel & Office Edge Case Rules

**Source:** Derived from [`LLD – Proposal Assistant.docx`](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/.memory/LLD%20–%20Proposal%20Assistant.docx) §6 and practical spreadsheet automation caveats.

---

## 1. Summary of Spreadsheet Edge Cases & Mitigations

Real-world RFP workbooks are notorious for complex formatting, locked grids, merged header blocks, and strict validation rules. The `EditorAdapter` enforces the following defensive mechanisms:

| Edge Case Scenario | Behavioral Symptom | Adapter & Engine Mitigation |
| :--- | :--- | :--- |
| **Merged Cell Range** | User clicks anywhere inside `C14:E14`. Writing to `D14` or `E14` causes spreadsheet engine corruption or fails silently. | The adapter queries `GetMergeInfo`. If merged, it automatically resolves writes to the **top-left cell** (`C14`) and stores `mergedRange` in `CellAnchor`. |
| **Target Cell Already Occupied** | Target cell contains existing vendor text or notes. Writing immediately would destroy user work. | UI detects non-empty content during `startFlow()` and displays an overwrite confirmation dialog: *"This cell already contains text. Overwrite with AI answer?"* |
| **Formula in Target Cell** | Cell contains an Excel calculation (e.g., `=SUM(...)` or `=VLOOKUP(...)`). | Treated as high-risk non-empty. UI alerts the user that generating an answer here will replace a formula with static text. |
| **Protected / Locked Cells** | Buyer has locked specific columns or password-protected sheets. | Adapter catches `PROTECTED` exception during write attempt. Displays a non-blocking toast: *"Target cell is locked by document author. Select an unlocked cell."* |
| **Data Validation Dropdown** | Cell requires one of `['Compliant', 'Non-Compliant', 'Exception']`. | If validation rule exists and AI response is freeform text, return `CELL_VALIDATION`. Prompt user to choose from the native dropdown. |
| **Excel 32,767 Character Limit** | Excel limits single cell content to 32,767 characters. | Truncate generated text at the nearest sentence boundary before 32,767 characters, set `truncated: true`, and display a length warning. |
| **AI Draft Visual Tint** | Users must easily distinguish AI-generated drafts from verified text. | When streamed/written, cell background color is tinted light blue (`#F0F7FF`). On `Accept()`, the original cell background styling is restored. |
| **Text Overflow & Row Clipping** | Multi-line text hides behind adjacent cells if text wrapping is off. | Adapter automatically enables `wrapText: true` on the target cell and commands auto-fit on the row height (unless explicit fixed row height is defined). |

---

## 2. Adapter Decision Flowchart

```
                 [Adapter Receives Write Request]
                                 │
                                 ▼
                     Is cell part of a merge?
                     ├─── YES ──► Redirect target to top-left cell
                     └─── NO  ──► Retain target address
                                 │
                                 ▼
                     Is cell protected/locked?
                     ├─── YES ──► ABORT: Return status "CELL_PROTECTED"
                     └─── NO
                                 │
                                 ▼
                  Has data-validation constraint?
                     ├─── YES ──► If value invalid: Return "CELL_VALIDATION"
                     └─── NO
                                 │
                                 ▼
                    Does length exceed 32,767 chars?
                     ├─── YES ──► Truncate at sentence boundary; mark truncated
                     └─── NO  ──► Retain full text
                                 │
                                 ▼
                    Write cell content to ONLYOFFICE
                    Enable text wrapping (wrapText = true)
                    Auto-fit row height if autoFitRow = true
                    Apply AI draft tint (#F0F7FF)
                                 │
                                 ▼
                     Return { ok: true, effectiveAnchor }
```

---

## 3. Cell Snapshot & Zero-Risk Undo Mechanism

To guarantee complete user confidence, modifying a cell must be 100% reversible without relying on fragile Ctrl+Z undo buffers:

1. **Before writing any tokens or text**, `adapter.snapshotCell(answerAnchor)` records:
   - Raw cell value (string or numeric)
   - Cell formula (if applicable)
   - Background fill color
   - Font family, size, and styling
   - Text alignment and wrap settings
2. **Snapshot Persistence:** The snapshot is stored in the PostgreSQL `answer` record under `previous_value` (JSONB) and held in the Zustand client store.
3. **Execution of `Undo()`:**
   - User clicks **"Undo"** in the Answer Drawer or presses `Cmd+Z` while in review mode.
   - The adapter executes `adapter.restoreCell(anchor, previousSnapshot)`.
   - The cell instantly reverts to its pristine state.
   - Database record is flagged as `UNDONE`.
