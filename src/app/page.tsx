"use client";

import { useRouter } from "next/navigation";
import { UploadZone } from "@/components/upload-zone";

export default function Home() {
  const router = useRouter();

  const handleUploadComplete = (jobId: string) => {
    router.push(`/jobs/${jobId}`);
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.25em] text-blue-500 font-semibold">
          AI SHORT CUTTER
        </p>
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          長尺動画からベストな10秒を即提案
        </h2>
        <p className="text-gray-600">
          動画をアップロードして尺を指定すると、AIが文字起こし→ショート候補を提案。
          気に入ったポイントを選べばテロップ付きで書き出します。
        </p>
      </div>

      <UploadZone onUploadComplete={handleUploadComplete} />

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">フロー</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-600">
          <li>mp4動画をアップロードし、生成したい秒数を入力</li>
          <li>AIが全文をトランスクライブし、候補を3件提示</li>
          <li>気に入った候補を選んで微調整 → そのまま書き出し</li>
          <li>テロップ入りのショート動画をダウンロード</li>
        </ol>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm font-semibold text-blue-900">尺プリセット</p>
            <p className="text-sm text-blue-800 mt-1">10秒 / 15秒 / 任意入力</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm font-semibold text-slate-900">AI候補</p>
            <p className="text-sm text-slate-800 mt-1">headline + 理由 + 信頼度</p>
          </div>
          <div className="p-4 bg-emerald-50 rounded-lg">
            <p className="text-sm font-semibold text-emerald-900">テロップ</p>
            <p className="text-sm text-emerald-800 mt-1">Noto Sans JPで自動焼き込み</p>
          </div>
        </div>
      </div>
    </div>
  );
}
