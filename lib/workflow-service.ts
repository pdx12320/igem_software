/** Same-origin transport for an administrator-configured model service. */
export interface WorkflowServiceEnv {
  WORKFLOW_MODEL_URL?: string;
  WORKFLOW_MODEL_TOKEN?: string;
}

export interface WorkflowHealth {
  available: boolean;
  reason?: string;
  models: { esm2: boolean; lamar: boolean };
}

interface GatewayOptions {
  fetch?: typeof fetch;
  healthTimeoutMs?: number;
  requestTimeoutMs?: number;
  jsonLimitBytes?: number;
  multipartLimitBytes?: number;
}

const PREFIX = "/api/workflow";
const JSON_LIMIT = 2 * 1024 * 1024;
// The upstream service must cap the FASTA part at 100 MiB; this envelope also
// allows 64 KiB for metadata, field headers, and multipart boundaries.
const MULTIPART_LIMIT = 100 * 1024 * 1024 + 64 * 1024;
const HEALTH_LIMIT = 64 * 1024;

class BodyTooLarge extends Error {}
class RequestTimedOut extends Error {}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function unavailable(reason: string): WorkflowHealth {
  return { available: false, reason, models: { esm2: false, lamar: false } };
}

function failure(status: number, message: string, health = false): Response {
  return jsonResponse(health ? unavailable(message) : { error: message }, status);
}

function serviceBase(value: string): URL | null {
  try {
    const base = new URL(value);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
    base.pathname = base.pathname.replace(/\/+$/, "") + "/";
    return base;
  } catch {
    return null;
  }
}

async function readBounded(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new BodyTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function cappedStream(
  body: ReadableStream<Uint8Array>,
  limit: number,
  overflow: () => void,
): { stream: ReadableStream<Uint8Array>; completed: Promise<void> } {
  const reader = body.getReader();
  let size = 0;
  let finish!: () => void;
  let fail!: (reason: unknown) => void;
  const completed = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  // A stream can fail while fetch is still waiting for upstream headers.
  void completed.catch(() => {});
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          reader.releaseLock();
          finish();
          return;
        }
        size += value.byteLength;
        if (size > limit) {
          overflow();
          void reader.cancel().catch(() => {});
          const error = new BodyTooLarge();
          fail(error);
          controller.error(error);
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        fail(error);
        controller.error(error);
      }
    },
    cancel(reason) {
      fail(reason ?? new Error("Upload interrupted"));
      return reader.cancel(reason);
    },
  });
  return { stream, completed };
}

function normalizeHealth(value: unknown): WorkflowHealth | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const health = value as Record<string, unknown>;
  if (typeof health.available !== "boolean" || !health.models || typeof health.models !== "object" || Array.isArray(health.models)) return null;
  const models = health.models as Record<string, unknown>;
  if (typeof models.esm2 !== "boolean" || typeof models.lamar !== "boolean") return null;
  if (health.reason !== undefined && (typeof health.reason !== "string" || health.reason.length > 500)) return null;
  return {
    available: health.available,
    ...(typeof health.reason === "string" ? { reason: health.reason } : {}),
    models: { esm2: models.esm2, lamar: models.lamar },
  };
}

