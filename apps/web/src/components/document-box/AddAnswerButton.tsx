"use client";

import React from "react";
import { Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { useFlowStore } from "@/lib/flow/flowStore";
import { EditorAdapter } from "@/lib/editor/EditorAdapter";

interface AddAnswerButtonProps {
  adapter: EditorAdapter | null;
  activeCell?: string;
  existingAnswer?: any;
  onReviewAnswer?: () => void;
}

export const AddAnswerButton: React.FC<AddAnswerButtonProps> = ({
  adapter,
  activeCell,
  existingAnswer,
  onReviewAnswer,
}) => {
  const state = useFlowStore((s) => s.state);
  const startFlow = useFlowStore((s) => s.startFlow);

  const handlePointerDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (existingAnswer && onReviewAnswer) {
      onReviewAnswer();
      return;
    }

    if (!adapter || state !== "IDLE") return;

    const selection = await adapter.getSelection();
    if (selection) {
      const snapshot = await adapter.snapshotCell(selection);
      startFlow(selection, snapshot);
    }
  };

  // If active cell already has an AI answer, render "Review Answer"
  if (existingAnswer && state === "IDLE") {
    return (
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={onReviewAnswer}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md cursor-pointer bg-blue-600 hover:bg-blue-700 active:scale-98 text-white shadow-blue-500/20"
          title={`Review AI Answer and citations for cell ${activeCell}`}
        >
          <Sparkles className="w-4 h-4 text-blue-200" />
          <span>Review Answer ({activeCell})</span>
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-blue-500/60 rounded">
            {existingAnswer.status || "DRAFT"}
          </span>
        </button>
      </div>
    );
  }

  const isEnabled = state === "IDLE";

  return (
    <div className="absolute top-4 right-4 z-20">
      <button
        onPointerDown={handlePointerDown}
        disabled={!isEnabled}
        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md cursor-pointer ${
          isEnabled
            ? "bg-blue-600 hover:bg-blue-700 active:scale-98 text-white shadow-blue-500/20"
            : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none"
        }`}
        title="Add AI-generated answer to selected cell"
      >
        {state === "GENERATING" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span>Generating...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-blue-200" />
            <span>Add Answer</span>
            <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-blue-700/60 text-blue-100 rounded">
              ⌘K
            </kbd>
          </>
        )}
      </button>
    </div>
  );
};
