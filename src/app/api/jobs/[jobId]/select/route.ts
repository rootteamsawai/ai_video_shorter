import { NextRequest, NextResponse } from "next/server";
import {
  getJob,
  setJobSelectedClip,
} from "@/lib/job-store";
import { renderClip } from "@/lib/render";

const ADJUSTMENT_LIMIT = 2; // seconds
const DURATION_TOLERANCE = 1.5; // seconds

type RouteParams = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "awaiting_selection" || !job.candidates) {
    return NextResponse.json(
      { error: "Job is not ready for selection" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { candidateId, start, end } = body ?? {};

  if (!candidateId || typeof start !== "number" || typeof end !== "number") {
    return NextResponse.json(
      { error: "candidateId, start, end are required" },
      { status: 400 }
    );
  }

  const candidate = job.candidates.find((c) => c.id === candidateId);
  if (!candidate) {
    return NextResponse.json(
      { error: "Candidate not found" },
      { status: 404 }
    );
  }

  if (start < 0 || end <= start) {
    return NextResponse.json(
      { error: "Invalid start/end" },
      { status: 400 }
    );
  }

  if (
    start < candidate.start - ADJUSTMENT_LIMIT ||
    end > candidate.end + ADJUSTMENT_LIMIT
  ) {
    return NextResponse.json(
      { error: "Adjustment exceeds allowed range" },
      { status: 400 }
    );
  }

  const duration = end - start;
  if (Math.abs(duration - job.clipLengthSeconds) > DURATION_TOLERANCE) {
    return NextResponse.json(
      { error: "Duration must stay close to requested length" },
      { status: 400 }
    );
  }

  await setJobSelectedClip(jobId, { candidateId, start, end });
  renderClip(jobId).catch((error) => {
    console.error("renderClip error", error);
  });

  return NextResponse.json({ id: jobId, status: "rendering" });
}
