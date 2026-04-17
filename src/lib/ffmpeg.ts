import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import type { AspectMode, TranscriptChunk } from "@/types";
type AudioVideoFilter = import("fluent-ffmpeg").AudioVideoFilter;

export function timeToSeconds(time: string): number {
  const parts = time.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0];
}

export function secondsToTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}`;
}

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

export async function splitAudio(
  audioPath: string,
  outputDir: string,
  maxDurationSeconds: number = 600
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

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms
    .toString()
    .padStart(3, "0")}`;
}

export function generateSrtContent(
  chunks: TranscriptChunk[],
  segmentStartSeconds: number,
  segmentEndSeconds: number
): string {
  const duration = segmentEndSeconds - segmentStartSeconds;
  const lines: string[] = [];

  chunks.forEach((chunk, index) => {
    const relativeStart = Math.max(0, chunk.start - segmentStartSeconds);
    const relativeEnd = Math.min(
      duration,
      Math.max(0, chunk.end - segmentStartSeconds)
    );

    if (relativeEnd - relativeStart <= 0.05) {
      return;
    }

    lines.push(`${index + 1}`);
    lines.push(
      `${formatSrtTime(relativeStart)} --> ${formatSrtTime(relativeEnd)}`
    );
    lines.push(chunk.text.trim());
    lines.push("");
  });

  return lines.join("\n");
}

export async function cutVideoWithSubtitles(
  inputPath: string,
  outputPath: string,
  startSeconds: number,
  endSeconds: number,
  subtitles: TranscriptChunk[],
  aspectMode: AspectMode = "original"
): Promise<void> {
  const duration = endSeconds - startSeconds;
  const outputDir = path.dirname(outputPath);
  const srtPath = path.join(outputDir, `subtitle_${Date.now()}.srt`);

  const srtContent = generateSrtContent(
    subtitles,
    startSeconds,
    endSeconds
  );
  await fs.writeFile(srtPath, srtContent, "utf-8");

  const escapedSrtPath = srtPath.replace(/([\\':[\]])/g, "\\$1");
  const subtitleStyle =
    "FontName=Noto Sans JP,FontSize=46,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BackColour=&H80212121,BorderStyle=4,Outline=6,Shadow=0,Alignment=2,MarginL=60,MarginR=60,MarginV=120";

  const filters: AudioVideoFilter[] = [
    {
      filter: "subtitles",
      options: {
        filename: escapedSrtPath,
        force_style: subtitleStyle,
      },
    },
  ];

  if (aspectMode === "vertical_pillarbox") {
    filters.push({ filter: "scale", options: "1080:-2" });
    filters.push({ filter: "pad", options: "1080:1920:(ow-iw)/2:(oh-ih)/2:black" });
  }

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startSeconds)
      .setDuration(duration)
      .videoFilters(filters)
      .outputOptions(["-c:v", "libx264", "-c:a", "aac", "-preset", "fast"])
      .output(outputPath)
      .on("end", async () => {
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
