"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, AlertTriangle, Sparkles } from "lucide-react";
import { useFlowStore } from "@/lib/flow/flowStore";
import { EditorAdapter } from "@/lib/editor/EditorAdapter";
import { SourcesList } from "./SourcesList";
import { ReviewActions } from "./ReviewActions";

interface AnswerDrawerProps {
  adapter: EditorAdapter | null;
}

export const AnswerDrawer: React.FC<AnswerDrawerProps> = ({ adapter }) => {
  const isDrawerOpen = useFlowStore((s) => s.isDrawerOpen);
  const closeDrawer = useFlowStore((s) => s.closeDrawer);
  const answerAnchor = useFlowStore((s) => s.answerAnchor);
  const questionAnchor = useFlowStore((s) => s.questionAnchor);
  const questionText = useFlowStore((s) => s.questionText);
  const streamedText = useFlowStore((s) => s.streamedText);
  const updateAnswerText = useFlowStore((s) => s.updateAnswerText);
  const sources = useFlowStore((s) => s.sources);
  const confidence = useFlowStore((s) => s.confidence);
  const isTruncated = useFlowStore((s) => s.isTruncated);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    updateAnswerText(val);
    if (adapter && answerAnchor) {
      adapter.writeCell(answerAnchor, val, { applyAiTint: true, wrapText: true });
    }
  };

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
            className="fixed inset-0 bg-slate-900 z-40"
          />

          {/* Slide-over panel */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200"
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">Review AI Answer</h3>
                  <div className="text-xs text-slate-500 font-mono">
                    Target: {answerAnchor?.sheet}!{answerAnchor?.address}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {confidence && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      confidence === "HIGH"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : confidence === "MEDIUM"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-orange-50 text-orange-700 border-orange-200"
                    }`}
                  >
                    {confidence} Confidence
                  </span>
                )}
                <button
                  onClick={closeDrawer}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Question Context */}
              {questionText && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Question ({questionAnchor?.address})
                  </div>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    {questionText}
                  </p>
                </div>
              )}

              {/* Truncation warning if Excel limit reached */}
              {isTruncated && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-800 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Character Limit Applied:</span> Answer has been synthesized to respect the specified cell boundary without trailing truncation.
                  </div>
                </div>
              )}

              {/* Answer Editor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span>Generated Response</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {streamedText.length} chars
                  </span>
                </div>
                <textarea
                  value={streamedText}
                  onChange={handleTextChange}
                  rows={6}
                  className="w-full p-3.5 bg-blue-50/40 border border-blue-200 rounded-xl text-sm text-slate-900 leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans"
                  placeholder="Generating answer..."
                />
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Edits made here reflect instantly in cell {answerAnchor?.address}.
                </div>
              </div>

              {/* Verified Citations */}
              <SourcesList sources={sources} />
            </div>

            {/* Sticky Actions Footer */}
            <div className="p-5 bg-slate-50/80 border-t border-slate-200">
              <ReviewActions adapter={adapter} onClose={closeDrawer} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
