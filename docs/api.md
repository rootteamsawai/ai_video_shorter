# API

## Overview

- 動画アップロードからショートクリップ生成までを支えるREST API
- 認証なし、ポーリング主体。候補提案→ユーザー選択→書き出しという段階的な状態を返す

## Related Docs

- `design.md` — 全体設計
- `job-processing.md` — ジョブ処理フロー

## Specification

### POST /api/upload

動画をアップロードし、新規ジョブを作成する。

#### Request

- Content-Type: `multipart/form-data`
- Body:
  - `video` (File, required): mp4 ファイル
  - `clipLengthSeconds` (number, required): 希望尺（例: 10）
  - `candidateCount` (number, optional, default: 3): AIが提示する候補数

#### Constraints

- mp4 のみ、500MB以下

#### Response (200)

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Error

- 400: 入力不足/不正フォーマット/サイズ超過
- 500: 保存失敗など

---

### GET /api/jobs/[jobId]

ジョブの最新状態を返す。フロントエンドから5秒間隔でポーリングを想定。

#### Response (200)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "awaiting_selection",
  "progress": 70,
  "clipLengthSeconds": 10,
  "candidateCount": 3,
  "createdAt": "2026-04-16T09:05:00.000Z",
  "completedAt": null,
  "errorMessage": null,
  "candidates": [
    {
      "id": "cand_01",
      "start": 123.4,
      "end": 133.8,
      "duration": 10.4,
      "headline": "理想の逆算思考",
      "reason": "視聴者の価値観を揺さぶるフレーズ",
      "confidence": 0.86,
      "previewTimestamp": 128.0
    }
  ],
  "selectedClip": null,
  "downloadUrl": null
}
```

- `candidates`: `status === "awaiting_selection"` のとき配列で返却。それ以前は `null`。
- `selectedClip`: ユーザーが選択済みの場合に `{ start, end, candidateId }`。
- `downloadUrl`: `status === "completed"` のみ署名付きURL文字列（ブラウザから直接DL）。MVPでは `null` で固定し、`/download` を叩く。

#### Status 値

| Status               | 説明                                   |
| -------------------- | -------------------------------------- |
| `pending`            | アップロード完了、ジョブ準備中         |
| `transcribing`       | Whisper実行中                           |
| `proposing`          | Claudeで候補抽出中                      |
| `awaiting_selection` | 候補提示済み、ユーザー選択待ち         |
| `rendering`          | 選択結果を元にFFmpegで書き出し中       |
| `completed`          | 生成完了                               |
| `failed`             | いずれかの工程で失敗                   |

#### Error

- 404: Job not found

---

### POST /api/jobs/[jobId]/select

候補の中から書き出す区間を確定する。確定後に `clip.selected` イベントをEmitし、renderジョブを起動。

#### Request

- Content-Type: `application/json`
- Body:

```json
{
  "candidateId": "cand_01",
  "start": 122.9,
  "end": 133.5
}
```

- `start/end` は秒数（小数対応）。候補から±数秒の微調整を許可。

#### Response (200)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "rendering"
}
```

#### Error

- 400: 既に選択済み/選択可能ステータスでない/尺制約違反
- 404: Job or candidate not found

---

### POST /api/jobs/[jobId]/rerun-candidates (optional)

- 将来向け。MVPでは未実装。`docs/todos.md` に管理。

---

### GET /api/jobs/[jobId]/download

書き出されたショートクリップをmp4として返す。

#### Response (200)

- Headers: `Content-Type: video/mp4`, `Content-Disposition: attachment; filename="clip-{jobId}.mp4"`
- Body: バイナリ

#### Error

- 400: Job not completed yet
- 404: Job / file not found

---

### GET /api/jobs

簡易ジョブ一覧（履歴画面用）。MVPでは最近20件を返却。

#### Response (200)

```json
{
  "jobs": [
    {
      "id": "...",
      "status": "completed",
      "clipLengthSeconds": 10,
      "createdAt": "...",
      "completedAt": "..."
    }
  ]
}
```

---

### エラーレスポンス共通

```json
{
  "error": "..."
}
```
