"use client";

import { useState, useCallback, useRef } from "react";

const CLIP_PRESETS = [10, 15, 30];

type Props = {
  onUploadComplete: (jobId: string) => void;
};

export function UploadZone({ onUploadComplete }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clipLengthSeconds, setClipLengthSeconds] = useState(10);
  const [candidateCount, setCandidateCount] = useState(3);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsUploading(true);
      setUploadProgress(0);

      if (!file.type.startsWith("video/") && !file.name.endsWith(".mp4")) {
        setError("mp4形式の動画ファイルをアップロードしてください");
        setIsUploading(false);
        return;
      }

      const maxSize = 500 * 1024 * 1024;
      if (file.size > maxSize) {
        setError("ファイルサイズは500MB以下にしてください");
        setIsUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append("video", file);
      formData.append("clipLengthSeconds", clipLengthSeconds.toString());
      formData.append("candidateCount", candidateCount.toString());

      try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(progress);
          }
        });

        const response = await new Promise<{ jobId: string }>((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              try {
                const errorData = JSON.parse(xhr.responseText);
                reject(new Error(errorData.error || "Upload failed"));
              } catch {
                reject(new Error("Upload failed"));
              }
            }
          };
          xhr.onerror = () => reject(new Error("Network error"));
          xhr.open("POST", "/api/upload");
          xhr.send(formData);
        });

        onUploadComplete(response.jobId);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "アップロードに失敗しました"
        );
      } finally {
        setIsUploading(false);
      }
    },
    [candidateCount, clipLengthSeconds, onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        uploadFile(file);
      }
    },
    [uploadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadFile(file);
      }
    },
    [uploadFile]
  );

  const handleClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  const updateClipLength = (value: number) => {
    if (Number.isFinite(value) && value >= 3 && value <= 60) {
      setClipLengthSeconds(Math.round(value));
    }
  };

  const updateCandidateCount = (value: number) => {
    if (Number.isFinite(value)) {
      setCandidateCount(Math.min(5, Math.max(1, Math.round(value))));
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-4 md:flex-row">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            生成したい尺（秒）
          </p>
          <div className="flex flex-wrap gap-2">
            {CLIP_PRESETS.map((preset) => {
              const isActive = clipLengthSeconds === preset;
              return (
                <button
                  type="button"
                  key={preset}
                  onClick={() => updateClipLength(preset)}
                  className={`px-3 py-1 rounded-full border text-sm transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 text-gray-600 hover:border-blue-400"
                  } ${isUploading ? "opacity-60 pointer-events-none" : ""}`}
                >
                  {preset}s
                </button>
              );
            })}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>カスタム:</span>
              <input
                type="number"
                min={3}
                max={60}
                step={1}
                value={clipLengthSeconds}
                disabled={isUploading}
                onChange={(e) => updateClipLength(Number(e.target.value))}
                className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right"
              />
              <span>s</span>
            </div>
          </div>
        </div>

        <div className="w-full md:w-56">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            候補件数
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={5}
              value={candidateCount}
              disabled={isUploading}
              onChange={(e) => updateCandidateCount(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-8 text-center font-semibold text-gray-800">
              {candidateCount}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            最大5件まで。迷いたいほど候補を出せます。
          </p>
        </div>
      </div>

      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
          ${isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}
          ${isUploading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,.mp4"
          onChange={handleFileSelect}
          className="hidden"
        />

        {isUploading ? (
          <div>
            <div className="text-lg font-medium text-gray-700 mb-4">
              アップロード中...
            </div>
            <div className="w-full max-w-xs mx-auto bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="text-sm text-gray-500 mt-2">{uploadProgress}%</div>
          </div>
        ) : (
          <>
            <div className="text-4xl mb-4">🎬</div>
            <div className="text-lg font-medium text-gray-700">
              動画をドラッグ&ドロップ
            </div>
            <div className="text-sm text-gray-500 mt-2">
              またはクリックしてファイルを選択
            </div>
            <div className="text-xs text-gray-400 mt-4">
              mp4形式 / 最大500MB / 90分まで
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
