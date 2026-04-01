# API

## Overview

- 動画アップロード、ジョブ状態取得、ダイジェスト動画・記事ダウンロードのエンドポイントを提供
- 認証なし、レート制限なし（MVP）

## Related Docs

- `design.md` — 全体設計
- `job-processing.md` — ジョブ処理フロー

## Specification

### POST /api/upload

動画ファイルをアップロードし、処理ジョブを開始する。

#### Request

- Content-Type: `multipart/form-data`
- Body:
  - `video` (File, required): mp4形式の動画ファイル

#### Constraints

- 最大ファイルサイズ: 500MB
- 対応形式: mp4 のみ

#### Response

**成功 (200)**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**エラー (400)**

```json
{
  "error": "No video file provided"
}
```

```json
{
  "error": "Invalid file format. Only mp4 is supported."
}
```

```json
{
  "error": "File too large. Maximum size is 500MB."
}
```

**エラー (500)**

```json
{
  "error": "Failed to upload video"
}
```

---

### GET /api/jobs/[jobId]

ジョブの状態を取得する。フロントエンドからポーリングで呼び出す。

#### Response

**成功 (200)**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "analyzing",
  "progress": 50,
  "createdAt": "2025-03-24T10:00:00.000Z",
  "completedAt": null,
  "segments": null,
  "errorMessage": null
}
```

| Field        | Type              | Description                                    |
| ------------ | ----------------- | ---------------------------------------------- |
| id           | string            | ジョブID (UUID)                                |
| status       | JobStatus         | 現在のステータス                               |
| progress     | number            | 進捗 (0-100)                                   |
| createdAt    | string (ISO 8601) | ジョブ作成日時                                 |
| completedAt  | string \| null    | 完了日時                                       |
| segments     | Segment[] \| null | 抽出されたセグメント（完了時のみ）             |
| errorMessage | string \| null    | エラーメッセージ（失敗時のみ）                 |

**JobStatus**

| Value        | Description              |
| ------------ | ------------------------ |
| pending      | 処理待ち                 |
| transcribing | 文字起こし中             |
| analyzing    | パンチライン抽出中       |
| generating   | ダイジェスト動画生成中   |
| completed    | 完了                     |
| failed       | 失敗                     |

**Segment**

```json
{
  "start": "00:05:30",
  "end": "00:06:45",
  "reason": "このセミナーの核心となる主張",
  "quote": "「〇〇こそが成功の鍵なんです」"
}
```

**エラー (404)**

```json
{
  "error": "Job not found"
}
```

---

### GET /api/jobs/[jobId]/download

ダイジェスト動画をダウンロードする。

#### Response

**成功 (200)**

- Content-Type: `video/mp4`
- Content-Disposition: `attachment; filename="digest-{jobId}.mp4"`
- Body: 動画ファイルのバイナリストリーム

**エラー (400)**

```json
{
  "error": "Digest video is not ready yet"
}
```

**エラー (404)**

```json
{
  "error": "Job not found"
}
```

```json
{
  "error": "Digest video file not found"
}
```

---

### GET /api/jobs/[jobId]/article

ダイジェスト記事（Markdown形式）を取得する。

#### Response

**成功 (200)**

- Content-Type: `text/markdown; charset=utf-8`
- Body: Markdown形式の記事テキスト

**エラー (400)**

```json
{
  "error": "Article is not ready yet"
}
```

**エラー (404)**

```json
{
  "error": "Job not found"
}
```

```json
{
  "error": "Article file not found"
}
```

---

### GET /api/jobs/[jobId]/screenshots/[filename]

セグメントのスクリーンショット画像を取得する。

#### Parameters

- `filename`: `segment_N.jpg` 形式（N は 0 始まりのインデックス）

#### Response

**成功 (200)**

- Content-Type: `image/jpeg`
- Cache-Control: `public, max-age=31536000, immutable`
- Body: JPEG画像のバイナリ

**エラー (400)**

```json
{
  "error": "Invalid filename"
}
```

**エラー (404)**

```json
{
  "error": "Job not found"
}
```

```json
{
  "error": "Screenshot file not found"
}
```

---

### GET /api/jobs/[jobId]/article/download

ダイジェスト記事とスクリーンショットをZIP形式でダウンロードする。

#### Response

**成功 (200)**

- Content-Type: `application/zip`
- Content-Disposition: `attachment; filename="article-{jobId}.zip"`
- Body: ZIPファイルのバイナリストリーム

ZIP構成:

```
article.md
screenshots/
  segment_0.jpg
  segment_1.jpg
  ...
```

**エラー (400)**

```json
{
  "error": "Article is not ready yet"
}
```

**エラー (404)**

```json
{
  "error": "Job not found"
}
```

```json
{
  "error": "Article file not found"
}
```
