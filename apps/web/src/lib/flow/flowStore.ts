/**
 * Proposal Assistant – In-Situ Flow State Machine (Zustand)
 * Implements the 5-state in-situ Add Answer lifecycle from LLD §2 and wiki/flow-and-state-machine.md
 */

import { create } from "zustand";
import { CellAnchor, CellSnapshot } from "../editor/EditorAdapter";

export type FlowState = "IDLE" | "PICK_QUESTION" | "READY" | "GENERATING" | "REVIEW";

export interface SourceCitation {
  doc: string;
  section?: string;
  snippet: string;
  score: number;
}

interface FlowStore {
  // State
  state: FlowState;
  answerAnchor: CellAnchor | null;
  questionAnchor: CellAnchor | null;
  questionText: string;
  preWriteSnapshot: CellSnapshot | null;
  jobId: string | null;
  answerId: string | null;
  streamedText: string;
  sources: SourceCitation[];
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  isTruncated: boolean;
  errorMessage: string | null;
  isDrawerOpen: boolean;

  // Actions
  startFlow: (answerAnchor: CellAnchor, snapshot?: CellSnapshot) => void;
  setQuestion: (questionAnchor: CellAnchor, text: string) => void;
  clearQuestion: () => void;
  cancelFlow: () => void;
  startGeneration: (jobId: string) => void;
  appendToken: (token: string) => void;
  setSources: (sources: SourceCitation[]) => void;
  finishGeneration: (answerId: string, confidence?: "HIGH" | "MEDIUM" | "LOW", truncated?: boolean) => void;
  setError: (message: string) => void;
  clearError: () => void;
  setDrawerOpen: (open: boolean) => void;
  closeDrawer: () => void;
  openAnswerReview: (payload: {
    answerId: string;
    answerAnchor: CellAnchor;
    questionAnchor?: CellAnchor | null;
    questionText?: string;
    text: string;
    sources?: SourceCitation[];
    confidence?: "HIGH" | "MEDIUM" | "LOW" | null;
  }) => void;
  updateAnswerText: (newText: string) => void;
  resetToIdle: () => void;
}

export const useFlowStore = create<FlowStore>((set) => ({
  state: "IDLE",
  answerAnchor: null,
  questionAnchor: null,
  questionText: "",
  preWriteSnapshot: null,
  jobId: null,
  answerId: null,
  streamedText: "",
  sources: [],
  confidence: null,
  isTruncated: false,
  errorMessage: null,
  isDrawerOpen: false,

  startFlow: (answerAnchor, snapshot) =>
    set({
      state: "PICK_QUESTION",
      answerAnchor,
      preWriteSnapshot: snapshot || null,
      questionAnchor: null,
      questionText: "",
      streamedText: "",
      sources: [],
      confidence: null,
      errorMessage: null,
    }),

  setQuestion: (questionAnchor, text) =>
    set({
      state: "READY",
      questionAnchor,
      questionText: text,
      errorMessage: null,
    }),

  clearQuestion: () =>
    set({
      state: "PICK_QUESTION",
      questionAnchor: null,
      questionText: "",
    }),

  cancelFlow: () =>
    set({
      state: "IDLE",
      answerAnchor: null,
      questionAnchor: null,
      questionText: "",
      preWriteSnapshot: null,
      jobId: null,
      errorMessage: null,
    }),

  startGeneration: (jobId) =>
    set({
      state: "GENERATING",
      jobId,
      streamedText: "",
      sources: [],
      errorMessage: null,
    }),

  appendToken: (token) =>
    set((s) => ({
      streamedText: s.streamedText + token,
    })),

  setSources: (sources) =>
    set({
      sources,
    }),

  finishGeneration: (answerId, confidence, truncated) =>
    set({
      state: "REVIEW",
      answerId,
      confidence: confidence || "HIGH",
      isTruncated: !!truncated,
      isDrawerOpen: true,
    }),

  setError: (message) =>
    set({
      errorMessage: message,
      state: "IDLE",
    }),

  clearError: () =>
    set({
      errorMessage: null,
    }),

  setDrawerOpen: (open) =>
    set((s) => ({
      isDrawerOpen: open,
      state: open ? s.state : "IDLE",
    })),

  closeDrawer: () =>
    set({
      isDrawerOpen: false,
      state: "IDLE",
    }),

  openAnswerReview: (payload) =>
    set({
      state: "REVIEW",
      isDrawerOpen: true,
      answerId: payload.answerId,
      answerAnchor: payload.answerAnchor,
      questionAnchor: payload.questionAnchor || null,
      questionText: payload.questionText || "",
      streamedText: payload.text,
      sources: payload.sources || [],
      confidence: payload.confidence || "HIGH",
      errorMessage: null,
    }),

  updateAnswerText: (newText) =>
    set({
      streamedText: newText,
    }),

  resetToIdle: () =>
    set({
      state: "IDLE",
      answerAnchor: null,
      questionAnchor: null,
      questionText: "",
      preWriteSnapshot: null,
      jobId: null,
      answerId: null,
      streamedText: "",
      sources: [],
      confidence: null,
      isTruncated: false,
      errorMessage: null,
      isDrawerOpen: false,
    }),
}));
