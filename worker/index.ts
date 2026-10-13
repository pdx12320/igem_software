/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleWorkflowRequest, type WorkflowServiceEnv } from "../lib/workflow-service";
import { handleLocalDownload } from "../lib/local-downloads";
import { createLocalReleaseAssetFetcher, handleLocalReleaseUpload, isLocalReleaseReady } from "../lib/local-download-storage";
import localRelease from "../data/local-download-release.json";

interface Env extends WorkflowServiceEnv {
  ASSETS: Fetcher;
  LOCAL_PACKAGES: R2Bucket;
  ORCA_RELEASE_UPLOAD_KEY?: string;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const uploadResponse = await handleLocalReleaseUpload(request, env.LOCAL_PACKAGES, env.ORCA_RELEASE_UPLOAD_KEY);
    if (uploadResponse) return uploadResponse;
    const downloadPath = new URL(request.url).pathname;
    if (Object.values(localRelease.urls).includes(downloadPath) && !await isLocalReleaseReady(env.LOCAL_PACKAGES)) {
      return new Response("The local release is temporarily unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const downloadResponse = await handleLocalDownload(request, createLocalReleaseAssetFetcher(env.LOCAL_PACKAGES));
    if (downloadResponse) return downloadResponse;
    const workflowResponse = await handleWorkflowRequest(request, env);
    if (workflowResponse) return workflowResponse;
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
