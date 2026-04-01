# ダイジェスト記事生成機能 - 実装プラン

## ファイル構成

```
src/
  lib/
    ffmpeg.ts                 # 変更: extractScreenshot 関数を追加
    storage.ts                # 変更: スクリーンショット/記事パス取得関数を追加
    article.ts                # 新規: 記事生成ロジック
  types/
    index.ts                  # 変更: Job 型に articlePath を追加
  inngest/
    functions/
      process-video.ts        # 変更: generate-digest ステップに記事生成処理を追加
  app/
    api/
      jobs/
        [jobId]/
          article/
            route.ts          # 新規: 記事Markdown取得API
            download/
              route.ts        # 新規: 記事ZIPダウンロードAPI
          screenshots/
            [filename]/
              route.ts        # 新規: スクリーンショット画像取得API
    jobs/
      [jobId]/
        page.tsx              # 変更: 記事タブを追加
  components/
    article-view.tsx          # 新規: 記事表示コンポーネント
```

## 実装順序

### Step 1: 型定義の更新

**対象ファイル**: `src/types/index.ts`

**やること**:
- `Job` 型に `articlePath?: string` を追加

### Step 2: ストレージ関数の追加

**対象ファイル**: `src/lib/storage.ts`

**やること**:
- `getScreenshotsDir(jobId)`: スクリーンショットディレクトリパスを返す
- `getScreenshotPath(jobId, index)`: 個別スクリーンショットパスを返す
- `getArticlePath(jobId)`: 記事ファイルパスを返す

### Step 3: FFmpeg スクリーンショット抽出関数の追加

**対象ファイル**: `src/lib/ffmpeg.ts`

**やること**:
- `extractScreenshot(videoPath, outputPath, timestampSeconds)`: 指定時刻のフレームをJPEGで抽出

### Step 4: 記事生成ロジックの実装

**対象ファイル**: `src/lib/article.ts` (新規)

**やること**:
- `generateArticle(segments, screenshotRelativePaths)`: Segment配列からMarkdown記事を生成して返す

### Step 5: ジョブ処理フローの更新

**対象ファイル**: `src/inngest/functions/process-video.ts`

**やること**:
- generate-digest ステップ内で:
  1. 各セグメントの開始時点でスクリーンショットを抽出
  2. Markdown記事を生成
  3. 記事ファイルを保存
  4. `articlePath` を Job に保存

### Step 6: 記事取得APIの実装

**対象ファイル**: `src/app/api/jobs/[jobId]/article/route.ts` (新規)

**やること**:
- GET: 記事Markdownをテキストで返す
- Content-Type: `text/markdown; charset=utf-8`

### Step 7: スクリーンショット取得APIの実装

**対象ファイル**: `src/app/api/jobs/[jobId]/screenshots/[filename]/route.ts` (新規)

**やること**:
- GET: スクリーンショット画像を返す
- Content-Type: `image/jpeg`
- ファイル名バリデーション（`segment_N.jpg` 形式のみ許可）

### Step 8: 記事ZIPダウンロードAPIの実装

**対象ファイル**: `src/app/api/jobs/[jobId]/article/download/route.ts` (新規)

**やること**:
- GET: 記事 + スクリーンショットをZIPで返す
- Content-Type: `application/zip`
- Content-Disposition: `attachment; filename="article-{jobId}.zip"`
- ZIP構成:
  ```
  article.md
  screenshots/
    segment_0.jpg
    segment_1.jpg
    ...
  ```

### Step 9: 記事表示コンポーネントの実装

**対象ファイル**: `src/components/article-view.tsx` (新規)

**やること**:
- Markdownをレンダリング
- スクリーンショット画像は `/api/jobs/{jobId}/screenshots/{filename}` から取得
- 「記事をダウンロード」ボタン

### Step 10: ジョブ詳細画面の更新

**対象ファイル**: `src/app/jobs/[jobId]/page.tsx`

**やること**:
- 完了時に「動画」「記事」のタブ切り替えUIを追加
- ArticleView コンポーネントを配置

## 依存パッケージ

- `archiver`: ZIPファイル生成用（既存でなければ追加）
- Markdownレンダリング用ライブラリ: `react-markdown` + `remark-gfm`（既存でなければ追加）

## 備考

- スクリーンショット抽出は再エンコードなしで高速に行う（`-ss` オプションで seek してから `-frames:v 1` で1フレーム抽出）
- 記事パスの相対参照（`screenshots/segment_0.jpg`）はMarkdown内でそのまま使用し、表示時にAPI経由で画像を取得する形に変換
