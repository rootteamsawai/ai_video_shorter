# ジョブ処理フロー

## Overview

- Inngest を使用した非同期ジョブ処理
- 文字起こし → パンチライン抽出 → 動画生成 の3ステップで構成
- 各ステップは Inngest の step.run で分離され、リトライ可能

## Related Docs

- `design.md` — 全体設計
- `api.md` — API仕様

## Specification

### 処理フロー

```
video/uploaded イベント発火
         │
         ▼
   ┌─────────────┐
   │ transcribe  │  Step 1: 文字起こし
   │  (10-40%)   │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │   analyze   │  Step 2: パンチライン抽出
   │  (50-70%)   │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │  generate   │  Step 3: ダイジェスト動画生成
   │  (80-100%)  │
   └─────┬───────┘
         │
         ▼
      完了 or 失敗
```

### Step 1: 文字起こし (transcribe)

**処理内容**

1. 元動画から音声を抽出（MP3, 128kbps）
2. 音声ファイルサイズを確認
3. 25MB以下 → そのまま Whisper API に送信
4. 25MB超 → 10分ごとに分割して順次送信
5. タイムスタンプ付きの文字起こし結果を返却

**入力**

- 元動画ファイル（`/jobs/{jobId}/original.mp4`）

**出力**

```typescript
type TranscriptChunk = {
  start: number;  // 秒数
  end: number;    // 秒数
  text: string;   // 文字起こしテキスト
};

// TranscriptChunk[] を返却
```

**進捗更新**

- 開始時: 10%
- 完了時: 40%

### Step 2: パンチライン抽出 (analyze)

**処理内容**

1. 文字起こし結果をタイムスタンプ付きテキストに変換
2. Claude API に送信し、パンチラインを抽出
3. 抽出結果を Job に保存

**入力**

- Step 1 の TranscriptChunk[]
- 目標時間: 5分

**Claude API 呼び出し**

- モデル: `claude-sonnet-4-20250514`
- max_tokens: 4096

**出力**

```typescript
type Segment = {
  start: string;   // "HH:MM:SS" 形式
  end: string;     // "HH:MM:SS" 形式
  reason: string;  // 選択理由
  quote: string;   // 代表的な発言
};

// Segment[] を返却
```

**進捗更新**

- 開始時: 50%
- 完了時: 70%

### Step 3: ダイジェスト動画生成 (generate-digest)

**処理内容**

1. 各セグメントの時間範囲で動画を切り出し
2. 切り出したクリップを結合
3. ダイジェスト動画として保存

**入力**

- 元動画ファイル
- Step 2 の Segment[]

**FFmpeg 処理**

1. **切り出し**: `-c copy` オプションで高速にセグメントを切り出し
2. **結合**: concat demuxer を使用して結合

**出力**

- ダイジェスト動画（`/jobs/{jobId}/digest.mp4`）

**進捗更新**

- 開始時: 80%
- 完了時: 100%

### エラーハンドリング

- 各 Step でエラーが発生した場合、Job の status を `failed` に更新
- errorMessage にエラー内容を記録
- Inngest の自動リトライは有効（デフォルト設定）

### ストレージ構造

```
/jobs
  /{jobId}
    /original.mp4     # アップロードされた元動画
    /audio.mp3        # 抽出された音声（処理後削除）
    /audio_chunks/    # 分割された音声（処理後削除）
    /clip_0.mp4       # 切り出されたクリップ（処理後削除）
    /clip_1.mp4
    ...
    /digest.mp4       # 最終的なダイジェスト動画
    /job.json         # ジョブ情報
```

### ジョブ状態管理

ジョブ情報は `job.json` にファイルとして保存される。

```typescript
type Job = {
  id: string;
  status: JobStatus;
  progress: number;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  segments?: Segment[];
};
```

状態遷移:

```
pending → transcribing → analyzing → generating → completed
                                                ↘
                        (any step) ────────────→ failed
```
