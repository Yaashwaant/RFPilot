# Editor Adapter & Document Host

**Source:** Derived from [`LLD – Proposal Assistant.docx`](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/.memory/LLD%20–%20Proposal%20Assistant.docx) §2.3 and [`HLD`](file:///Users/yashwant/Desktop/Chai%20aur%20Code/Proposal%20Assistant/.memory/HLD%20–%20Proposal%20Assistant.docx) §10.

---

## 1. Role of the Editor Adapter

The **Editor Adapter** decouples the Next.js UI flow engine from the underlying document rendering technology (ONLYOFFICE Docs in the MVP). Rather than having UI components directly invoke low-level editor API scripts, the application interacts exclusively with a high-level TypeScript interface.

This provides two strategic benefits:
1. **Editor Portability:** ONLYOFFICE can be swapped for Collabora Online or a custom viewer without rewriting any UI flow logic.
2. **Multi-Format Extensibility:** The same state machine works for Excel workbooks, Word documents, PowerPoint decks, and PDFs simply by providing format-specific adapter implementations.

---

## 2. The `EditorAdapter` TypeScript Interface

```typescript
export interface CellAnchor {
  sheet: string;
  address: string;        // e.g. "C14"
  mergedRange?: string;   // e.g. "C14:E14"
}

export interface CellSnapshot {
  sheet: string;
  address: string;
  value: string;
  formula?: string;
  style?: {
    fontName?: string;
    fontSize?: number;
    backgroundColor?: string;
    wrapText?: boolean;
  };
}

export interface QuestionContext {
  columnHeaders: string[];
  sectionLabel?: string;
  neighbours: string[];
  charLimit?: number;
}

export interface WriteOpts {
  isDraft?: boolean;
  preserveStyles?: boolean;
  autoFitRow?: boolean;
}

export interface WriteResult {
  ok: boolean;
  reason?: 'PROTECTED' | 'VALIDATION' | 'TOO_LONG' | 'MERGED_REDIRECT';
  effectiveAnchor: CellAnchor;
}

export interface EditorAdapter {
  /** Resolves when the editor frame and connector are fully initialized and ready */
  ready(): Promise<void>;

  /** Retrieves the currently active selection in the editor */
  getSelection(): Promise<{ anchor: CellAnchor; text: string }>;

  /** Subscribes to user selection changes inside the document */
  onSelectionChange(callback: (sel: CellAnchor) => void): () => void;

  /** Reads raw text content from a specific cell or range */
  readCells(anchor: CellAnchor): Promise<string>;

  /** 
   * Intelligently inspects surrounding cells to extract column headers,
   * section labels, and row neighbors to enrich RAG retrieval.
   */
  readContext(anchor: CellAnchor): Promise<QuestionContext>;

  /** Writes answer text into the target cell with truncation and validation checks */
  writeCell(anchor: CellAnchor, text: string, opts?: WriteOpts): Promise<WriteResult>;

  /** Restores a cell to its exact pre-generation state (for Undo operations) */
  restoreCell(anchor: CellAnchor, previous: CellSnapshot): Promise<void>;

  /** Captures the value, formula, and styling of a cell before modification */
  snapshotCell(anchor: CellAnchor): Promise<CellSnapshot>;

  /** Applies or clears a subtle visual tint (#F0F7FF) denoting unaccepted AI drafts */
  markAiDraft(anchor: CellAnchor, on: boolean): Promise<void>;

  /** Pans and focuses the viewport to a specific anchor */
  goTo(anchor: CellAnchor): Promise<void>;

  /** Commands the editor server to flush unsaved changes to storage immediately */
  forceSave(): Promise<void>;
}
```

---

## 3. ONLYOFFICE Integration Architecture

ONLYOFFICE Docs is hosted as a separate container or cluster, exposing the `DocEditor` API inside an `<iframe>`.

### 3.1 Initializing `EditorHost.tsx`
```tsx
// Example mount inside Next.js
export function EditorHost({ editorConfig }: { editorConfig: EditorConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Load ONLYOFFICE DocsAPI script dynamically
    const script = document.createElement('script');
    script.src = `${editorConfig.documentServerUrl}/web-apps/apps/api/documents/api.js`;
    script.onload = () => {
      // 2. Instantiate ONLYOFFICE DocEditor
      const docEditor = new window.DocsAPI.DocEditor('onlyoffice-container', {
        document: {
          fileType: 'xlsx',
          key: editorConfig.docKey,
          title: editorConfig.title,
          url: editorConfig.fileUrl,
          permissions: { edit: true, download: true }
        },
        editorConfig: {
          callbackUrl: editorConfig.callbackUrl,
          user: editorConfig.user,
          customization: {
            compactToolbar: true,
            autosave: true,
            features: { spellcheck: false }
          }
        },
        events: {
          onAppReady: () => initAdapter(docEditor),
          onDocumentStateChange: (event) => { /* handle save state */ }
        }
      });
    };
    document.body.appendChild(script);
  }, [editorConfig]);

  return <div id="onlyoffice-container" ref={containerRef} className="w-full h-full" />;
}
```

### 3.2 Communicating via the Connector API
ONLYOFFICE exposes a plugin/connector interface (`connector.executeMethod(...)` or Document Builder scripts) to execute spreadsheet commands:
- `GetCurrentWord` / `GetSelection`: Reads the active range.
- `SetValue`: Sets string values in cells.
- `SetFillColor`: Changes background color for AI-draft tagging.
- `GetMergeInfo`: Checks if the target cell belongs to a merged range.

---

## 4. Multi-Format Extensibility Matrix

The `EditorAdapter` interface is parameterized by anchor shape across file formats:

| Format | Adapter Type | Anchor Representation | Selection Scope | Write Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Excel (.xlsx)** | `OnlyOfficeExcelAdapter` | `{ sheet: string, address: string, mergedRange?: string }` | Single cell or contiguous grid range | Set cell value, wrap text, auto-fit row height |
| **Word (.docx)** | `OnlyOfficeWordAdapter` | `{ paragraphId: string, charOffset: number, tableCoord?: { row: number, col: number } }` | Text range or table cell | Insert paragraph / inline run at cursor or target table cell |
| **PowerPoint (.pptx)** | `OnlyOfficePptAdapter` | `{ slideIndex: number, shapeId: string }` | Text box, placeholder shape | Replace or append shape text with auto-shrink font rule |
| **PDF (.pdf)** | `PdfOverlayAdapter` | `{ page: number, x: number, y: number, width: number }` | Bounding box / coordinates | Render text overlay layer or generate companion response doc |

The core Next.js application, Zustand state machine, Celery RAG pipeline, and review states remain identical across all formats.
