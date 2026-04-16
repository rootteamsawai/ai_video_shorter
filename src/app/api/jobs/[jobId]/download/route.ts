import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { getJob } from "@/lib/job-store";
import { getClipVideoPath, fileExists } from "@/lib/storage";

type RouteParams = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "completed") {
    return NextResponse.json(
      { error: "Clip is not ready yet" },
      { status: 400 }
    );
  }

  const clipPath = getClipVideoPath(jobId);

  if (!(await fileExists(clipPath))) {
    return NextResponse.json(
      { error: "Clip file not found" },
      { status: 404 }
    );
  }

  const stats = await stat(clipPath);
  const fileSize = stats.size;
  const rangeHeader = request.headers.get("range");

  // Range リクエストの処理（シーク対応）
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;
      const stream = createReadStream(clipPath, { start, end });
      const webStream = nodeStreamToWeb(stream);

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Content-Length": chunkSize.toString(),
          "Accept-Ranges": "bytes",
        },
      });
    }
  }

  // Range なしの場合は全体を返す
  const stream = createReadStream(clipPath);
  const webStream = nodeStreamToWeb(stream);

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="clip-${jobId}.mp4"`,
      "Content-Length": fileSize.toString(),
      "Accept-Ranges": "bytes",
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
