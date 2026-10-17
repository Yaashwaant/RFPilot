# Add Answer Flow & State Machine

**Source:** Derived from [`LLD – Proposal Assistant.docx`](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/.memory/LLD%20–%20Proposal%20Assistant.docx) §2 and the UX specification dialogue.

---

## 1. Overview of the User Flow

The core value proposition of the Proposal Assistant is its intuitive, in-situ **"Pick Target → Pick Question → Go"** workflow:

1. **User positions cursor** in the target answer cell inside the embedded spreadsheet.
2. **User clicks "Add Answer"** (pinned top-right of the document container).
3. **App enters Question Selection Mode** with an animated top banner: *"Select the RFP question in the sheet"*.
4. **User selects the question cell/range**; the banner displays a Question Chip with the captured text and enables the **"Go"** button.
5. **User clicks "Go"**; the AI RAG worker runs, streaming tokens live into the target cell and the slide-over drawer.
6. **User reviews the answer** with source citations and can **Accept**, **Edit**, **Regenerate**, or **Undo**.

---

## 2. State Machine Diagram

```
                 ┌──────────────┐
                 │     IDLE     │
                 └──────┬───────┘
                        │ onPointerDown "Add Answer"
                        │ (capture answerAnchor)
                        ▼
            ┌───────────────────────┐
       ┌───►│     PICK_QUESTION     │
       │    └───────────┬───────────┘
       │                │ onSelectionChange (question selected)
Clear  │                ▼
Question    ┌───────────────────────┐
       └────│         READY         │
            └───────────┬───────────┘
                        │ click "Go"
                        │ (readContext + snapshotCell + post job)
                        ▼
            ┌───────────────────────┐
            │      GENERATING       │◄──── Stream tokens via SSE
            └───────────┬───────────┘
                        │ SSE "done" event
                        ▼
            ┌───────────────────────┐
            │        REVIEW         │
            └───────────┬───────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
     [Accept]        [Undo]      [Regenerate]
   (remove tint,   (restore cell   (re-queue job,
    mark DB)        snapshot)      back to GENERATING)
         │              │
         └──────► ┌─────┴────────┐
                  │     IDLE     │
                  └──────────────┘
```

---

## 3. Zustand State Definition (`flowStore.ts`)

```typescript
export type FlowState = 
  | 'IDLE' 
  | 'PICK_QUESTION' 
  | 'READY' 
  | 'GENERATING' 
  | 'REVIEW' 
  | 'ERROR';

export interface CellAnchor {
  sheet: string;
  address: string;        // e.g. "C14"
  mergedRange?: string;   // e.g. "C14:E14"
}

export interface QuestionContext {
  columnHeaders: string[];
  sectionLabel?: string;
  neighbours: string[];
  charLimit?: number;
}

export interface CellSnapshot {
  sheet: string;
  address: string;
  value: string;
  formula?: string;
  style?: Record<string, any>;
}

export interface AnswerSource {
  doc: string;
  section: string;
  snippet: string;
  score?: number;
}

export interface AnswerResult {
  answerId: string;
  text: string;
  sources: AnswerSource[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  truncated: boolean;
}

export interface FlowStore {
  // State
  state: FlowState;
  answerAnchor?: CellAnchor;
  questionAnchor?: CellAnchor;
  questionText?: string;
  questionContext?: QuestionContext;
  jobId?: string;
  streamingText: string;
  answerResult?: AnswerResult;
  previousCellSnapshot?: CellSnapshot;
  error?: { code: string; message: string };

  // Actions
  startFlow: () => Promise<void>;
  setQuestion: (anchor: CellAnchor, text: string) => void;
  clearQuestion: () => void;
  go: (projectId: string) => Promise<void>;
  appendToken: (token: string) => void;
  setSources: (sources: AnswerSource[]) => void;
  complete: (result: AnswerResult) => Promise<void>;
  cancel: () => Promise<void>;
  accept: () => Promise<void>;
  undo: () => Promise<void>;
  regenerate: (projectId: string) => Promise<void>;
  setError: (code: string, message: string) => void;
}
```

---

## 4. Critical UX Mechanism: Preventing Focus Loss

### The Problem
When the user clicks the external React button **"Add Answer"**, browser focus immediately shifts away from the ONLYOFFICE iframe to the HTML button. In many spreadsheet integrations, this blur event clears the active selection, leaving the application unaware of where the user was working.

### The Solution: `onPointerDown` Capture
1. Rather than binding to `onClick`, the `AddAnswerButton` listens for `onPointerDown` (or `onMouseDown`).
2. The pointer-down event fires **before** focus shifts and before the iframe blurs.
3. The handler immediately invokes `adapter.getSelection()` and stores the coordinates in `answerAnchor`.
4. If no valid selection exists, the flow guides the user with a prompt: *"Please click on a target cell first"*.

---

## 5. Sequence of Events (Detailed Runtime Flow)

| Step | Actor | Action & Payload | Guard / Rule |
| :---: | :--- | :--- | :--- |
| **1** | User | Positions cursor in target answer cell (e.g., `Sheet1!C14`). | Cursor active in editor. |
| **2** | User | Presses pointer down on **"Add Answer"**. | State must be `IDLE`. |
| **3** | `AddAnswerButton` | Executes `adapter.getSelection()`. Stores `answerAnchor`. | If target cell has existing content, flags an overwrite confirmation. |
| **4** | Store | Transitions to `PICK_QUESTION`. | `StepBanner` mounts with Framer Motion slide-in animation. |
| **5** | User | Clicks or drags across the question cell (e.g., `Sheet1!B14`). | Adapter selection listener triggers. |
| **6** | Adapter | Dispatches `onSelectionChange({ sheet, address })` and extracts cell text. | Ignores clicks if still in answer anchor. |
| **7** | Store | Calls `setQuestion(anchor, text)`. Transitions to `READY`. | Enables **"Go"** button; displays `QuestionChip`. |
| **8** | User | Clicks **"Go"**. | State must be `READY`. |
| **9** | Store / Adapter | 1. Calls `adapter.readContext(questionAnchor)` (grabs headers, neighbors).<br>2. Calls `adapter.snapshotCell(answerAnchor)` for undo safety.<br>3. Dispatches `POST /api/projects/{id}/jobs`. | Job ID generated. Store moves to `GENERATING`. |
| **10** | SSE Hook | Connects to `/api/jobs/{id}/stream`. | Listens for `token`, `sources`, `done`, `error`. |
| **11** | SSE Hook | As `token` events arrive, calls `appendToken(t)`. | Cell writing is throttled to 150ms intervals to prevent iframe render thrashing. |
| **12** | SSE Hook | Receives `done` event. | Adapter writes final text, applies AI-draft tint (`#F0F7FF`), store moves to `REVIEW`. |
| **13** | AnswerDrawer | Slides open from right side displaying generated answer, confidence badge, and citation cards. | Buttons enabled: Accept, Edit, Regenerate, Undo. |
| **14** | User Action | **Accept:** Removes draft tint via `adapter.markAiDraft(anchor, false)`, persists status to DB, returns to `IDLE`.<br>**Undo:** Restores snapshot via `adapter.restoreCell(anchor, snapshot)`, resets state.<br>**Regenerate:** Re-posts job with same context. | State transitions back to `IDLE` (or `GENERATING` for regen). |
