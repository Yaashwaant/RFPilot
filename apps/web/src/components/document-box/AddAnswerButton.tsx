"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { useFlowStore } from "@/lib/flow/flowStore";
import { EditorAdapter } from "@/lib/editor/EditorAdapter";

interface AddAnswerButtonProps {
  adapter: EditorAdapter | null;
}

export const AddAnswerButton: React.FC<AddAnswerButtonProps> = ({ adapter }) => {
  const state = useFlowStore((s) => s.state);
  const startFlow = useFlowStore((s) => s.startFlow);

  const handlePointerDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    // Prevent focus loss from iframe editor to ensure current cell selection is preserved
    e.preventDefault();

    if (!adapter || state !== "IDLE") return;

    const selection = await adapter.getSelection();
    if (selection) {
      const snapshot = await adapter.snapshotCell(selection);
      startFlow(selection, snapshot);
    }
  };

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
        title="Add AI-generated answer to selected cell (PointerDown capture preserves selection)"
      >
        <Sparkles className="w-4 h-4 text-blue-200" />
        <span>Add Answer</span>
        <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-blue-700/60 text-blue-100 rounded">
          ⌘K
        </kbd>
      </button>
    </div>
  );
};
