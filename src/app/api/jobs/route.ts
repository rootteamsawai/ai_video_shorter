import { NextResponse } from "next/server";
import { getAllJobs } from "@/lib/job-store";

export async function GET() {
  const jobs = await getAllJobs();
  return NextResponse.json({ jobs });
}
