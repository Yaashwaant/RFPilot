"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock, Edit, RotateCcw, ChevronRight, ListFilter } from "lucide-react";
import { apiListProjectAnswers } from "@/lib/api/client";
import { CellAnchor, EditorAdapter } from "@/lib/editor/EditorAdapter";
import { useFlowStore } from "@/lib/flow/flowStore";

interface ActivityListProps {
  projectId: string;
  adapter: EditorAdapter | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ActivityList: React.FC<ActivityListProps> = ({
  projectId,
  adapter,
  isOpen,
  onClose,
}) => {
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const openAnswerReview = useFlowStore((s) => s.openAnswerReview);

  useEffect(() => {
    if (isOpen && projectId) {
      setLoading(true);
      apiListProjectAnswers(projectId)
        .then(setAnswers)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  return (
    <div className="w-80 h-full border-r border-slate-200 bg-white flex flex-col shrink-0">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-blue-600" />
          <h4 className="font-semibold text-sm text-slate-800">Proposal Activity</h4>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
        >
          Hide
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="text-center py-8 text-xs text-slate-400">Loading activity...</div>
        ) : answers.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400 italic">
            No cells filled yet. Click a cell and press "Add Answer" to begin.
          </div>
        ) : (
          answers.map((item) => {
            const anchor: CellAnchor = item.answerAnchor;
            return (
              <div
                key={item.id}
                onClick={() => {
                  adapter?.goTo(anchor);
                  openAnswerReview({
                    answerId: item.id,
                    answerAnchor: anchor,
                    questionAnchor: item.questionAnchor,
                    questionText: item.questionText,
                    text: item.text,
                    sources: item.sources,
                    confidence: item.confidence,
                  });
                }}
                className="p-3 bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-xl transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-mono font-bold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded">
                    {anchor.address}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      item.status === "ACCEPTED"
                        ? "bg-emerald-100 text-emerald-800"
                        : item.status === "DRAFT"
                        ? "bg-blue-100 text-blue-800"
                        : item.status === "EDITED"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                <p className="text-xs text-slate-700 line-clamp-2 mt-1 group-hover:text-slate-900 leading-relaxed">
                  {item.text}
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                  <span>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-blue-600 font-medium flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                    Jump to cell <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
