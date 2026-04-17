import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { getJob } from "@/lib/job-store";
import { getTranscriptPath } from "@/lib/storage";
import { sliceTranscript } from "@/lib/whisper";
import type { TranscriptChunk } from "@/types";

type RouteParams = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job || !job.selectedClip) {
    return NextResponse.json({ error: "Job not ready" }, { status: 404 });
  }

  try {
    const transcriptRaw = await fs.readFile(getTranscriptPath(jobId), "utf-8");
    const transcript = JSON.parse(transcriptRaw) as TranscriptChunk[];
    const segments = sliceTranscript(
      transcript,
      job.selectedClip.start,
      job.selectedClip.end
    );

    const text = segments.map((segment) => segment.text.trim()).join(" ");

    return NextResponse.json({
      start: job.selectedClip.start,
      end: job.selectedClip.end,
      duration: Number(
        (job.selectedClip.end - job.selectedClip.start).toFixed(2)
      ),
      segments,
      text,
    });
  } catch (error) {
    console.error("snippet error", error);
    return NextResponse.json(
      { error: "Failed to load transcript" },
      { status: 500 }
    );
  }
}
