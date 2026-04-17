import { promises as fs } from "fs";
import { inngest } from "../client";
import {
  getJob,
  setJobCandidates,
  setJobError,
  updateJobStatus,
} from "@/lib/job-store";
import {
  getCandidatesPath,
  getClipVideoPath,
  getJobDir,
  getOriginalVideoPath,
  getTranscriptPath,
} from "@/lib/storage";
import { transcribeVideo, sliceTranscript } from "@/lib/whisper";
import { generateClipCandidates } from "@/lib/claude";
import { cutVideoWithSubtitles } from "@/lib/ffmpeg";
import type { TranscriptChunk } from "@/types";
import { renderClip } from "@/lib/render";

type PrepareContext = {
  event: { data: { jobId: string } };
  step: {
    run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  };
};

const handlePrepareShortClip = async ({ event, step }: PrepareContext) => {
  const { jobId } = event.data;
  const job = await getJob(jobId);

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  try {
    const chunks = await step.run("transcribe", async () => {
      await updateJobStatus(jobId, "transcribing", 10);
      const videoPath = getOriginalVideoPath(jobId);
      const jobDir = getJobDir(jobId);

      const result = await transcribeVideo(
        videoPath,
        jobDir,
        async (current, total) => {
          if (total > 1 && total > 0) {
            const progress = 10 + Math.floor((current / total) * 30);
            await updateJobStatus(jobId, "transcribing", progress);
          }
        }
      );

      await fs.writeFile(
        getTranscriptPath(jobId),
        JSON.stringify(result, null, 2)
      );
      await updateJobStatus(jobId, "transcribing", 40);
      return result;
    });

    await step.run("propose", async () => {
      await updateJobStatus(jobId, "proposing", 50);
      const candidates = await generateClipCandidates(
        chunks as TranscriptChunk[],
        job.clipLengthSeconds,
        job.candidateCount
      );

      await setJobCandidates(jobId, candidates);
      await fs.writeFile(
        getCandidatesPath(jobId),
        JSON.stringify(candidates, null, 2)
      );
      await updateJobStatus(jobId, "awaiting_selection", 70);
    });

    return { success: true, jobId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await setJobError(jobId, message);
    throw error;
  }
};

export const legacyProcessVideo = inngest.createFunction(
  { id: "process-video" },
  { event: "video/uploaded" },
  handlePrepareShortClip
);

export const prepareShortClip = inngest.createFunction(
  { id: "prepare-short-clip" },
  { event: "video/uploaded" },
  handlePrepareShortClip
);

export const renderShortClip = inngest.createFunction(
  { id: "render-short-clip" },
  { event: "clip/selected" },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string };
    try {
      await step.run("render", () => renderClip(jobId));
      return { success: true, jobId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await setJobError(jobId, message);
      throw error;
    }
  }
);
