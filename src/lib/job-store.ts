import { promises as fs } from "fs";
import path from "path";
import type { ClipCandidate, Job, JobStatus, SelectedClip } from "@/types";
import { STORAGE_PATH, validateJobId } from "./storage";

function getJobFilePath(jobId: string): string {
  validateJobId(jobId);
  return path.join(STORAGE_PATH, "jobs", jobId, "job.json");
}

async function writeJob(job: Job): Promise<void> {
  const filePath = getJobFilePath(job.id);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(job, null, 2));
}

export type CreateJobOptions = {
  clipLengthSeconds: number;
  candidateCount: number;
};

export async function createJob(
  jobId: string,
  options: CreateJobOptions
): Promise<Job> {
  const job: Job = {
    id: jobId,
    status: "pending",
    progress: 0,
    createdAt: new Date().toISOString(),
    clipLengthSeconds: options.clipLengthSeconds,
    candidateCount: options.candidateCount,
    candidates: null,
    selectedClip: null,
  };

  await writeJob(job);
  return job;
}

export async function getJob(jobId: string): Promise<Job | null> {
  const filePath = getJobFilePath(jobId);

  try {
    const data = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(data) as Job;
    if (typeof parsed.clipLengthSeconds !== "number") {
      parsed.clipLengthSeconds = 10;
    }
    if (typeof parsed.candidateCount !== "number") {
      parsed.candidateCount = 3;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  progress: number
): Promise<Job | null> {
  const job = await getJob(jobId);
  if (!job) return null;

  job.status = status;
  job.progress = progress;

  if (status === "completed" || status === "failed") {
    job.completedAt = new Date().toISOString();
  }

  await writeJob(job);
  return job;
}

export async function setJobError(
  jobId: string,
  errorMessage: string
): Promise<Job | null> {
  const job = await getJob(jobId);
  if (!job) return null;

  job.status = "failed";
  job.errorMessage = errorMessage;
  job.completedAt = new Date().toISOString();

  await writeJob(job);
  return job;
}

export async function setJobCandidates(
  jobId: string,
  candidates: ClipCandidate[]
): Promise<Job | null> {
  const job = await getJob(jobId);
  if (!job) return null;

  job.candidates = candidates;
  await writeJob(job);
  return job;
}

export async function setJobSelectedClip(
  jobId: string,
  selectedClip: SelectedClip
): Promise<Job | null> {
  const job = await getJob(jobId);
  if (!job) return null;

  job.selectedClip = selectedClip;
  await writeJob(job);
  return job;
}

export async function deleteJob(jobId: string): Promise<void> {
  const dir = path.dirname(getJobFilePath(jobId));
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export async function getAllJobs(): Promise<Job[]> {
  const jobsDir = path.join(STORAGE_PATH, "jobs");

  try {
    const entries = await fs.readdir(jobsDir, { withFileTypes: true });
    const jobs: Job[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const jobFilePath = path.join(jobsDir, entry.name, "job.json");
      try {
        const data = await fs.readFile(jobFilePath, "utf-8");
        const parsed = JSON.parse(data) as Job;
        jobs.push(parsed);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`Failed to read job file: ${jobFilePath}`, err);
        }
      }
    }

    jobs.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return jobs;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to read jobs directory:", err);
    }
    return [];
  }
}
