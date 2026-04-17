"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import type { ClipCandidate, Job } from "@/types";
import { ProgressDisplay } from "@/components/progress-display";
import { VideoPreview } from "@/components/video-preview";

const POLL_INTERVAL = 3000;

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

type Tab = "status" | "preview";

type ClipDetails = {
  start: number;
  end: number;
  duration: number;
  text: string;
};

type Props = {
  params: Promise<{ jobId: string }>;
};

export default function JobPage({ params }: Props) {
  const { jobId } = use(params);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clipDetails, setClipDetails] = useState<ClipDetails | null>(null);
  const [clipDetailsError, setClipDetailsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("status");
  const [activeCandidate, setActiveCandidate] = useState<ClipCandidate | null>(
    null
  );
  const [startValue, setStartValue] = useState<number | null>(null);
  const [endValue, setEndValue] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const shouldPoll = job
    ? !["completed", "failed"].includes(job.status)
    : true;

  useEffect(() => {
    const controller = new AbortController();

    const fetchJob = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 404) {
            setError("ジョブが見つかりませんでした");
            return;
          }
          throw new Error("Failed to fetch job");
        }

        const data = (await response.json()) as Job;
        setJob(data);

        if (data.status === "awaiting_selection" && data.candidates?.length) {
          setActiveCandidate((prev) => prev ?? data.candidates?.[0] ?? null);
        }

        if (shouldPoll) {
          setTimeout(fetchJob, POLL_INTERVAL);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError("ジョブ情報の取得に失敗しました");
      }
    };

    fetchJob();
    return () => {
      controller.abort();
    };
  }, [jobId, shouldPoll]);

  useEffect(() => {
    if (job?.status === "completed" && job.selectedClip) {
      const controller = new AbortController();
      setClipDetails(null);
      setClipDetailsError(null);
      fetch(`/api/jobs/${jobId}/snippet`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) {
            throw new Error('failed');
          }
          return res.json();
        })
        .then((payload) => {
          setClipDetails(payload);
        })
        .catch(() => {
          setClipDetailsError('文字起こしを取得できませんでした');
        });
      return () => controller.abort();
    }
    setClipDetails(null);
    return undefined;
  }, [job, jobId]);

  useEffect(() => {

    if (!activeCandidate) {
      setStartValue(null);
      setEndValue(null);
      return;
    }
    setStartValue(activeCandidate.start);
    setEndValue(activeCandidate.end);
  }, [activeCandidate]);

  const clampStart = useMemo(() => {
    if (!activeCandidate) return 0;
    return activeCandidate.start - 2;
  }, [activeCandidate]);

  const clampEnd = useMemo(() => {
    if (!activeCandidate) return 0;
    return activeCandidate.end + 2;
  }, [activeCandidate]);

  const actualDuration = useMemo(() => {
    if (startValue == null || endValue == null) return null;
    return Number((endValue - startValue).toFixed(2));
  }, [startValue, endValue]);

  const handleNudge = (target: "start" | "end", delta: number) => {
    if (!activeCandidate) return;

    if (target === "start" && startValue != null) {
      const next = Math.min(
        Math.max(clampStart, startValue + delta),
        (endValue ?? activeCandidate.end) - 0.3
      );
      setStartValue(Number(next.toFixed(2)));
    }

    if (target === "end" && endValue != null) {
      const next = Math.max(
        Math.min(clampEnd, endValue + delta),
        (startValue ?? activeCandidate.start) + 0.3
      );
      setEndValue(Number(next.toFixed(2)));
    }
  };

  const submitSelection = async () => {
    if (!job || !activeCandidate || startValue == null || endValue == null) {
      return;
    }

    setSelecting(true);
    setSelectionError(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: activeCandidate.id,
          start: startValue,
          end: endValue,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "選択に失敗しました");
      }

      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: "rendering",
              selectedClip: {
                candidateId: activeCandidate.id,
                start: startValue,
                end: endValue,
              },
            }
          : prev
      );
    } catch (err) {
      setSelectionError(
        err instanceof Error ? err.message : "書き出しに失敗しました"
      );
    } finally {
      setSelecting(false);
    }
  };

  if (error) {
    return (
      <div className="text-center">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4">
          {error}
        </div>
        <Link href="/" className="text-blue-600 hover:underline">
          トップに戻る
        </Link>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center">
        <div className="animate-pulse text-gray-500">読み込み中...</div>
      </div>
    );
  }

  const durationDiff =
    actualDuration != null ?
      Number((actualDuration - job.clipLengthSeconds).toFixed(2))
    : null;

  const selectionSummary = job.selectedClip && (
    <div className="p-4 bg-slate-50 rounded-lg flex flex-col gap-2 text-sm text-slate-700">
      <div>
        <p className="font-semibold text-slate-900">選択済みクリップ</p>
        <p>
          {formatSeconds(job.selectedClip.start)} – {formatSeconds(job.selectedClip.end)}
        </p>
        <p>尺: {(job.selectedClip.end - job.selectedClip.start).toFixed(2)} 秒</p>
        <p className="text-xs text-slate-500">出力: {job.aspectMode === "vertical_pillarbox" ? "縦型 (上下黒)" : "横長"}</p>
      </div>
      {clipDetails && (
        <div className="text-slate-900">
          <p className="text-xs font-semibold text-slate-500 mb-1">この区間のトーク</p>
          <p className="leading-relaxed whitespace-pre-line">{clipDetails.text || "該当するトークが見つかりませんでした"}</p>
        </div>
      )}
      {clipDetailsError && (
        <p className="text-xs text-red-500">{clipDetailsError}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      {job.status === "completed" ? (
        <>
          <div className="text-center">
            <div className="text-4xl mb-4">🚀</div>
            <h2 className="text-2xl font-bold text-gray-900">
              ショートクリップが完成しました
            </h2>
            <p className="text-gray-600">
              テロップ入りの動画をそのままSNSにアップできます
            </p>
          </div>

          <div className="flex justify-center border-b border-gray-200">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "preview"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              プレビュー
            </button>
            <button
              onClick={() => setActiveTab("status")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "status"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              詳細
            </button>
          </div>

          {activeTab === "preview" ? (
            <VideoPreview jobId={jobId} />
          ) : (
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              {selectionSummary}
              <div>
                <p className="text-sm text-gray-500">ジョブID</p>
                <p className="font-mono text-gray-800">{job.id}</p>
              </div>
            </div>
          )}

          <div className="text-center">
            <Link href="/" className="text-blue-600 hover:underline">
              別の動画を処理する
            </Link>
          </div>
        </>
      ) : job.status === "failed" ? (
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            処理に失敗しました
          </h2>
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4">
            {job.errorMessage || "不明なエラーが発生しました"}
          </div>
          <Link href="/" className="text-blue-600 hover:underline">
            もう一度試す
          </Link>
        </div>
      ) : job.status === "awaiting_selection" ? (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              ベストポジションを選択
            </h2>
            <p className="text-gray-600 text-sm">
              希望尺: {job.clipLengthSeconds}s ／ 候補数: {job.candidateCount}
            </p>
          </div>

          {job.candidates && job.candidates.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {job.candidates.map((candidate) => {
                const isActive = activeCandidate?.id === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setActiveCandidate(candidate)}
                    className={`text-left border rounded-xl p-4 bg-white shadow-sm transition-all ${
                      isActive
                        ? "border-blue-500 ring-2 ring-blue-100"
                        : "border-gray-200 hover:border-blue-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Candidate
                      </span>
                      <span className="text-xs text-gray-400">
                        confidence {(candidate.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900">
                      {candidate.headline}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">{candidate.reason}</p>
                    <div className="mt-3 text-xs text-gray-500 flex items-center justify-between">
                      <span>
                        {formatSeconds(candidate.start)} – {formatSeconds(candidate.end)}
                      </span>
                      <span>{candidate.duration.toFixed(1)}s</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-900">
              候補が生成できませんでした。別の動画でお試しください。
            </div>
          )}

          {activeCandidate && (
            <div className="bg-white rounded-2xl shadow p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">選択中の候補</p>
                  <p className="font-semibold text-gray-900">
                    {activeCandidate.headline}
                  </p>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <p>
                    {formatSeconds(activeCandidate.start)} – {formatSeconds(activeCandidate.end)}
                  </p>
                  <p>{activeCandidate.duration.toFixed(2)}s</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">
                    Start
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleNudge("start", -0.2)}
                      className="px-3 py-2 rounded-md border text-sm"
                      disabled={selecting}
                    >
                      -0.2s
                    </button>
                    <input
                      type="number"
                      step={0.1}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2"
                      value={startValue ?? activeCandidate.start}
                      disabled={selecting}
                      onChange={(e) =>
                        setStartValue(
                          Math.max(
                            clampStart,
                            Math.min(Number(e.target.value), (endValue ?? activeCandidate.end) - 0.3)
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => handleNudge("start", 0.2)}
                      className="px-3 py-2 rounded-md border text-sm"
                      disabled={selecting}
                    >
                      +0.2s
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">
                    End
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleNudge("end", -0.2)}
                      className="px-3 py-2 rounded-md border text-sm"
                      disabled={selecting}
                    >
                      -0.2s
                    </button>
                    <input
                      type="number"
                      step={0.1}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2"
                      value={endValue ?? activeCandidate.end}
                      disabled={selecting}
                      onChange={(e) =>
                        setEndValue(
                          Math.min(
                            clampEnd,
                            Math.max(Number(e.target.value), (startValue ?? activeCandidate.start) + 0.3)
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => handleNudge("end", 0.2)}
                      className="px-3 py-2 rounded-md border text-sm"
                      disabled={selecting}
                    >
                      +0.2s
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>現在の尺: {actualDuration?.toFixed(2)}s</span>
                <span>
                  目標との差: {durationDiff != null ? durationDiff.toFixed(2) : "-"}s
                </span>
              </div>

              {selectionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {selectionError}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={submitSelection}
                  disabled={selecting}
                  className="px-5 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {selecting ? "書き出し中..." : "この範囲で書き出す"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              ジョブを処理中です
            </h2>
            <p className="text-gray-600">
              文字起こし・候補生成・レンダリングを順番に行っています
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <ProgressDisplay status={job.status} progress={job.progress} />
            {selectionSummary}
          </div>
        </>
      )}
    </div>
  );
}
