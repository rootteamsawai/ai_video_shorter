import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import type { Segment, TranscriptChunk } from "@/types";

/**
 * 時間文字列（HH:MM:SS）を秒数に変換する
 */
export function timeToSeconds(time: string): number {
  const parts = time.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0];
}

/**
 * 秒数を時間文字列（HH:MM:SS）に変換する
 */
export function secondsToTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * 動画から音声を抽出する（MP3形式、128kbps）
 */
export async function extractAudio(
  videoPath: string,
  audioPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(128)
      .output(audioPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * 動画の長さを取得する（秒数）
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * 音声ファイルを指定した時間で分割する
 * Whisper API の 25MB 制限対応用
 */
export async function splitAudio(
  audioPath: string,
  outputDir: string,
  maxDurationSeconds: number = 600 // 10分
): Promise<string[]> {
  const duration = await getVideoDuration(audioPath);
  const chunks: string[] = [];

  const numChunks = Math.ceil(duration / maxDurationSeconds);

  for (let i = 0; i < numChunks; i++) {
    const startTime = i * maxDurationSeconds;
    const chunkPath = path.join(outputDir, `chunk_${i}.mp3`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioPath)
        .setStartTime(startTime)
        .setDuration(maxDurationSeconds)
        .output(chunkPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    chunks.push(chunkPath);
  }

  return chunks;
}

/**
 * 動画の一部を切り出す
 */
export async function cutVideo(
  inputPath: string,
  outputPath: string,
  startSeconds: number,
  endSeconds: number
): Promise<void> {
  const duration = endSeconds - startSeconds;

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startSeconds)
      .setDuration(duration)
      .outputOptions(["-c", "copy"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * 秒数をSRT形式の時間文字列に変換する（HH:MM:SS,mmm）
 */
function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

/**
 * TranscriptChunk配列からSRT形式の字幕テキストを生成する
 * @param chunks 字幕チャンク（元の動画からの絶対時間）
 * @param segmentStartSeconds セグメントの開始時間（秒）- 相対時間に変換するためのオフセット
 */
export function generateSrtContent(
  chunks: TranscriptChunk[],
  segmentStartSeconds: number
): string {
  const lines: string[] = [];

  chunks.forEach((chunk, index) => {
    // セグメント内での相対時間に変換
    const relativeStart = Math.max(0, chunk.start - segmentStartSeconds);
    const relativeEnd = Math.max(0, chunk.end - segmentStartSeconds);

    // 相対時間が負の場合やゼロ以下の長さの場合はスキップ
    if (relativeEnd <= relativeStart) {
      return;
    }

    lines.push(`${index + 1}`);
    lines.push(`${formatSrtTime(relativeStart)} --> ${formatSrtTime(relativeEnd)}`);
    lines.push(chunk.text);
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * 動画の一部を切り出して字幕を焼き込む（再エンコード）
 */
export async function cutVideoWithSubtitles(
  inputPath: string,
  outputPath: string,
  startSeconds: number,
  endSeconds: number,
  subtitles: TranscriptChunk[]
): Promise<void> {
  const duration = endSeconds - startSeconds;
  const outputDir = path.dirname(outputPath);
  const srtPath = path.join(outputDir, `subtitle_${Date.now()}.srt`);

  // SRTファイルを生成
  const srtContent = generateSrtContent(subtitles, startSeconds);
  await fs.writeFile(srtPath, srtContent, "utf-8");

  // FFmpeg subtitles フィルタ用にパスをエスケープ
  const escapedSrtPath = srtPath.replace(/([\\':[\]])/g, "\\$1");

  // 字幕スタイル設定
  // フォント: Noto Sans JP、サイズ: 動画高さの5%程度（FontSize=24想定）
  // 白文字 + 黒縁取り + 半透明黒背景
  const subtitleStyle =
    "FontName=Noto Sans JP,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=4,Outline=2,Shadow=0,MarginV=30";

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startSeconds)
      .setDuration(duration)
      .videoFilters([
        {
          filter: "subtitles",
          options: {
            filename: escapedSrtPath,
            force_style: subtitleStyle,
          },
        },
      ])
      .outputOptions(["-c:v", "libx264", "-c:a", "aac", "-preset", "fast"])
      .output(outputPath)
      .on("end", async () => {
        // SRTファイルをクリーンアップ
        await fs.unlink(srtPath).catch(() => {});
        resolve();
      })
      .on("error", async (err) => {
        await fs.unlink(srtPath).catch(() => {});
        reject(err);
      })
      .run();
  });
}

/**
 * 複数の動画クリップを結合する
 */
export async function concatenateVideos(
  clipPaths: string[],
  outputPath: string
): Promise<void> {
  if (clipPaths.length === 0) {
    throw new Error("No clips to concatenate");
  }

  if (clipPaths.length === 1) {
    await fs.copyFile(clipPaths[0], outputPath);
    return;
  }

  // concat demuxer 用のリストファイルを作成
  const listPath = path.join(path.dirname(outputPath), "concat_list.txt");
  const listContent = clipPaths.map((p) => `file '${p}'`).join("\n");
  await fs.writeFile(listPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c", "copy"])
      .output(outputPath)
      .on("end", async () => {
        // クリーンアップ
        await fs.unlink(listPath).catch(() => {});
        resolve();
      })
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * セグメントリストから動画を切り出して結合する（字幕付き）
 */
export async function generateDigest(
  inputPath: string,
  outputPath: string,
  segments: Segment[]
): Promise<void> {
  const outputDir = path.dirname(outputPath);
  const clipPaths: string[] = [];

  // 各セグメントを切り出し（字幕がある場合は焼き込み）
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const clipPath = path.join(outputDir, `clip_${i}.mp4`);

    const startSeconds = timeToSeconds(segment.start);
    const endSeconds = timeToSeconds(segment.end);

    if (segment.subtitles && segment.subtitles.length > 0) {
      // 字幕付きで切り出し（再エンコード）
      await cutVideoWithSubtitles(
        inputPath,
        clipPath,
        startSeconds,
        endSeconds,
        segment.subtitles
      );
    } else {
      // 字幕なしで切り出し（コピー）
      await cutVideo(inputPath, clipPath, startSeconds, endSeconds);
    }
    clipPaths.push(clipPath);
  }

  // クリップを結合
  await concatenateVideos(clipPaths, outputPath);

  // 一時ファイルを削除
  for (const clipPath of clipPaths) {
    await fs.unlink(clipPath).catch(() => {});
  }
}
