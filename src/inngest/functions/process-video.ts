import { promises as fs } from "fs";
import { inngest } from "../client";
import {
  updateJobStatus,
  setJobError,
  setJobSegments,
  setJobArticlePath,
} from "@/lib/job-store";
import {
  getOriginalVideoPath,
  getDigestVideoPath,
  getJobDir,
  getArticlePath,
} from "@/lib/storage";
import { transcribeVideo } from "@/lib/whisper";
import { extractPunchlines } from "@/lib/claude";
import { generateDigest, extractScreenshotsForSegments } from "@/lib/ffmpeg";
import { generateArticle } from "@/lib/article";
import type { TranscriptChunk, Segment } from "@/types";

export const processVideo = inngest.createFunction(
  { id: "process-video" },
  { event: "video/uploaded" },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string };

    try {
      // Step 1: 文字起こし
      const chunks = await step.run("transcribe", async () => {
        await updateJobStatus(jobId, "transcribing", 10);

        const videoPath = getOriginalVideoPath(jobId);
        const jobDir = getJobDir(jobId);

        // 分割処理時は進捗を細かく更新（10% → 40% の範囲で）
        const result = await transcribeVideo(videoPath, jobDir, async (current, total) => {
          if (total > 1) {
            // 10% から 40% の範囲で進捗を計算
            const progress = 10 + Math.floor((current / total) * 30);
            await updateJobStatus(jobId, "transcribing", progress);
          }
        });

        await updateJobStatus(jobId, "transcribing", 40);

        return result;
      });

      // Step 2: パンチライン抽出
      const segments = await step.run("analyze", async () => {
        await updateJobStatus(jobId, "analyzing", 50);

        const result = await extractPunchlines(
          chunks as TranscriptChunk[],
          5 // 目標: 5分
        );

        await updateJobStatus(jobId, "analyzing", 70);

        // セグメント情報を保存
        await setJobSegments(jobId, result.segments);

        return result.segments;
      });

      // Step 3: ダイジェスト動画・記事生成
      await step.run("generate-digest", async () => {
        await updateJobStatus(jobId, "generating", 80);

        const videoPath = getOriginalVideoPath(jobId);
        const digestPath = getDigestVideoPath(jobId);
        const typedSegments = segments as Segment[];

        // 各セグメントの開始時点でスクリーンショットを抽出
        await extractScreenshotsForSegments(videoPath, jobId, typedSegments);

        // ダイジェスト動画を生成
        await generateDigest(videoPath, digestPath, typedSegments);

        // Markdown記事を生成
        const articleContent = generateArticle(typedSegments);
        const articlePath = getArticlePath(jobId);
        await fs.writeFile(articlePath, articleContent, "utf-8");

        // 記事パスを保存
        await setJobArticlePath(jobId, articlePath);

        await updateJobStatus(jobId, "completed", 100);
      });

      return { success: true, jobId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      await setJobError(jobId, errorMessage);
      throw error;
    }
  }
);
