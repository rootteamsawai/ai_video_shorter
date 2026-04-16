# ジョブ処理フロー (V2)

## Overview

- Inngest で非同期ジョブを管理
- アップロード後に `video/uploaded` をEmit → transcript → candidate 提案 → (ユーザー操作) → render の順
- ユーザー選択待ちをステータスとして明示し、再入可能

## Related Docs

- `design.md`
- `api.md`

## 全体フロー

```
video/uploaded
      │
      ▼
┌─────────────┐
│ transcribe  │  Step1 文字起こし (0-40%)
└─────┬───────┘
      │ TranscriptChunk[]
      ▼
┌─────────────┐
│ propose     │  Step2 候補抽出 (40-70%)
└─────┬───────┘
      │ ClipCandidate[]
      ▼
 status = awaiting_selection
      │ (ユーザーが POST /select)
      ▼
clip/selected event
      │
┌─────────────┐
│ render_clip │  Step3 トリミング+字幕 (80-100%)
└─────┬───────┘
      ▼
   completed / failed
```

## Step 1: transcribe

- 入力: `/jobs/{jobId}/original.mp4`
- 音声抽出 → 25MB超は10分単位でチャンク
- Whisper API（タイムスタンプ付き）で全文起こし
- 出力: `transcript.json` (`TranscriptChunk[]`)
- 進捗: start 10%, end 40%

```ts
type TranscriptChunk = {
  start: number; // 秒
  end: number;
  text: string;
};
```

## Step 2: propose-clips

- 入力: transcript.json, `clipLengthSeconds`, `candidateCount`
- TranscriptChunkを `HH:MM:SS text` の形に整形してClaudeへ
- Claudeレスポンス（JSON）をバリデーション → `candidates.json` 保存
- `job.json` を `status = "awaiting_selection"` に更新
- 進捗: start 50%, end 70%

```ts
type ClipCandidate = {
  id: string;
  start: number;
  end: number;
  duration: number;
  headline: string;
  reason: string;
  confidence: number;
  previewTimestamp: number;
};
```

## ユーザー選択 (API層)

- `/api/jobs/{jobId}/select` で `candidateId` と `start/end` (秒) を受け取る
- バリデーション: `duration` が `clipLengthSeconds ± 1.5s` に収まること
- `job.json` に `selectedClip` を保存し、`clip/selected` イベントをInngestに送信
- ジョブstatusを `rendering`、progress 80 に更新

## Step 3: render-clip

- 入力: original.mp4, transcript.json, selectedClip
- サブステップ
  1. `ffmpeg -ss {start} -to {end}` で指定区間を切り出し
  2. transcriptから該当部分のチャンクを抽出し、SRT生成
  3. `ffmpeg -vf subtitles=...` で字幕焼き込み
  4. `/jobs/{jobId}/clip.mp4` として保存
- 完了後: status=completed, progress=100, completedAt set

## エラー/リトライ

- 各Stepは `step.run` で実装。デフォルトリトライ(最大3)を使用
- ユーザー選択前に失敗した場合 → status=failed、`errorMessage` 記録
- `render-clip` で失敗した場合も failed。再選択して再レンダリングする場合は今後のTODO

## ストレージ構成 (Railway Volume)

```
/jobs
  /{jobId}
    original.mp4
    transcript.json
    candidates.json
    job.json
    clip.mp4            # completed後のみ存在
    thumbnails/
      candidate_0.jpg   # 任意、将来拡張
```

## Job JSON 例

```json
{
  "id": "...",
  "status": "awaiting_selection",
  "progress": 70,
  "clipLengthSeconds": 10,
  "candidateCount": 3,
  "createdAt": "...",
  "completedAt": null,
  "errorMessage": null,
  "selectedClip": null
}
```

`selectedClip` は以下の形。

```json
{
  "candidateId": "cand_01",
  "start": 122.9,
  "end": 133.5
}
```

## 将来拡張メモ

- 複数クリップ選択 → `render_clip` を並列に走らせる
- 候補再生成API → transcriptを再利用してClaudeを再実行
- SSEでのリアルタイム更新 → 現状はポーリング
