import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { getJob } from "@/lib/job-store";
import { getArticlePath, fileExists } from "@/lib/storage";

type RouteParams = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "completed") {
    return NextResponse.json(
      { error: "Article is not ready yet" },
      { status: 400 }
    );
  }

  const articlePath = getArticlePath(jobId);

  if (!(await fileExists(articlePath))) {
    return NextResponse.json(
      { error: "Article file not found" },
      { status: 404 }
    );
  }

  const content = await fs.readFile(articlePath, "utf-8");

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
