import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "AI Video Shorter",
  description: "AIが長尺動画からショートクリップ候補を提案",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50">
        <Sidebar />
        {/* PC: サイドバー分の余白を確保 */}
        <main className="md:ml-60 min-h-screen">
          <div className="max-w-4xl mx-auto px-4 py-8 pt-16 md:pt-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
