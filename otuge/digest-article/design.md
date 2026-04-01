# ダイジェスト記事生成機能

## Overview

- ダイジェスト動画生成と同時に、Markdown形式のダイジェスト記事を生成する
- 各パンチラインセグメントのスクリーンショット（開始時点1枚）を記事に含める
- ジョブ詳細画面で記事を表示し、ダウンロードも可能にする

## Related Docs

- `docs/job-processing.md` — 既存のジョブ処理フロー
- `docs/design.md` — 全体設計
- `docs/api.md` — API仕様

## Specification

### 処理フロー

既存の Step 3（動画生成）に処理を追加:

```
Step 3: generate-digest
    │
    ├─► 各セグメントの動画切り出し（既存）
    │
    ├─► 各セグメント開始時点のスクリーンショット抽出（新規）
    │
    ├─► ダイジェスト動画の結合（既存）
    │
    └─► Markdown記事生成（新規）
```

### スクリーンショット抽出

- FFmpegで各セグメントの開始時点のフレームを抽出
- 形式: JPEG
- 保存先: `/jobs/{jobId}/screenshots/segment_{index}.jpg`

### 記事フォーマット

```markdown
# ダイジェスト

## 1. {reason}

![スクリーンショット](screenshots/segment_0.jpg)

> {quote}

---

## 2. {reason}

![スクリーンショット](screenshots/segment_1.jpg)

> {quote}

...
```

### ストレージ構造（追加分）

```
/jobs/{jobId}/
  article.md              # 記事本文
  screenshots/
    segment_0.jpg
    segment_1.jpg
    ...
```

### Job型の変更

```typescript
type Job = {
  // ... 既存フィールド
  articlePath?: string;   // 追加: 記事ファイルパス
};
```

### API変更

#### GET /api/jobs/[jobId]/article

- 記事Markdownをテキストで返す
- スクリーンショット画像のURLは相対パスのまま

#### GET /api/jobs/[jobId]/screenshots/[filename]

- スクリーンショット画像を返す

#### GET /api/jobs/[jobId]/article/download

- 記事 + スクリーンショットをZIPでダウンロード

### 画面変更

#### ジョブ詳細画面 `/jobs/[jobId]`

- 「記事」タブを追加
- Markdownをレンダリングして表示
- スクリーンショットは画像として埋め込み表示
- 「記事をダウンロード」ボタン（ZIP形式）

## スコープ外

- 記事のカスタマイズ（テンプレート変更など）
- サムネイル画像のサイズ調整オプション
