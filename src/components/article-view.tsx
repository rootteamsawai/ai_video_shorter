"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  jobId: string;
};

export function ArticleView({ jobId }: Props) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchArticle = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}/article`);
        if (!response.ok) {
          throw new Error("Failed to fetch article");
        }
        const content = await response.text();
        setMarkdown(content);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "記事の取得に失敗しました"
        );
      }
    };

    fetchArticle();
  }, [jobId]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        {error}
      </div>
    );
  }

  if (!markdown) {
    return (
      <div className="animate-pulse text-gray-500 text-center py-8">
        記事を読み込み中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="prose prose-lg max-w-none bg-white rounded-lg shadow p-6">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // スクリーンショット画像のsrcをAPIエンドポイントに変換
            img: ({ src, alt, ...props }) => {
              const srcString = typeof src === "string" ? src : "";
              if (srcString.startsWith("screenshots/")) {
                const filename = srcString.replace("screenshots/", "");
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/jobs/${jobId}/screenshots/${filename}`}
                    alt={alt || "スクリーンショット"}
                    className="rounded-lg shadow-md max-w-full h-auto"
                    {...props}
                  />
                );
              }
              // eslint-disable-next-line @next/next/no-img-element
              return <img src={srcString} alt={alt} {...props} />;
            },
            // 引用のスタイリング
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 italic text-gray-700">
                {children}
              </blockquote>
            ),
            // 見出しのスタイリング
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-bold text-gray-800 mt-6 mb-3">
                {children}
              </h2>
            ),
            // 区切り線
            hr: () => <hr className="border-gray-200 my-6" />,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>

      <div className="flex justify-center">
        <a
          href={`/api/jobs/${jobId}/article/download`}
          download={`article-${jobId}.zip`}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
        >
          記事をダウンロード (ZIP)
        </a>
      </div>
    </div>
  );
}
