/**
 * Proposal Assistant – EditorAdapter Interface
 * Defines the vendor-neutral contract between the application flow engine
 * and embedded office editors (ONLYOFFICE Docs, mock spreadsheet, etc.)
 */

export interface CellAnchor {
  sheet: string;
  address: string;
  mergedRange?: string;
}

export interface CellSnapshot {
  value: string;
  formula?: string;
  style?: Record<string, unknown>;
  background?: string;
}

export interface CellMergeInfo {
  isMerged: boolean;
  originAddress: string;
  range: string;
}

export interface WriteCellOptions {
  applyAiTint?: boolean;
  wrapText?: boolean;
}

export interface EditorAdapter {
  /**
   * Initializes the editor engine inside the specified DOM container.
   */
  init(container: HTMLElement, config: any): Promise<void>;

  /**
   * Cleans up event listeners and editor instances.
   */
  destroy(): void;

  /**
   * Programmatically retrieves the active cursor selection.
   */
  getSelection(): Promise<CellAnchor | null>;

  /**
   * Reads raw string content from the specified cell.
   */
  readCell(anchor: CellAnchor): Promise<string>;

  /**
   * Captures a pre-write snapshot for non-destructive undo operations.
   */
  snapshotCell(anchor: CellAnchor): Promise<CellSnapshot>;

  /**
   * Reverts cell value, formula, and formatting to pre-generation snapshot.
   */
  restoreCell(anchor: CellAnchor, snapshot: CellSnapshot): Promise<void>;

  /**
   * Writes text into a target cell with optional AI draft blue tint and text wrapping.
   */
  writeCell(anchor: CellAnchor, text: string, options?: WriteCellOptions): Promise<void>;

  /**
   * Applies AI draft highlight color (#E8F0FE).
   */
  applyTint(anchor: CellAnchor, color?: string): Promise<void>;

  /**
   * Clears background color on review acceptance.
   */
  clearTint(anchor: CellAnchor): Promise<void>;

  /**
   * Navigates editor view and selects the target cell.
   */
  goTo(anchor: CellAnchor): Promise<void>;

  /**
   * Subscribes to user selection changes in the spreadsheet.
   */
  onSelectionChange(callback: (anchor: CellAnchor | null) => void): () => void;
}
