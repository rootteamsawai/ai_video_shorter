/** ジョブのステータス */
export type JobStatus =
  | "pending"
  | "transcribing"
  | "proposing"
  | "awaiting_selection"
  | "rendering"
  | "completed"
  | "failed";

export type ClipCandidate = {
  id: string;
  start: number; // seconds
  end: number; // seconds
  duration: number; // seconds
  headline: string;
  reason: string;
  confidence: number; // 0-1
  previewTimestamp: number; // seconds
};

export type SelectedClip = {
  candidateId: string;
  start: number;
  end: number;
};

/** ジョブ情報 */
export type Job = {
  id: string;
  status: JobStatus;
  progress: number; // 0-100
  errorMessage?: string | null;
  createdAt: string; // ISO 8601
  completedAt?: string | null;
  clipLengthSeconds: number;
  candidateCount: number;
  candidates?: ClipCandidate[] | null;
  selectedClip?: SelectedClip | null;
};

/** 文字起こしチャンク */
export type TranscriptChunk = {
  start: number; // seconds
  end: number; // seconds
  text: string;
};
