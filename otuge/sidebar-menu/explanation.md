# サイドバーメニュー 実装説明

## 概要

サイドバーナビゲーションとジョブ履歴ページの実装。PC ではサイドバーが常時表示され、モバイルではハンバーガーメニューで開閉する。

## ファイル構成

```
src/
  app/
    layout.tsx           # ルートレイアウト
    history/
      page.tsx           # 履歴ページ
  components/
    sidebar.tsx          # サイドバーコンポーネント
  lib/
    job-store.ts         # ジョブストア（getAllJobs 関数を含む）
  app/api/
    jobs/
      route.ts           # ジョブ一覧 API
```

---

## 各ファイルの説明

### `src/components/sidebar.tsx`

クライアントコンポーネントとして実装されたサイドバー。

**状態管理:**
- `isOpen`: モバイル時のメニュー開閉状態（useState）
- `pathname`: 現在のパス（usePathname）

**メニュー項目:**
- 「ホーム」（`/`）
- 「履歴」（`/history`）

配列 `menuItems` にハードコードされている。

**レイアウト挙動:**
- PC（md 以上）: 左端に幅 240px（`w-60`）で固定表示。`translate-x-0` で常に表示。
- モバイル: デフォルトで `-translate-x-full` により画面外。`isOpen` が true のとき `translate-x-0` でスライドイン。

**モバイル用 UI:**
- 左上にハンバーガーボタン（固定配置、z-index 50）。開閉でアイコンが切り替わる（三本線 / X）。
- メニュー展開時、背景に半透明オーバーレイ（`bg-black/50`）を表示。クリックでメニューを閉じる。

**アクティブ状態:**
- `pathname === item.href` のとき、リンクに `bg-blue-50 text-blue-700 font-medium` を適用。
- それ以外は `text-gray-700 hover:bg-gray-100`。

**ロゴ:**
- サイドバー上部に「Seminar Digest」というテキストリンク（`/` へ遷移）。

---

### `src/app/layout.tsx`

ルートレイアウト。全ページに `Sidebar` コンポーネントを配置する。

**構造:**
```tsx
<body>
  <Sidebar />
  <main className="md:ml-60">
    <div className="max-w-4xl mx-auto px-4 py-8 pt-16 md:pt-8">
      {children}
    </div>
  </main>
</body>
```

**ポイント:**
- `<main>` に `md:ml-60` を指定し、PC ではサイドバー幅分の左マージンを確保。
- モバイルでは `pt-16`（ハンバーガーボタンの高さ分）、PC では `pt-8` の上パディング。
- 最大幅 4xl、中央揃え。

---

### `src/app/history/page.tsx`

クライアントコンポーネントとして実装された履歴ページ。

**状態:**
- `jobs`: Job 配列
- `loading`: ローディング状態
- `error`: エラーメッセージ

**データ取得:**
- `useEffect` で `/api/jobs` を fetch し、結果を `jobs` にセット。
- レスポンスが ok でなければエラーをスロー。

**表示パターン:**

1. **ローディング中**: 「読み込み中...」を中央に表示。
2. **エラー時**: 赤背景のボックスにエラーメッセージを表示。
3. **ジョブがない場合**: 「まだジョブがありません」と「動画をアップロード」リンクを表示。
4. **ジョブがある場合**: リスト形式で各ジョブを表示。

**ジョブ項目の表示内容:**
- ステータスバッジ（`getStatusLabel` / `getStatusColor` で色とラベルを決定）
- 作成日時（`formatDate` で日本語形式に変換）
- ジョブ ID の先頭 8 文字
- エラーメッセージ（存在する場合のみ）

各項目は `/jobs/{id}` へのリンクになっている。

**ヘルパー関数:**
- `getStatusLabel(status)`: ステータスを日本語に変換（例: `completed` → 「完了」）
- `getStatusColor(status)`: ステータスに応じた Tailwind カラークラスを返す
- `formatDate(isoString)`: ISO 日付を「YYYY/MM/DD HH:MM」形式に変換

---

### `src/lib/job-store.ts`（追加部分）

`getAllJobs()` 関数が追加されている。

**処理内容:**
1. `storage/jobs/` ディレクトリ内のエントリを `readdir` で取得
2. ディレクトリのみをフィルタ
3. 各ディレクトリ内の `job.json` を読み込み、Job オブジェクトとしてパース
4. 読み込めなかったディレクトリはスキップ
5. 作成日時（`createdAt`）の降順でソート
6. `jobs` ディレクトリ自体が存在しない場合は空配列を返す

---

### `src/app/api/jobs/route.ts`

`GET /api/jobs` エンドポイント。

**処理内容:**
- `getAllJobs()` を呼び出し、結果を JSON として返す。
- エラーハンドリングは行っていない（`getAllJobs` 内部で空配列を返す設計のため）。
