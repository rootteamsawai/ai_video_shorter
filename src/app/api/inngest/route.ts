import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  prepareShortClip,
  renderShortClip,
} from "@/inngest/functions/process-video";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [prepareShortClip, renderShortClip],
});
