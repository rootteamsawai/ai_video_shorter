# AI Video Shorter

## Overview

- セミナー/講義などの長尺動画から、指定した秒数のショートクリップ候補をAIが自動提案し、ユーザーがベストカットを選んで書き出せるWebアプリ
- 動画アップロード時に希望尺（例: 10秒 / 15秒）を入力 → トランスクライブ → AIが候補区間を提示 → 選択した区間のみトリミング & テロップ焼き込み
- 認証なしの一般公開、Railwayデプロイを前提。既存のV1（5分ダイジェスト）からのピボット版

## Related Docs

- `api.md` — APIエンドポイント仕様
- `job-processing.md` — ジョブ/ワーカーの処理フロー

## Specification

### 機能要件（V2）

1. **動画アップロード + メタ情報入力**
   - mp4をドロップ/選択してアップロード
   - 「生成したい尺（秒数）」を1つ以上指定（例: 10秒, 15秒。MVPは単一値でOK）
   - アップロード完了と同時に非同期ジョブを起動

2. **自動トランスクライブ**
   - Whisper APIで全文文字起こし（タイムスタンプ付き）
   - 90分/500MBまで対応、長尺は音声チャンク分割

3. **AIによるショートクリップ候補提案**
   - Claudeにトランスクリプト + 希望尺 + クリップ数（デフォルト3件）を渡し、`start`/`end`/`headline`/`reason`/`confidence` を含む候補リストを生成
   - 各候補にはプレビュー用静止画取得に使うミッドポイント時刻を含める

4. **ユーザー選択UI**
   - 候補リストをカード表示（波形/字幕プレビュー/理由テキスト）
   - 候補クリックでタイムラインを開き、±2秒などの微調整が可能
   - 「この区間で書き出す」を押すとレンダリングジョブを起動

5. **自動トリミング + テロップ焼き込み**
   - 選択された `start/end` にあわせてFFmpegで切り出し
   - Whisper結果を該当区間で切り出し、SRT生成→動画に直接焼き込み（Noto Sans JP / 24px / 白字+黒縁 / 下中央）

6. **書き出し・ダウンロード**
   - 生成完了後に `/api/jobs/{jobId}/download` からmp4取得
   - UI上でもプレビュー + ダウンロードボタンを表示

### 非機能要件

- 最大90分/500MBのmp4を処理可能
- 認証なし公開
- Railwayでデプロイ可能（Next.js App Router + Inngest）
- 1ジョブあたり候補生成までは5分以内、書き出しは1分以内を目標

### 技術スタック

| レイヤー             | 技術/サービス                                          |
| -------------------- | ------------------------------------------------------- |
| フロントエンド       | Next.js 15 (App Router) + TypeScript + Tailwind CSS     |
| 状態管理             | React Server Actions + SWR（ポーリング）               |
| バックエンドAPI      | Next.js Route Handlers                                  |
| 文字起こし           | OpenAI Whisper API                                      |
| 候補生成AI           | Claude 3.5 Sonnet（`claude-3-5-sonnet-20240620`）       |
| 動画処理             | FFmpeg（fluent-ffmpeg）                                 |
| ジョブキュー         | Inngest                                                  |
| ストレージ           | Railway Volume（`/jobs/{jobId}`構成）                   |
| デプロイ             | Railway                                                  |

### アーキテクチャ（V2）

```
[ユーザー]
    │ アップロード & 尺指定
    ▼
[Next.js Frontend]
    │ POST /api/upload
    ▼
[API Route] ──► [Railway Volume]
    │                  │ original.mp4 保存
    │ Emit event       │
    ▼                  │
[Inngest Worker]
    │ 1. transcribe → transcript.json
    │ 2. propose-clips → candidates.json
    ▼
[Job Store]
    │ status=awaiting_selection で待機
    ▼ ユーザー選択
[API POST /select]
    │ Emit clip/selected event
    ▼
[Inngest Worker]
    │ 3. render-clip → clip.mp4 (caption付き)
    │
    ▼
[ジョブ完了]
    │
    ▼
[Frontend] プレビュー & ダウンロード
```

### データモデル（ファイルベース）

```ts
// jobs/{jobId}/job.json
{
  "id": string,
  "status": "pending" | "transcribing" | "proposing" | "awaiting_selection" | "rendering" | "completed" | "failed",
  "progress": number,
  "clipLengthSeconds": number,
  "candidateCount": number,
  "createdAt": string,
  "completedAt": string | null,
  "errorMessage": string | null,
  "selectedClip": {
    "start": number,
    "end": number,
    "candidateId": string
  } | null
}

// jobs/{jobId}/transcript.json
TranscriptChunk[]

// jobs/{jobId}/candidates.json
ClipCandidate[]
```

```ts
type ClipCandidate = {
  id: string;
  start: number; // 秒
  end: number;   // 秒
  duration: number;
  headline: string;
  reason: string;
  confidence: number; // 0-1
  previewTimestamp: number; // フレームキャプチャ位置
};
```

### 画面構成

1. **トップ (`/`)**
   - アップロードドロップゾーン
   - 尺入力フォーム（プリセットボタン + 数値入力）
   - 進捗カード（ポーリングで更新）

2. **ジョブ詳細 (`/jobs/[jobId]`)**
   - ステータスタイムライン（transcribing → proposing → awaiting selection → rendering → completed）
   - 候補カード（headline / reason / duration / サムネ）
   - タイムライン微調整モーダル
   - 選択済みのプレビュー + ダウンロード

3. **履歴 (`/history`)**
   - 過去ジョブ一覧（ステータス/尺/作成日時/最終結果）

### 候補生成ロジック（LLMプロンプト要件）

- WhisperのTranscriptChunkを `HH:MM:SS` 付きテキストに整形し、希望尺を渡す
- 応答は JSON のみ（LLM出力をパース）
- 候補数は3件（MVP）。閾値以下は results を空配列にしてUIで「見つかりませんでした」を表示
- 各候補の `reason` は短い日本語文章、`headline` はフックになるコピー

### テロップ生成

1. transcript.json から `start/end` にかかるチャンクを抽出
2. 1秒未満のギャップをマージ
3. SRTに変換（200文字以上の場合はラインブレイク）
4. `ffmpeg -vf subtitles` equivalent で焼き込み

### 制約・前提

- 現時点では同時に1本だけの書き出し（複数尺や複数選択は将来対応）
- Whisper/Claude APIキーはRailwayの環境変数で管理
- ブラウザからの直接アップロード → API Route → temporary file へのストリーム保存（既存実装を踏襲）

## Decision Log

### 2026-04-16: V2ショートクリップ方針
- 背景: 顧客から「短尺の切り抜き提案&選択型」の要望
- 決定: 既存リポジトリをベースにアーキテクチャを再設計し、ショートクリップ特化フローへ転換
- 理由: Whisper/Claude/FFmpeg/ストレージなどコア部品を流用でき、別プロダクト化による重複コストを避けられる

### 2026-04-16: UIステップの分離
- 背景: AI提案後にユーザーが選択する「人間の介在ポイント」が必須
- 決定: ステータス `awaiting_selection` を導入し、候補提示と書き出しを分ける
- 理由: インタラクティブUXを成立させつつ、バックエンドの責務（候補生成 vs レンダリング）を明確化できる
