"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, X, Loader2, Target, AlertTriangle } from "lucide-react";
import { useFlowStore } from "@/lib/flow/flowStore";
import { QuestionChip } from "./QuestionChip";

interface StepBannerProps {
  onGo: () => void;
}

export const StepBanner: React.FC<StepBannerProps> = ({ onGo }) => {
  const state = useFlowStore((s) => s.state);
  const answerAnchor = useFlowStore((s) => s.answerAnchor);
  const questionAnchor = useFlowStore((s) => s.questionAnchor);
  const questionText = useFlowStore((s) => s.questionText);
  const errorMessage = useFlowStore((s) => s.errorMessage);
  const clearQuestion = useFlowStore((s) => s.clearQuestion);
  const cancelFlow = useFlowStore((s) => s.cancelFlow);
  const clearError = useFlowStore((s) => s.clearError);

  const isVisible = state === "PICK_QUESTION" || state === "READY" || state === "GENERATING" || !!errorMessage;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -15, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className={`absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-2xl w-[90%] shadow-lg rounded-xl border backdrop-blur-md px-5 py-3 ${
            errorMessage
              ? "bg-amber-50/95 border-amber-300 text-amber-900"
              : "bg-white/95 border-blue-200 text-slate-900"
          }`}
        >
          {errorMessage ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                    Knowledge Base Notice
                  </div>
                  <div className="text-xs text-slate-700 mt-0.5">
                    {errorMessage}
                  </div>
                </div>
              </div>
              <button
                onClick={clearError}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {state === "GENERATING" ? (
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}

                <div className="flex flex-col min-w-0">
                  {state === "PICK_QUESTION" && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                        Step 2: Select Question
                      </div>
                      <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5 mt-0.5">
                        <span>Click the question cell to answer for target</span>
                        <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                          {answerAnchor?.address}
                        </span>
                      </div>
                    </div>
                  )}

                  {state === "READY" && questionAnchor && (
                    <div className="flex items-center gap-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                        Ready to Generate
                      </div>
                      <QuestionChip
                        anchor={questionAnchor}
                        text={questionText}
                        onClear={clearQuestion}
                      />
                    </div>
                  )}

                  {state === "GENERATING" && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                        Synthesizing Answer
                      </div>
                      <div className="text-sm text-slate-700 mt-0.5 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                        Retrieving verified collateral & streaming to {answerAnchor?.address}...
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {state === "READY" && (
                  <button
                    onClick={onGo}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium text-sm rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    <span>Go</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}

                {state !== "GENERATING" && (
                  <button
                    onClick={cancelFlow}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Cancel (Esc)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
