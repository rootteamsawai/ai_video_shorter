# ダイジェスト記事生成機能 - 実装説明

## 概要

動画処理ジョブの完了時に、ダイジェスト動画に加えてMarkdown形式の記事を生成する機能。セグメントごとにスクリーンショットと引用テキストを含む記事を作成し、ZIP形式でダウンロードできる。

## 実装ファイル

### 1. 型定義 (`src/types/index.ts`)

`Job` 型に `articlePath?: string` プロパティが追加されている。記事ファイルの保存パスを保持する。

### 2. ストレージ関数 (`src/lib/storage.ts`)

以下の3関数が追加されている。

- `getScreenshotsDir(jobId)`: ジョブディレクトリ配下の `screenshots` ディレクトリパスを返す
- `getScreenshotPath(jobId, index)`: `screenshots/segment_{index}.jpg` のパスを返す
- `getArticlePath(jobId)`: `article.md` のパスを返す

### 3. FFmpeg スクリーンショット抽出 (`src/lib/ffmpeg.ts`)

以下の2関数が追加されている。

- `extractScreenshot(videoPath, outputPath, timestampSeconds)`: 指定秒数位置のフレームを JPEG で抽出する。`-frames:v 1` で1フレームのみ、`-q:v 2` で高品質設定。
- `extractScreenshotsForSegments(videoPath, jobId, segments)`: セグメント配列をループし、各セグメントの開始時刻でスクリーンショットを抽出する。`getScreenshotsDir` でディレクトリを作成し、`extractScreenshot` を呼び出す。

### 4. 記事生成ロジック (`src/lib/article.ts`)

`generateArticle(segments)` 関数を定義。セグメント配列を受け取り、以下の形式でMarkdownを生成する。

```markdown
# ダイジェスト

## 1. {reason}

![スクリーンショット](screenshots/segment_0.jpg)

> {quote}

---

## 2. {reason}
...
```

各セグメントについて:
- 見出し: 番号とセグメントの `reason`
- 画像: 相対パスで `screenshots/segment_{index}.jpg`
- 引用: セグメントの `quote`
- 区切り線: 最後以外に挿入

### 5. ジョブ処理フロー (`src/inngest/functions/process-video.ts`)

`generate-digest` ステップ内で以下を実行する。

1. `extractScreenshotsForSegments` でセグメントごとのスクリーンショットを抽出
2. `generateDigest` でダイジェスト動画を生成
3. `generateArticle` でMarkdown記事を生成
4. `fs.writeFile` で記事ファイルを保存
5. `setJobArticlePath` でジョブに記事パスを保存

### 6. ジョブストア (`src/lib/job-store.ts`)

`setJobArticlePath(jobId, articlePath)` 関数が追加されている。ジョブJSONファイルの `articlePath` プロパティを更新する。

### 7. 記事表示コンポーネント (`src/components/article-view.tsx`)

React クライアントコンポーネント。以下の動作をする。

- `useEffect` で `/api/jobs/{jobId}/article` からMarkdownテキストを取得
- `react-markdown` + `remark-gfm` でレンダリング
- カスタムコンポーネントで以下を変換:
  - `img`: `screenshots/` で始まるsrcを `/api/jobs/{jobId}/screenshots/{filename}` に変換
  - `blockquote`: 青枠・青背景のスタイル
  - `h1`, `h2`: カスタムスタイル
  - `hr`: グレーの区切り線
- 「記事をダウンロード (ZIP)」ボタンで `/api/jobs/{jobId}/article/download` へリンク

### 8. ジョブ詳細ページ (`src/app/jobs/[jobId]/page.tsx`)

完了状態のジョブ表示部分に以下が追加されている。

- `activeTab` 状態 (`"video"` | `"article"`) を管理
- タブ切り替えUI: 「動画」「記事」ボタン
- タブコンテンツ: `activeTab === "video"` なら `VideoPreview` + セグメント一覧、`"article"` なら `ArticleView`

## 未実装のAPI

`plan.md` に記載されているが、実装コードが見つからなかった API:

- `GET /api/jobs/[jobId]/article`: 記事Markdown取得API
- `GET /api/jobs/[jobId]/screenshots/[filename]`: スクリーンショット画像取得API
- `GET /api/jobs/[jobId]/article/download`: 記事ZIPダウンロードAPI

これらは `ArticleView` コンポーネントから呼び出されているが、対応するルートファイルが存在しない。

## 依存パッケージ

- `react-markdown`: Markdownレンダリング
- `remark-gfm`: GitHub Flavored Markdown サポート

`archiver` パッケージ（ZIPダウンロード用）は `plan.md` に記載があるが、ダウンロードAPIが未実装のため使用されていない。
