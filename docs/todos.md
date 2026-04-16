# TODOs

- `/api/jobs/{jobId}/rerun-candidates` エンドポイント実装（既存候補が気に入らない場合の再提案）
- 複数尺（例: 10秒と15秒を同時指定）への拡張。データモデルとUXの影響調査
- 候補カード用の自動サムネイル/波形画像生成（FFmpeg + waveformライブラリ）
- SSEまたはWebSocketによるステータスpush通知（ポーリング卒業）
- `render-clip` 失敗時のリトライ/再選択フロー整備（UI + API）
