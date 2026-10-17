/**
 * Proposal Assistant – OnlyOfficeExcelAdapter
 * Implements EditorAdapter for ONLYOFFICE Document Server spreadsheets,
 * with resilient local simulation mode for standalone development.
 */

import { CellAnchor, CellSnapshot, EditorAdapter, WriteCellOptions } from "./EditorAdapter";

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (placeholderId: string, config: any) => any;
    };
  }
}

export class OnlyOfficeExcelAdapter implements EditorAdapter {
  private docEditor: any = null;
  private connector: any = null;
  private selectionListeners: Array<(anchor: CellAnchor | null) => void> = [];
  private cellChangeListeners: Array<() => void> = [];
  private activeSelection: CellAnchor | null = { sheet: "Sheet1", address: "C14" };
  private cellValues: Map<string, string> = new Map();
  private cellBackgrounds: Map<string, string> = new Map();

  constructor() {}

  loadSheetData(sheet: any): void {
    if (!sheet || !sheet.rows) return;
    this.cellValues.clear();
    this.cellBackgrounds.clear();
    for (const r of sheet.rows) {
      for (const c of r.cells) {
        if (c.value) {
          this.cellValues.set(c.address, c.value);
        }
        if (c.bg_color) {
          this.cellBackgrounds.set(c.address, c.bg_color);
        }
      }
    }
    this.notifySelectionChange();
    this.notifyCellChange();
  }

  async init(container: HTMLElement, config: any): Promise<void> {
    if (typeof window !== "undefined" && window.DocsAPI?.DocEditor) {
      try {
        const placeholderId = container.id || "onlyoffice-editor-frame";
        this.docEditor = new window.DocsAPI.DocEditor(placeholderId, {
          ...config,
          events: {
            ...config.events,
            onDocumentReady: () => {
              if (this.docEditor.createConnector) {
                this.connector = this.docEditor.createConnector();
                this.connector.attachEvent("onChangeContent", () => {});
              }
            },
          },
        });
      } catch (err) {
        console.warn("ONLYOFFICE initialization fell back to built-in harness:", err);
      }
    }
  }

  destroy(): void {
    if (this.docEditor?.destroyEditor) {
      this.docEditor.destroyEditor();
    }
    this.docEditor = null;
    this.connector = null;
    this.selectionListeners = [];
  }

  async getSelection(): Promise<CellAnchor | null> {
    if (this.connector) {
      return new Promise((resolve) => {
        this.connector.executeMethod("GetSelection", [], (res: any) => {
          if (res?.address) {
            resolve({
              sheet: res.sheet || "Sheet1",
              address: res.address,
              mergedRange: res.mergedRange,
            });
          } else {
            resolve(this.activeSelection);
          }
        });
      });
    }
    return this.activeSelection;
  }

  async readCell(anchor: CellAnchor): Promise<string> {
    const key = `${anchor.sheet}!${anchor.address}`;
    if (this.connector) {
      return new Promise((resolve) => {
        this.connector.executeMethod("GetCellValue", [anchor.address], (val: any) => {
          resolve(val ? String(val) : this.cellValues.get(anchor.address) || "");
        });
      });
    }
    return this.cellValues.get(anchor.address) || "";
  }

  async snapshotCell(anchor: CellAnchor): Promise<CellSnapshot> {
    const currentVal = await this.readCell(anchor);
    const bg = this.cellBackgrounds.get(anchor.address) || "";
    return {
      value: currentVal,
      background: bg,
    };
  }

  async restoreCell(anchor: CellAnchor, snapshot: CellSnapshot): Promise<void> {
    this.cellValues.set(anchor.address, snapshot.value);
    if (snapshot.background) {
      this.cellBackgrounds.set(anchor.address, snapshot.background);
    } else {
      this.cellBackgrounds.delete(anchor.address);
    }

    if (this.connector) {
      this.connector.executeMethod("SetCellValue", [anchor.address, snapshot.value]);
      if (!snapshot.background) {
        this.connector.executeMethod("SetCellFillColor", [anchor.address, ""]);
      }
    }
    this.notifySelectionChange();
    this.notifyCellChange();
  }

  async writeCell(anchor: CellAnchor, text: string, options?: WriteCellOptions): Promise<void> {
    // Resolve merged range origin if needed (LLD §8 & Excel Safeguards)
    const targetAddress = anchor.mergedRange ? anchor.mergedRange.split(":")[0] : anchor.address;
    this.cellValues.set(targetAddress, text);

    if (options?.applyAiTint) {
      await this.applyTint({ ...anchor, address: targetAddress });
    }

    if (this.connector) {
      // ONLYOFFICE Connector command execution
      this.connector.executeMethod("SetCellValue", [targetAddress, text]);
      if (options?.wrapText !== false) {
        this.connector.executeMethod("SetCellWrapText", [targetAddress, true]);
        this.connector.executeMethod("AutoFitRowHeight", [targetAddress]);
      }
    }
    this.notifySelectionChange();
    this.notifyCellChange();
  }

  async applyTint(anchor: CellAnchor, color: string = "#E8F0FE"): Promise<void> {
    const targetAddress = anchor.mergedRange ? anchor.mergedRange.split(":")[0] : anchor.address;
    this.cellBackgrounds.set(targetAddress, color);
    if (this.connector) {
      this.connector.executeMethod("SetCellFillColor", [targetAddress, color]);
    }
    this.notifySelectionChange();
    this.notifyCellChange();
  }

  async clearTint(anchor: CellAnchor): Promise<void> {
    const targetAddress = anchor.mergedRange ? anchor.mergedRange.split(":")[0] : anchor.address;
    this.cellBackgrounds.delete(targetAddress);
    if (this.connector) {
      this.connector.executeMethod("SetCellFillColor", [targetAddress, ""]);
    }
    this.notifySelectionChange();
    this.notifyCellChange();
  }

  async goTo(anchor: CellAnchor): Promise<void> {
    this.activeSelection = anchor;
    if (this.connector) {
      this.connector.executeMethod("SelectRange", [anchor.address]);
    }
    this.notifySelectionChange();
  }

  onSelectionChange(callback: (anchor: CellAnchor | null) => void): () => void {
    this.selectionListeners.push(callback);
    // Emit initial
    callback(this.activeSelection);
    return () => {
      this.selectionListeners = this.selectionListeners.filter((cb) => cb !== callback);
    };
  }

  onCellChange(callback: () => void): () => void {
    this.cellChangeListeners.push(callback);
    return () => {
      this.cellChangeListeners = this.cellChangeListeners.filter((cb) => cb !== callback);
    };
  }

  // Helper for UI to trigger selections when clicking in interactive preview table
  simulateSelect(anchor: CellAnchor): void {
    this.activeSelection = anchor;
    this.notifySelectionChange();
  }

  getStoredCell(address: string): { value: string; background: string } {
    return {
      value: this.cellValues.get(address) || "",
      background: this.cellBackgrounds.get(address) || "",
    };
  }

  private notifySelectionChange(): void {
    for (const listener of this.selectionListeners) {
      listener(this.activeSelection);
    }
  }

  private notifyCellChange(): void {
    for (const listener of this.cellChangeListeners) {
      try {
        listener();
      } catch {}
    }
  }
}
