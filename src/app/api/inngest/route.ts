import { NextRequest } from "next/server";
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  prepareShortClip,
  renderShortClip,
} from "@/inngest/functions/process-video";

console.log("[inngest] prepareShortClip type", typeof prepareShortClip);
console.log("[inngest] renderShortClip type", typeof renderShortClip);

try {
  const sampleConfig = { baseUrl: new URL("https://example.com"), appPrefix: inngest.id };
  const prepareFn = prepareShortClip as { getConfig?: (args: unknown) => { id: string }[] };
  const renderFn = renderShortClip as { getConfig?: (args: unknown) => { id: string }[] };
  const prepareIds = prepareFn?.getConfig ? prepareFn.getConfig(sampleConfig).map((cfg) => cfg.id) : [];
  const renderIds = renderFn?.getConfig ? renderFn.getConfig(sampleConfig).map((cfg) => cfg.id) : [];
  console.log("[inngest] function ids", { prepareIds, renderIds });
} catch (configError) {
  console.error("[inngest] failed to read function config", configError);
}

const handler = serve({
  client: inngest,
  functions: [prepareShortClip, renderShortClip],
});

console.log("[inngest] registered functions", Object.keys(handler));

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
    const response = await target(request, context);
    let responsePreview: string | null = null;

    try {
      const responseClone = response.clone();
      responsePreview = await responseClone.text();
    } catch (responseCloneError) {
      console.error(
        `[inngest:${method}] failed to clone response body`,
        responseCloneError
      );
    }

    console.log(`[inngest:${method}] response`, {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      responsePreview,
    });

    return response;
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
