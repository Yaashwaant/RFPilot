"use client";

import React, { useState } from "react";
import { Check, RotateCcw, RefreshCw, Edit3, Loader2 } from "lucide-react";
import { useFlowStore } from "@/lib/flow/flowStore";
import { EditorAdapter } from "@/lib/editor/EditorAdapter";
import { apiPatchAnswer, apiRegenerateAnswer } from "@/lib/api/client";

interface ReviewActionsProps {
  adapter: EditorAdapter | null;
  onClose: () => void;
}

export const ReviewActions: React.FC<ReviewActionsProps> = ({ adapter, onClose }) => {
  const answerId = useFlowStore((s) => s.answerId);
  const answerAnchor = useFlowStore((s) => s.answerAnchor);
  const preWriteSnapshot = useFlowStore((s) => s.preWriteSnapshot);
  const streamedText = useFlowStore((s) => s.streamedText);
  const startGeneration = useFlowStore((s) => s.startGeneration);
  const resetToIdle = useFlowStore((s) => s.resetToIdle);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Accept Review Action (LLD §7 & §8)
  const handleAccept = async () => {
    if (!answerId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (adapter && answerAnchor) {
        await adapter.clearTint(answerAnchor);
      }
      await apiPatchAnswer(answerId, { status: "ACCEPTED", text: streamedText });
      resetToIdle();
      onClose();
    } catch (err) {
      console.error("Failed to accept answer:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Zero-Risk Undo Action (LLD §8 & Excel Safeguards)
  const handleUndo = async () => {
    if (!answerId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (adapter && answerAnchor && preWriteSnapshot) {
        await adapter.restoreCell(answerAnchor, preWriteSnapshot);
      } else if (adapter && answerAnchor) {
        await adapter.clearTint(answerAnchor);
        await adapter.writeCell(answerAnchor, "");
      }
      await apiPatchAnswer(answerId, { status: "UNDONE" });
      resetToIdle();
      onClose();
    } catch (err) {
      console.error("Failed to undo answer:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Regenerate Action
  const handleRegenerate = async () => {
    if (!answerId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await apiRegenerateAnswer(answerId);
      startGeneration(res.jobId);
    } catch (err) {
      console.error("Failed to regenerate answer:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 pt-4 border-t border-slate-200">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleAccept}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium text-sm rounded-xl shadow-xs transition-all cursor-pointer"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          <span>Accept Answer</span>
        </button>

        <button
          onClick={handleUndo}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm rounded-xl border border-slate-300 shadow-2xs transition-all cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-slate-500" />
          <span>Undo Write</span>
        </button>
      </div>

      <button
        onClick={handleRegenerate}
        disabled={isSubmitting}
        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Regenerate with Alternative Phrasing</span>
      </button>
    </div>
  );
};
