import { promises as fs } from "fs";
import path from "path";
import type { Job, JobStatus, Segment } from "@/types";
import { STORAGE_PATH, validateJobId } from "./storage";

/**
 * ジョブ情報ファイルのパスを取得する
 * @throws Error jobId が無効な形式の場合
 */
function getJobFilePath(jobId: string): string {
  validateJobId(jobId);
  return path.join(STORAGE_PATH, "jobs", jobId, "job.json");
}

/**
 * 新しいジョブを作成する
 */
export async function createJob(jobId: string): Promise<Job> {
  const job: Job = {
    id: jobId,
    status: "pending",
    progress: 0,
    createdAt: new Date().toISOString(),
  };

  const filePath = getJobFilePath(jobId);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(job, null, 2));

  return job;
}

/**
 * ジョブを取得する
 */
export async function getJob(jobId: string): Promise<Job | null> {
  const filePath = getJobFilePath(jobId);

  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as Job;
  } catch {
    return null;
  }
}

/**
 * ジョブのステータスと進捗を更新する
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  progress: number
): Promise<Job | null> {
  const job = await getJob(jobId);
  if (!job) {
    return null;
  }

  job.status = status;
  job.progress = progress;

  if (status === "completed" || status === "failed") {
    job.completedAt = new Date().toISOString();
  }

  const filePath = getJobFilePath(jobId);
  await fs.writeFile(filePath, JSON.stringify(job, null, 2));

  return job;
}

/**
 * ジョブをエラー状態に更新する
 */
export async function setJobError(
  jobId: string,
  errorMessage: string
): Promise<Job | null> {
  const job = await getJob(jobId);
  if (!job) {
    return null;
  }

  job.status = "failed";
  job.errorMessage = errorMessage;
  job.completedAt = new Date().toISOString();

  const filePath = getJobFilePath(jobId);
  await fs.writeFile(filePath, JSON.stringify(job, null, 2));

  return job;
}

/**
 * ジョブにセグメント情報を保存する
 */
export async function setJobSegments(
  jobId: string,
  segments: Segment[]
): Promise<Job | null> {
  const job = await getJob(jobId);
  if (!job) {
    return null;
  }

  job.segments = segments;

  const filePath = getJobFilePath(jobId);
  await fs.writeFile(filePath, JSON.stringify(job, null, 2));

  return job;
}

/**
 * ジョブを削除する
 */
export async function deleteJob(jobId: string): Promise<void> {
  const dir = path.dirname(getJobFilePath(jobId));
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ディレクトリが存在しない場合は無視
  }
}

/**
 * 全ジョブを取得する（作成日時の降順）
 */
export async function getAllJobs(): Promise<Job[]> {
  const jobsDir = path.join(STORAGE_PATH, "jobs");

  try {
    const entries = await fs.readdir(jobsDir, { withFileTypes: true });
    const jobs: Job[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const jobFilePath = path.join(jobsDir, entry.name, "job.json");
        try {
          const data = await fs.readFile(jobFilePath, "utf-8");
          jobs.push(JSON.parse(data) as Job);
        } catch (err) {
          // ENOENT（ファイル不在）以外のエラーはログ出力
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            console.error(`Failed to read job file: ${jobFilePath}`, err);
          }
        }
      }
    }

    // 作成日時の降順でソート
    jobs.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return jobs;
  } catch (err) {
    // ENOENT（ディレクトリ不在）以外のエラーはログ出力
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to read jobs directory:", err);
    }
    return [];
  }
}
