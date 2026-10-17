"use client";

import React from "react";
import { X, HelpCircle } from "lucide-react";
import { CellAnchor } from "@/lib/editor/EditorAdapter";

interface QuestionChipProps {
  anchor: CellAnchor;
  text: string;
  onClear: () => void;
}

export const QuestionChip: React.FC<QuestionChipProps> = ({ anchor, text, onClear }) => {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 shadow-xs transition-all">
      <div className="flex items-center gap-1 font-semibold text-blue-700">
        <HelpCircle className="w-3.5 h-3.5" />
        <span>{anchor.address}</span>
      </div>
      <span className="text-gray-400">|</span>
      <span className="truncate max-w-[280px] font-normal text-slate-700" title={text}>
        {text || "(Empty question text)"}
      </span>
      <button
        onClick={onClear}
        className="ml-1 p-0.5 text-blue-500 hover:text-blue-800 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
        title="Clear question selection"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
