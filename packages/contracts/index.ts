/**
 * Proposal Assistant – Shared API Contracts & Types
 */

export interface CellAnchorDTO {
  sheet: string;
  address: string;
  mergedRange?: string;
}

export interface JobCreateDTO {
  questionText: string;
  questionAnchor: CellAnchorDTO;
  answerAnchor: CellAnchorDTO;
  context?: {
    columnHeaders?: string[];
    sectionLabel?: string;
    neighbours?: string[];
    charLimit?: number;
  };
  options?: {
    length?: "standard" | "concise" | "detailed";
    tone?: "professional" | "persuasive" | "technical";
  };
}

export interface JobResponseDTO {
  jobId: string;
  status: "QUEUED" | "RUNNING" | "DONE" | "NO_SOURCE" | "FAILED" | "CANCELLED";
}

export interface SourceCitationDTO {
  doc: string;
  section?: string;
  snippet: string;
  score: number;
}

export interface AnswerSummaryDTO {
  id: string;
  text: string;
  sources: SourceCitationDTO[];
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  status: "DRAFT" | "ACCEPTED" | "EDITED" | "REJECTED" | "UNDONE";
  truncated: boolean;
}

export interface ProjectListItemDTO {
  id: string;
  name: string;
  fileType: string;
  status: string;
  filledCount: number;
  unreviewedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EditorConfigDTO {
  documentServerUrl: string;
  documentType: string;
  docKey: string;
  fileUrl: string;
  callbackUrl: string;
  jwtToken: string;
  user: {
    id: string;
    name: string;
  };
}
