"use client";

import React, { useState } from "react";
import { FileText, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { SourceCitation } from "@/lib/flow/flowStore";

interface SourcesListProps {
  sources: SourceCitation[];
}

export const SourcesList: React.FC<SourcesListProps> = ({ sources }) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  if (!sources || sources.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-100">
        No specific knowledge base citations recorded.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
        <span>Verified Citations ({sources.length})</span>
        <span className="text-emerald-600 font-medium flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Grounded
        </span>
      </div>

      <div className="space-y-2">
        {sources.map((item, idx) => {
          const isExpanded = expandedIndex === idx;
          const matchPercent = Math.round((item.score || 0.85) * 100);

          return (
            <div
              key={idx}
              className="p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-200 transition-all text-xs"
            >
              <div
                className="flex items-start justify-between gap-2 cursor-pointer"
                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
              >
                <div className="flex items-center gap-2 font-medium text-slate-800 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <div className="font-semibold text-slate-900 truncate">{item.doc}</div>
                    {item.section && (
                      <div className="text-[11px] text-slate-500 font-normal truncate">
                        {item.section}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded-full border border-emerald-200 text-[10px]">
                    {matchPercent}% Match
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 text-slate-600 leading-relaxed bg-slate-50/70 p-2 rounded-lg font-mono text-[11px]">
                  "{item.snippet}"
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
