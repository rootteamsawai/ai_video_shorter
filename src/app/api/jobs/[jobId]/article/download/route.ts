import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough } from "stream";
import { getJob } from "@/lib/job-store";
import {
  getArticlePath,
  getScreenshotsDir,
  fileExists,
} from "@/lib/storage";

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

  const screenshotsDir = getScreenshotsDir(jobId);

  // ZIP を作成
  const archive = archiver("zip", { zlib: { level: 9 } });
  const passThrough = new PassThrough();

  // archiver のエラー処理
  archive.on("error", (err) => {
    console.error("Archive error:", err);
    passThrough.destroy(err);
  });

  // archiver の出力を PassThrough にパイプ
  archive.pipe(passThrough);

  // 記事ファイルを追加
  archive.file(articlePath, { name: "article.md" });

  // スクリーンショットディレクトリが存在する場合のみ追加
  if (await fileExists(screenshotsDir)) {
    archive.directory(screenshotsDir, "screenshots");
  }

  // アーカイブを完了
  archive.finalize();

  // PassThrough を Web ReadableStream に変換
  const webStream = nodeStreamToWeb(passThrough);

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="article-${jobId}.zip"`,
    },
  });
}

function nodeStreamToWeb(
  stream: PassThrough
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
