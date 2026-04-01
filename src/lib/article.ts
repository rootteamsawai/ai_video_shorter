import type { Segment } from "@/types";

/**
 * セグメント配列からMarkdown形式のダイジェスト記事を生成する
 */
export function generateArticle(segments: Segment[]): string {
  const lines: string[] = [];

  lines.push("# ダイジェスト");
  lines.push("");

  segments.forEach((segment, index) => {
    lines.push(`## ${index + 1}. ${segment.reason}`);
    lines.push("");
    lines.push(`![スクリーンショット](screenshots/segment_${index}.jpg)`);
    lines.push("");
    lines.push(`> ${segment.quote}`);
    lines.push("");

    // 最後のセグメント以外は区切り線を追加
    if (index < segments.length - 1) {
      lines.push("---");
      lines.push("");
    }
  });

  return lines.join("\n");
}