/** Returns null for unrelated paths so the existing application router retains ownership. */
export async function handleWorkflowRequest(
  request: Request,
  env: WorkflowServiceEnv,
  options: GatewayOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + "/")) return null;
  const path = url.pathname.slice(PREFIX.length);
  const health = path === "/health";
  const ranking = path === "/rank";
  const createJob = path === "/jobs";
  const readJob = /^\/jobs\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}(?:\/result)?$/.test(path);
  if (!health && !ranking && !createJob && !readJob) return failure(404, "Unknown workflow endpoint.");
  if (url.search) return failure(400, "Workflow query parameters are not supported.", health);
  const method = ranking || createJob ? "POST" : "GET";
  if (request.method !== method) {
    const response = failure(405, "Method not allowed.", health);
    response.headers.set("Allow", method);
    return response;
  }
  if (method === "POST" && request.headers.get("Origin") !== url.origin) {
    return failure(403, "A same-origin request is required.");
  }
  if (!env.WORKFLOW_MODEL_URL) {
    return failure(health ? 200 : 503, "Model service is not configured.", health);
  }
  const base = serviceBase(env.WORKFLOW_MODEL_URL);
  if (!base) return failure(health ? 200 : 503, "Model service configuration is invalid.", health);

  const controller = new AbortController();
  const deadline = health ? (options.healthTimeoutMs ?? 15_000) : (options.requestTimeoutMs ?? 30_000);
  let timedOut = false;
  let overflowed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => controller.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  if (request.signal.aborted) controller.abort();

  const operation = async (): Promise<Response> => {
    let uploadCompleted: Promise<void> | undefined;
    const headers = new Headers({ Accept: "application/json" });
    if (env.WORKFLOW_MODEL_TOKEN) headers.set("Authorization", `Bearer ${env.WORKFLOW_MODEL_TOKEN}`);
    const init: RequestInit & { duplex?: "half" } = {
      method, headers, redirect: "error", signal: controller.signal,
    };
    if (method === "POST") {
      const contentType = request.headers.get("Content-Type") ?? "";
      const validType = ranking
        ? /^application\/json(?:\s*;|$)/i.test(contentType)
        : /^multipart\/form-data\s*;/i.test(contentType) && /(?:^|;)\s*boundary=(?:"[^"\r\n]{1,70}"|[^;\s]{1,70})(?:\s*;|\s*$)/i.test(contentType);
      if (!validType) return failure(415, ranking ? "A JSON request is required." : "A multipart FASTA upload is required.");
      const limit = ranking ? (options.jsonLimitBytes ?? JSON_LIMIT) : (options.multipartLimitBytes ?? MULTIPART_LIMIT);
      const contentLength = request.headers.get("Content-Length");
      if (contentLength !== null && !/^\d+$/.test(contentLength)) return failure(400, "Invalid request length.");
      if (contentLength !== null && Number(contentLength) > limit) return failure(413, "Request body exceeds the upload limit.");
      if (!request.body) return failure(400, "A request body is required.");
      if (ranking) {
        const bytes = await readBounded(request.body, limit);
        if (controller.signal.aborted) throw new Error("Request aborted");
        let payload: unknown;
        let json: string;
        try {
          json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          payload = JSON.parse(json);
        } catch {
          return failure(400, "Invalid JSON request.");
        }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return failure(400, "A JSON object is required.");
        headers.set("Content-Type", "application/json");
        init.body = json;
      } else {
        headers.set("Content-Type", contentType);
        const upload = cappedStream(request.body, limit, () => {
          overflowed = true;
          controller.abort();
        });
        init.body = upload.stream;
        uploadCompleted = upload.completed;
        init.duplex = "half";
      }
    }
    const upstream = await (options.fetch ?? fetch)(new URL(path.slice(1), base), init);
    if (overflowed) throw new BodyTooLarge();
    if (!upstream.ok) {
      void upstream.body?.cancel().catch(() => {});
      controller.abort();
      return failure(upstream.status, health ? "Model service health check failed." : "Model service request failed.", health);
    }
    // An upstream early acknowledgement cannot bypass the upload byte cap.
    if (uploadCompleted) await uploadCompleted;
    if (!/^application\/json(?:\s*;|$)/i.test(upstream.headers.get("Content-Type") ?? "")) {
      void upstream.body?.cancel().catch(() => {});
      return failure(502, "Model service returned an invalid response.", health);
    }
    if (health) {
      const bytes = await readBounded(upstream.body, HEALTH_LIMIT);
      let data: unknown;
      try {
        data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch {
        return failure(502, "Model service returned invalid health data.", true);
      }
      const normalized = normalizeHealth(data);
      return normalized ? jsonResponse(normalized, upstream.status) : failure(502, "Model service returned invalid health data.", true);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  };

  try {
    return await Promise.race([
      operation(),
      new Promise<Response>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new RequestTimedOut());
        }, deadline);
      }),
    ]);
  } catch (error) {
    if (overflowed || (error instanceof BodyTooLarge && !health)) return failure(413, "Request body exceeds the upload limit.");
    if (timedOut || error instanceof RequestTimedOut) return failure(504, "Model service request timed out.", health);
    return failure(502, "Model service could not be reached.", health);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    request.signal.removeEventListener("abort", onAbort);
  }
}
