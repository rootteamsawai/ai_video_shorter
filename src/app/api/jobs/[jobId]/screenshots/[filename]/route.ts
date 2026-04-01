import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { getJob } from "@/lib/job-store";
import { getScreenshotsDir, fileExists } from "@/lib/storage";

type RouteParams = {
  params: Promise<{ jobId: string; filename: string }>;
};

// ファイル名バリデーション: segment_N.jpg 形式のみ許可
const VALID_FILENAME_REGEX = /^segment_\d+\.jpg$/;

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { jobId, filename } = await params;

  // パストラバーサル対策 + ファイル名バリデーション
  const safeFilename = path.basename(filename);
  if (!VALID_FILENAME_REGEX.test(safeFilename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "completed") {
    return NextResponse.json(
      { error: "Screenshots are not ready yet" },
      { status: 400 }
    );
  }

  const screenshotsDir = getScreenshotsDir(jobId);
  const screenshotPath = path.join(screenshotsDir, safeFilename);

  if (!(await fileExists(screenshotPath))) {
    return NextResponse.json(
      { error: "Screenshot file not found" },
      { status: 404 }
    );
  }

  const stats = await stat(screenshotPath);
  const stream = createReadStream(screenshotPath);
  const webStream = nodeStreamToWeb(stream);

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": stats.size.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

function nodeStreamToWeb(
  stream: ReturnType<typeof createReadStream>
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      stream.on("data", (chunk: Buffer | string) => {
        const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        controller.enqueue(new Uint8Array(buffer));
      });
      stream.on("end", () => {
        controller.close();
      });
      stream.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      stream.destroy();
    },
  });
}
