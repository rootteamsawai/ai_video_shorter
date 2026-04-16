import { NextRequest } from "next/server";
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  prepareShortClip,
  renderShortClip,
} from "@/inngest/functions/process-video";

const handler = serve({
  client: inngest,
  functions: [prepareShortClip, renderShortClip],
});

type Method = keyof typeof handler;

type HandlerFn = typeof handler.POST;

type RouteContext = Parameters<HandlerFn>[1];

async function withLogging(
  method: Method,
  request: NextRequest,
  context: RouteContext
): Promise<Response> {
  const target = handler[method] as HandlerFn | undefined;
  if (!target) {
    return new Response("Not found", { status: 404 });
  }

  let bodyPreview: string | null = null;

  if (request.method !== "GET" && request.body !== null) {
    try {
      const clone = request.clone();
      bodyPreview = await clone.text();
    } catch (cloneError) {
      console.error(`[inngest:${method}] failed to clone request body`, cloneError);
    }
  }

  console.log(`[inngest:${method}] incoming`, {
    url: request.url,
    method: request.method,
    contentLength: request.headers.get("content-length"),
    contentType: request.headers.get("content-type"),
    bodyPreview,
  });

  try {
    return await target(request, context);
  } catch (error) {
    console.error(`[inngest:${method}] handler error`, error);
    throw error;
  }
}

export function GET(request: NextRequest, context: RouteContext) {
  return withLogging("GET", request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return withLogging("POST", request, context);
}

export function PUT(request: NextRequest, context: RouteContext) {
  return withLogging("PUT", request, context);
}
