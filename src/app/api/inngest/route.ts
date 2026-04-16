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

type Handler = typeof handler.POST;

function wrap(method?: Handler) {
  if (!method) {
    return undefined;
  }

  return (async (...args: Parameters<Handler>) => {
    try {
      return await method(...args);
    } catch (error) {
      console.error("[inngest] handler error", error);
      throw error;
    }
  }) as Handler;
}

export const GET = wrap(handler.GET);
export const POST = wrap(handler.POST);
export const PUT = wrap(handler.PUT);
