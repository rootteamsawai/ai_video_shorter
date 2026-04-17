import Anthropic from "@anthropic-ai/sdk";
import type { ClipCandidate, TranscriptChunk } from "@/types";
import { formatTranscript } from "./whisper";

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

const CLAUDE_MODEL =
  process.env.CLAUDE_MODEL ?? "claude-3-haiku-20240307";

const SYSTEM_PROMPT = `あなたは動画編集プラットフォームのアシスタントです。\nセミナーやトーク動画の文字起こしを分析し、指定された秒数に最適なショートクリップ候補を提案してください。\n必ずJSONのみを返し、余計な説明テキストは書かないでください。\n\n各候補は以下を含めてください:\n- start_seconds (number)\n- end_seconds (number)\n- headline (jp)\n- reason (jp)\n- confidence (0-1 float)\n\nstart/endは必ず動画尺内に収め、end > startとしてください。`;

type CandidatePayload = {
  candidates: Array<{
    start_seconds: number;
    end_seconds: number;
    headline: string;
    reason: string;
    confidence: number;
  }>;
};


type CandidateResponse = CandidatePayload | CandidatePayload["candidates"];

function isCandidatePayload(value: CandidateResponse): value is CandidatePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as CandidatePayload).candidates)
  );
}

function sanitizeConfidence(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  if (value > 1) {
    // 0-100が返ってきた場合を考慮
    return Math.min(1, value / 100);
  }
  if (value < 0) return 0;
  return value;
}

function extractJsonContent(raw: string): string {
  let content = raw.trim();
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const startMatch = content.match(/[\[{]/);
  if (startMatch?.index !== undefined) {
    content = content.slice(startMatch.index);
  }

  const lastSquare = content.lastIndexOf("]");
  const lastCurly = content.lastIndexOf("}");
  const lastIndex = Math.max(lastSquare, lastCurly);
  if (lastIndex !== -1) {
    content = content.slice(0, lastIndex + 1);
  }

  return content.trim();
}

export async function generateClipCandidates(
  chunks: TranscriptChunk[],
  clipLengthSeconds: number,
  candidateCount: number
): Promise<ClipCandidate[]> {
  const transcript = formatTranscript(chunks);

  const userPrompt = `以下の文字起こしから、${clipLengthSeconds}秒前後の見せ場を${candidateCount}候補提案してください。\nそれぞれ必ずJSONの配列で返し、候補が十分でない場合は空配列にしてください。\n\n## 制約\n- start/end は秒数 (float) で出力する\n- duration は ${clipLengthSeconds}秒に近づける（±1.5秒以内を推奨）\n- headline は視聴者が惹かれる短いコピー\n- reason は30字前後の日本語の説明\n\n## 文字起こし\n${transcript}`;

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("Claude API returned no text content");
  }

  const jsonText = extractJsonContent(textContent.text);

  let parsed: CandidateResponse;
  try {
    parsed = JSON.parse(jsonText) as CandidatePayload;
  } catch {
    const snippet = jsonText.slice(0, 120);
    throw new Error(`Claude response was not valid JSON: ${snippet}`);
  }

  let candidateList: CandidatePayload["candidates"];
  if (isCandidatePayload(parsed)) {
    candidateList = (parsed as CandidatePayload).candidates;
  } else if (Array.isArray(parsed)) {
    candidateList = parsed as CandidatePayload["candidates"];
  } else {
    console.error("[claude] unexpected response", jsonText);
    throw new Error("Invalid Claude response: candidates missing");
  }

  return candidateList.slice(0, candidateCount).map((candidate, index) => {
    const start = Math.max(0, candidate.start_seconds ?? 0);
    const end = Math.max(start + 0.5, candidate.end_seconds ?? start);
    const duration = end - start;

    return {
      id: `cand_${index + 1}`,
      start,
      end,
      duration,
      headline: candidate.headline?.trim() || `候補${index + 1}`,
      reason: candidate.reason?.trim() || "AIが選定した注目ポイント",
      confidence: sanitizeConfidence(candidate.confidence ?? 0.5),
      previewTimestamp: start + duration / 2,
    } satisfies ClipCandidate;
  });
}
