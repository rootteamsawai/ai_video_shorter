import { NextResponse } from "next/server";
import { getAllJobs } from "@/lib/job-store";

// TODO: 認証実装時にユーザーごとのジョブフィルタリングを追加
export async function GET() {
  const jobs = await getAllJobs();
  return NextResponse.json(jobs);
}
