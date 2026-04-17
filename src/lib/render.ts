import { promises as fs } from "fs";
import { getJob, setJobError, updateJobStatus } from "@/lib/job-store";
import {
  getClipVideoPath,
  getOriginalVideoPath,
  getTranscriptPath,
} from "@/lib/storage";
import { cutVideoWithSubtitles } from "@/lib/ffmpeg";
import { sliceTranscript } from "@/lib/whisper";
import type { AspectMode, TranscriptChunk } from "@/types";

export async function renderClip(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job || !job.selectedClip) {
    throw new Error(`Job ${jobId} not ready for rendering`);
  }

  const { start, end } = job.selectedClip;
  const aspectMode: AspectMode = job.aspectMode ?? "original";

  try {
    await updateJobStatus(jobId, "rendering", 80);

    const transcriptBuffer = await fs.readFile(
      getTranscriptPath(jobId),
      "utf-8"
    );
    const transcript: TranscriptChunk[] = JSON.parse(transcriptBuffer);
    const subtitles = sliceTranscript(transcript, start, end);

    const videoPath = getOriginalVideoPath(jobId);
    const clipPath = getClipVideoPath(jobId);

    await cutVideoWithSubtitles(videoPath, clipPath, start, end, subtitles, aspectMode);
    await updateJobStatus(jobId, "completed", 100);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await setJobError(jobId, message);
    throw error;
  }
}
