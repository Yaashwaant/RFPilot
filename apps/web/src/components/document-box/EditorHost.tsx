"use client";

import React, { useEffect, useRef, useState } from "react";
import { useFlowStore } from "@/lib/flow/flowStore";
import { OnlyOfficeExcelAdapter } from "@/lib/editor/OnlyOfficeExcelAdapter";
import { useJobStream } from "@/lib/api/useJobStream";
import { apiCreateJob, apiGetProjectSheetData, apiListProjectAnswers } from "@/lib/api/client";
import { AddAnswerButton } from "./AddAnswerButton";
import { StepBanner } from "./StepBanner";
import { AnswerDrawer } from "../drawer/AnswerDrawer";
import { ActivityList } from "../activity/ActivityList";
import { FileSpreadsheet, History, Download, ArrowLeft, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";

interface EditorHostProps {
  projectId: string;
  projectName: string;
  editorConfig?: any;
  onExport: () => void;
}

export const EditorHost: React.FC<EditorHostProps> = ({
  projectId,
  projectName,
  editorConfig,
  onExport,
}) => {
  const [adapter] = useState<OnlyOfficeExcelAdapter>(() => new OnlyOfficeExcelAdapter());
  const [activeCell, setActiveCell] = useState<string>("C7");
  const [showActivity, setShowActivity] = useState<boolean>(false);
  const [sheetData, setSheetData] = useState<any>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
  const [loadingSheet, setLoadingSheet] = useState<boolean>(true);
  const [answersByAddress, setAnswersByAddress] = useState<Record<string, any>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const state = useFlowStore((s) => s.state);
  const answerAnchor = useFlowStore((s) => s.answerAnchor);
  const questionAnchor = useFlowStore((s) => s.questionAnchor);
  const questionText = useFlowStore((s) => s.questionText);
  const streamedText = useFlowStore((s) => s.streamedText);
  const answerId = useFlowStore((s) => s.answerId);
  const setQuestion = useFlowStore((s) => s.setQuestion);
  const startGeneration = useFlowStore((s) => s.startGeneration);
  const openAnswerReview = useFlowStore((s) => s.openAnswerReview);
  const closeDrawer = useFlowStore((s) => s.closeDrawer);
  const startFlow = useFlowStore((s) => s.startFlow);
  const setError = useFlowStore((s) => s.setError);
  const [renderTick, setRenderTick] = useState(0);

  // Bind live SSE streaming pipeline
  useJobStream(adapter);

  // Subscribe to adapter cell changes to force React re-render
  useEffect(() => {
    return adapter.onCellChange(() => {
      setRenderTick((t) => t + 1);
    });
  }, [adapter]);

  // Load real sheet data from the uploaded workbook
  useEffect(() => {
    if (projectId) {
      setLoadingSheet(true);
      apiGetProjectSheetData(projectId)
        .then((data) => {
          if (data && data.sheets && data.sheets.length > 0) {
            setSheetData(data);
            const initialSheet = data.sheets[0];
            adapter.loadSheetData(initialSheet);

            // Find first requirement / response cell to select
            let defaultCell = "C7";
            for (const r of initialSheet.rows) {
              for (const c of r.cells) {
                if (c.value && c.value.toLowerCase().includes("requirement")) {
                  defaultCell = c.address;
                  break;
                }
              }
            }
            setActiveCell(defaultCell);
          }
        })
        .catch((err) => {
          console.warn("Could not load dynamic sheet data, using default:", err);
        })
        .finally(() => setLoadingSheet(false));
    }
  }, [projectId, adapter]);

  useEffect(() => {
    if (containerRef.current && editorConfig) {
      adapter.init(containerRef.current, editorConfig);
    }
    const unsub = adapter.onSelectionChange((sel) => {
      if (sel?.address) {
        setActiveCell(sel.address);
      }
    });
    return () => {
      unsub();
      adapter.destroy();
    };
  }, [adapter, editorConfig]);

  // Load and synchronize project answers for in-situ review
  const refreshAnswers = async () => {
    if (!projectId) return;
    try {
      const list = await apiListProjectAnswers(projectId);
      const map: Record<string, any> = {};
      for (const ans of list) {
        if (ans.answerAnchor?.address) {
          map[ans.answerAnchor.address] = ans;
          if (ans.text) {
            adapter.writeCell(ans.answerAnchor, ans.text, {
              applyAiTint: ans.status !== "ACCEPTED",
              wrapText: true,
            });
          }
        }
      }
      setAnswersByAddress(map);
    } catch (err) {
      console.warn("Could not load project answers:", err);
    }
  };

  useEffect(() => {
    refreshAnswers();
  }, [projectId, answerId]);

  const handleOpenAnswerForCell = (address: string) => {
    const ans = answersByAddress[address];
    if (ans) {
      openAnswerReview({
        answerId: ans.id,
        answerAnchor: ans.answerAnchor,
        questionAnchor: ans.questionAnchor,
        questionText: ans.questionText,
        text: ans.text,
        sources: ans.sources,
        confidence: ans.confidence,
      });
    } else {
      const stored = adapter.getStoredCell(address);
      if (stored.value) {
        openAnswerReview({
          answerId: "cell-" + address,
          answerAnchor: { sheet: currentSheet?.name || "Sheet1", address },
          text: stored.value,
          sources: [],
          confidence: "HIGH",
        });
      }
    }
  };

  // Handle cell selection click in interactive grid
  const handleCellClick = async (address: string, currentSheetName: string) => {
    const anchor = { sheet: currentSheetName, address };
    adapter.simulateSelect(anchor);
    setActiveCell(address);

    // If user is currently in PICK_QUESTION step, capture this cell as question!
    if (state === "PICK_QUESTION") {
      const text = await adapter.readCell(anchor);
      setQuestion(anchor, text);
    } else if (state === "REVIEW" && address !== answerAnchor?.address) {
      // If user clicks another cell while reviewing, close previous drawer and reset to IDLE
      closeDrawer();
    }
  };

  // Switch sheet tab
  const handleSwitchSheet = (idx: number) => {
    setActiveSheetIndex(idx);
    if (sheetData?.sheets?.[idx]) {
      adapter.loadSheetData(sheetData.sheets[idx]);
    }
  };

  // Handle Go button click on StepBanner
  const handleGo = async () => {
    if (!answerAnchor || !questionAnchor || state !== "READY") return;
    try {
      const res = await apiCreateJob(projectId, {
        questionText,
        questionAnchor,
        answerAnchor,
        context: {
          columnHeaders: ["Requirement", "Compliance", "Response"],
          sectionLabel: "RFP Requirements",
          charLimit: 1000,
        },
      });
      startGeneration(res.jobId);
    } catch (err: any) {
      setError(err?.message || "Failed to start answer generation.");
    }
  };

  const currentSheet = sheetData?.sheets?.[activeSheetIndex];
  const maxCols = currentSheet?.max_col || 6;
  const colLetters = Array.from({ length: maxCols }, (_, i) => String.fromCharCode(65 + i));

  const getColWidth = (col: string) => {
    if (currentSheet?.col_widths?.[col]) {
      return `${Math.max(45, Math.round(currentSheet.col_widths[col] * 8.5))}px`;
    }
    if (col === "A" || col === "B") return "45px";
    if (col === "C") return "460px";
    if (col === "D") return "150px";
    if (col === "E") return "460px";
    return "120px";
  };

  // Step 1: User clicks "Add Answer" for target cell -> enters Step 2: "Select Question"
  const handleAddAnswer = async () => {
    if (state !== "IDLE") return;
    const selection = await adapter.getSelection();
    if (!selection) return;

    const snapshot = await adapter.snapshotCell(selection);
    startFlow(selection, snapshot);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-100 overflow-hidden font-sans">
      {/* Top Header Chrome */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Back to Projects"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <h1 className="font-semibold text-sm text-slate-900">{projectName}</h1>
            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-mono">
              .xlsx
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowActivity(!showActivity)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
              showActivity
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Activity History</span>
          </button>

          <button
            onClick={onExport}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs rounded-lg shadow-xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Filled Excel</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Activity Drawer Sidebar */}
        <ActivityList
          projectId={projectId}
          adapter={adapter}
          isOpen={showActivity}
          onClose={() => setShowActivity(false)}
        />

        {/* Spreadsheet Document Box */}
        <div className="flex-1 relative overflow-auto bg-slate-200 flex flex-col items-center p-6">
          {/* Step Guidance Banner */}
          <StepBanner onGo={handleGo} />

          {/* Floating In-Situ Add Answer Button */}
          <AddAnswerButton
            adapter={adapter}
            activeCell={activeCell}
            existingAnswer={answersByAddress[activeCell]}
            onReviewAnswer={() => handleOpenAnswerForCell(activeCell)}
            onAddAnswer={handleAddAnswer}
          />

          {/* Spreadsheet Canvas */}
          <div
            ref={containerRef}
            className="w-full max-w-6xl bg-white shadow-xl rounded-xl border border-slate-300 overflow-hidden flex flex-col min-h-[640px]"
          >
            {/* Spreadsheet Formula Bar */}
            <div className="h-10 bg-slate-50 border-b border-slate-200 px-4 flex items-center gap-3 text-xs shrink-0">
              <div className="w-16 px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold text-slate-700 text-center">
                {activeCell}
              </div>
              <div className="text-slate-400 font-mono italic">fx</div>
              <div className="flex-1 font-mono text-slate-700 truncate">
                {activeCell === answerAnchor?.address && streamedText
                  ? streamedText
                  : adapter.getStoredCell(activeCell).value || "(empty)"}
              </div>
            </div>

            {/* Interactive Grid Table */}
            <div className="flex-1 overflow-auto bg-slate-50 max-h-[calc(100vh-220px)]">
              {loadingSheet ? (
                <div className="h-96 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-xs">Parsing uploaded Excel workbook sheets & styles...</span>
                </div>
              ) : currentSheet ? (
                <table className="w-full border-collapse text-xs select-none bg-white table-fixed">
                  <thead>
                    <tr className="bg-slate-100 text-slate-500 font-medium sticky top-0 z-10 shadow-2xs">
                      <th className="w-12 p-2 border border-slate-300 text-center bg-slate-200 font-mono">
                        #
                      </th>
                      {colLetters.map((col) => {
                        const colW = getColWidth(col);
                        return (
                          <th
                            key={col}
                            style={{ width: colW, minWidth: colW, maxWidth: colW }}
                            className="p-2 border border-slate-300 text-center font-mono font-bold text-slate-600 truncate"
                          >
                            {col}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {currentSheet.rows.map((rowObj: any) => {
                      const rowNum = rowObj.row_num;
                      const hasValues = rowObj.cells.some((c: any) => c.value || c.bg_color);
                      // Only skip empty rows at the far end of the sheet
                      if (!hasValues && rowNum > (currentSheet?.max_row || 35)) return null;

                      const rowHeightPx = rowObj.row_height
                        ? `${Math.max(26, Math.round(rowObj.row_height * 1.35))}px`
                        : undefined;

                      return (
                        <tr
                          key={rowNum}
                          style={{ height: rowHeightPx }}
                          className="hover:bg-slate-50/60"
                        >
                          {/* Row Number */}
                          <td className="p-2 border border-slate-300 text-center font-mono bg-slate-100 text-slate-500 font-semibold w-12">
                            {rowNum}
                          </td>

                          {/* Render cells across columns */}
                          {rowObj.cells.map((cell: any) => {
                            const addr = cell.address;
                            const stored = adapter.getStoredCell(addr);
                            const isTarget = answerAnchor?.address === addr;
                            const isStreamingTarget = isTarget && (state === "GENERATING" || state === "REVIEW");
                            const displayValue = isStreamingTarget && streamedText ? streamedText : (stored.value || cell.value);
                            const existingAns = answersByAddress[addr];
                            const hasAiTint = stored.background === "#E8F0FE" || isTarget || (existingAns && existingAns.status !== "ACCEPTED");
                            const isCellSelected = activeCell === addr;
                            const isQuestionTarget = questionAnchor?.address === addr;

                            // Custom styles from uploaded Excel
                            const cellBg = hasAiTint ? "#E8F0FE" : cell.bg_color || "transparent";
                            const isDarkNavy = cellBg === "#002060";
                            const cellColor = hasAiTint
                              ? "#0F172A"
                              : cell.text_color || (isDarkNavy ? "#FFFFFF" : "#0F172A");

                            const colW = getColWidth(cell.col);

                            return (
                              <td
                                key={addr}
                                onClick={() => handleCellClick(addr, currentSheet.name)}
                                style={{
                                  width: colW,
                                  minWidth: colW,
                                  maxWidth: colW,
                                  backgroundColor: cellBg,
                                  color: cellColor,
                                  fontWeight: cell.bold ? "700" : "400",
                                  fontSize: cell.font_size ? `${cell.font_size}px` : "12px",
                                  textAlign: (cell.align as any) || "left",
                                }}
                                className={`p-2 border transition-all cursor-cell relative leading-snug break-words ${
                                  hasAiTint
                                    ? "border-blue-600 outline-2 outline-blue-600 outline-offset-[-2px] z-2"
                                    : isQuestionTarget
                                    ? "bg-blue-100 border-blue-500 font-medium text-blue-900 z-2"
                                    : isCellSelected
                                    ? "border-blue-500 outline-2 outline-blue-500 outline-offset-[-2px] bg-blue-50/20 z-2"
                                    : isDarkNavy
                                    ? "border-[#002878]"
                                    : "border-slate-300"
                                }`}
                              >
                                {displayValue ? (
                                  <span>{displayValue}</span>
                                ) : (
                                  <span className="text-slate-300 italic text-[11px]"> </span>
                                )}

                                {hasAiTint && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenAnswerForCell(addr);
                                    }}
                                    className="absolute top-1 right-1 px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-[8px] font-bold rounded shadow-2xs flex items-center gap-1 cursor-pointer z-10 transition-transform"
                                    title="Click to view AI answer and verified citations"
                                  >
                                    <Sparkles className="w-2.5 h-2.5" />
                                    <span>{existingAns?.status || "AI DRAFT"}</span>
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
            </div>

            {/* Sheet Tabs Bar */}
            <div className="h-8 bg-slate-100 border-t border-slate-200 px-3 flex items-center gap-1 text-xs text-slate-600 shrink-0">
              {sheetData?.sheets ? (
                sheetData.sheets.map((sheet: any, idx: number) => {
                  const isActive = idx === activeSheetIndex;
                  return (
                    <button
                      key={sheet.name}
                      onClick={() => handleSwitchSheet(idx)}
                      className={`px-3 py-1 font-semibold rounded-t cursor-pointer border-t-2 transition-all ${
                        isActive
                          ? "bg-white border-t-blue-600 border-x border-slate-300 text-blue-700 shadow-2xs"
                          : "text-slate-500 hover:bg-slate-200 border-t-transparent"
                      }`}
                    >
                      {sheet.name}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-1 bg-white border-t-2 border-t-blue-600 border-x border-slate-300 font-semibold text-blue-700">
                  Sheet1
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Slide-over Review Drawer */}
        <AnswerDrawer adapter={adapter} />
      </div>
    </div>
  );
};
