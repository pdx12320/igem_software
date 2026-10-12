import test from "node:test";
import assert from "node:assert/strict";
import { handleWorkflowRequest } from "../lib/workflow-service.ts";

const ORIGIN = "https://studio.example";
const ENV = { WORKFLOW_MODEL_URL: "https://models.example/service/", WORKFLOW_MODEL_TOKEN: "server-only-secret" };
const HEALTH = { available: true, models: { esm2: true, lamar: false } };

function request(path, init = {}) {
  return new Request(`${ORIGIN}/api/workflow${path}`, init);
}

function post(path, body = "{}", headers = {}) {
  return request(path, { method: "POST", body, headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers } });
}

function streamRequest(path, chunks, contentType) {
  return request(path, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": contentType },
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    }),
    duplex: "half",
  });
}

test("unconfigured health is explicitly unavailable; unrelated routes stay with Vinext", async () => {
  const response = await handleWorkflowRequest(request("/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { available: false, reason: "Model service is not configured.", models: { esm2: false, lamar: false } });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await handleWorkflowRequest(new Request(`${ORIGIN}/_vinext/image`), {}), null);
  assert.equal(await handleWorkflowRequest(new Request(`${ORIGIN}/api/workflowish`), {}), null);
  assert.equal((await handleWorkflowRequest(post("/rank"), {})).status, 503);
});

test("health validates booleans, preserves model readiness, and removes unknown fields", async () => {
  const response = await handleWorkflowRequest(request("/health"), ENV, {
    fetch: async (url, init) => {
      assert.equal(url.href, "https://models.example/service/health");
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error");
      return Response.json({ ...HEALTH, secret: "must not appear" });
    },
  });
  assert.deepEqual(await response.json(), HEALTH);
  for (const invalid of [{ available: "true", models: HEALTH.models }, { available: true, models: { esm2: true } }, { ...HEALTH, reason: 42 }]) {
    const failed = await handleWorkflowRequest(request("/health"), ENV, { fetch: async () => Response.json(invalid) });
    assert.equal(failed.status, 502);
    assert.equal((await failed.json()).available, false);
  }
});

test("upstream configuration accepts only HTTPS without credentials, query, or fragment", async () => {
  for (const url of ["http://models.example", "https://user:password@models.example", "https://models.example?token=secret", "https://models.example#fragment", "not a URL"]) {
    let called = false;
    const response = await handleWorkflowRequest(post("/rank"), { WORKFLOW_MODEL_URL: url }, { fetch: async () => { called = true; return Response.json({}); } });
    assert.equal(response.status, 503);
    assert.equal(called, false);
    assert.equal((await response.text()).includes(url), false);
  }
});

test("mutations reject cross-origin and missing Origin before any upstream call", async () => {
  let calls = 0;
  const options = { fetch: async () => { calls++; return Response.json({}); } };
  for (const origin of ["https://attacker.example", "null", `${ORIGIN}.attacker.example`]) {
    assert.equal((await handleWorkflowRequest(post("/rank", "{}", { Origin: origin }), ENV, options)).status, 403);
  }
  assert.equal((await handleWorkflowRequest(request("/rank", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }), ENV, options)).status, 403);
  assert.equal(calls, 0);
});

test("rank forwards only server-selected credentials and strips upstream response headers", async () => {
  const response = await handleWorkflowRequest(post("/rank", '{"candidateIds":["puf-1"]}', {
    Authorization: "Bearer browser-secret", Cookie: "session=browser-cookie", "X-Upstream-URL": "https://attacker.example",
  }), ENV, {
    fetch: async (url, init) => {
      assert.equal(url.href, "https://models.example/service/rank");
      assert.equal(init.headers.get("authorization"), "Bearer server-only-secret");
      assert.equal(init.headers.get("cookie"), null);
      assert.equal(init.headers.get("origin"), null);
      assert.equal(init.headers.get("x-upstream-url"), null);
      assert.deepEqual(JSON.parse(init.body), { candidateIds: ["puf-1"] });
      return Response.json({ ranks: [] }, { status: 201, headers: { "Set-Cookie": "upstream=secret", "X-Internal-URL": "private" } });
    },
  });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ranks: [] });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-internal-url"), null);
});

test("an unset server token never forwards the caller Authorization", async () => {
  await handleWorkflowRequest(post("/rank", "{}", { Authorization: "Bearer browser-secret" }), { WORKFLOW_MODEL_URL: ENV.WORKFLOW_MODEL_URL }, {
    fetch: async (_, init) => {
      assert.equal(init.headers.get("authorization"), null);
      return Response.json({});
    },
  });
});

test("invalid paths, encoded traversal, queries, IDs, and methods cannot redirect upstream", async () => {
  let calls = 0;
  const options = { fetch: async () => { calls++; return Response.json({}); } };
  for (const path of ["/jobs/a%2Fb", "/jobs/%252e%252e", "/jobs/%2e%2e/rank", "/jobs/a.b", "/jobs/_bad-id", "/jobs/-bad-id", "/jobs/a/result/extra", "/other", `/jobs/${"a".repeat(129)}`]) {
    const response = await handleWorkflowRequest(request(path), ENV, options);
    assert.ok([404, 405].includes(response.status), path);
  }
  assert.equal((await handleWorkflowRequest(request("/jobs/valid-id?url=https://attacker.example"), ENV, options)).status, 400);
  const method = await handleWorkflowRequest(request("/rank"), ENV, options);
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "POST");
  assert.equal(calls, 0);
});

test("job polling and result paths map only to the configured service", async () => {
  for (const suffix of ["", "/result"]) {
    const response = await handleWorkflowRequest(request(`/jobs/job_123-AbC${suffix}`), ENV, {
      fetch: async (url, init) => {
        assert.equal(url.href, `https://models.example/service/jobs/job_123-AbC${suffix}`);
        assert.equal(init.method, "GET");
        return Response.json({ id: "job_123-AbC" });
      },
    });
    assert.equal(response.status, 200);
  }
});

test("known request lengths over each cap are rejected before forwarding", async () => {
  let calls = 0;
  const options = { fetch: async () => { calls++; return Response.json({}); } };
  assert.equal((await handleWorkflowRequest(post("/rank", "{}", { "Content-Length": String(2 * 1024 * 1024 + 1) }), ENV, options)).status, 413);
  assert.equal((await handleWorkflowRequest(post("/jobs", "x", { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": String(100 * 1024 * 1024 + 64 * 1024 + 1) }), ENV, options)).status, 413);
  assert.equal((await handleWorkflowRequest(post("/rank", "{}", { "Content-Length": "abc" }), ENV, options)).status, 400);
  assert.equal(calls, 0);
});

test("multipart envelope allows 100 MiB plus 64 KiB while retaining bounded memory", async () => {
  const chunk = new Uint8Array(64 * 1024);
  const limit = 100 * 1024 * 1024 + 64 * 1024;
  let remaining = limit;
  const incoming = request("/jobs", {
    method: "POST", duplex: "half",
    headers: { Origin: ORIGIN, "Content-Type": "multipart/form-data; boundary=test", "Content-Length": String(limit) },
    body: new ReadableStream({
      pull(controller) {
        if (!remaining) { controller.close(); return; }
        controller.enqueue(chunk);
        remaining -= chunk.byteLength;
      },
    }),
  });
  const response = await handleWorkflowRequest(incoming, ENV, {
    fetch: async (_, init) => {
      const reader = init.body.getReader();
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
      }
      assert.equal(received, limit);
      return Response.json({ id: "envelope-accepted" }, { status: 202 });
    },
  });
  assert.equal(response.status, 202);
});

test("unknown JSON length is byte-capped before any upstream call", async () => {
  let calls = 0;
  const response = await handleWorkflowRequest(streamRequest("/rank", ['{"x":"', "éééé", '"}'], "application/json"), ENV, {
    jsonLimitBytes: 12,
    fetch: async () => { calls++; return Response.json({}); },
  });
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});

test("multipart upload streams intact without forwarding browser headers", async () => {
  const form = new FormData();
  form.append("metadata", JSON.stringify({ name: "fixture" }));
  form.append("fasta", new File([">fixture\nACGT\n"], "fixture.fasta", { type: "text/plain" }));
  const incoming = request("/jobs", { method: "POST", body: form, headers: { Origin: ORIGIN, Cookie: "private" } });
  const response = await handleWorkflowRequest(incoming, ENV, {
    fetch: async (url, init) => {
      assert.equal(url.href, "https://models.example/service/jobs");
      assert.ok(init.body instanceof ReadableStream);
      assert.equal(init.headers.get("cookie"), null);
      const received = await new Response(init.body, { headers: init.headers }).formData();
      assert.equal(received.get("metadata"), '{"name":"fixture"}');
      assert.equal(await received.get("fasta").text(), ">fixture\nACGT\n");
      return Response.json({ id: "fixture-job" }, { status: 202 });
    },
  });
  assert.equal(response.status, 202);
});

test("unknown multipart length overflow aborts upstream and returns 413", async () => {
  let signal;
  const response = await handleWorkflowRequest(streamRequest("/jobs", ["123456", "789012", "345678"], "multipart/form-data; boundary=test"), ENV, {
    multipartLimitBytes: 10,
    fetch: async (_, init) => {
      signal = init.signal;
      await new Response(init.body).arrayBuffer();
      return Response.json({ id: "must not succeed" });
    },
  });
  assert.equal(response.status, 413);
  assert.equal(signal.aborted, true);
});

test("an upstream acknowledgement cannot bypass an unconsumed upload", async () => {
  const response = await handleWorkflowRequest(streamRequest("/jobs", ["1234", "5678"], "multipart/form-data; boundary=test"), ENV, {
    multipartLimitBytes: 6,
    requestTimeoutMs: 5,
    fetch: async () => Response.json({ id: "too-early" }, { status: 202 }),
  });
  assert.equal(response.status, 504);
});

test("validated JSON retains its original numeric representation", async () => {
  const body = '{"identifier":9007199254740993,"small":1e-1000}';
  const response = await handleWorkflowRequest(post("/rank", body), ENV, {
    fetch: async (_, init) => {
      assert.equal(init.body, body);
      return Response.json({});
    },
  });
  assert.equal(response.status, 200);
});

test("content type and malformed JSON are rejected without forwarding", async () => {
  let calls = 0;
  const options = { fetch: async () => { calls++; return Response.json({}); } };
  for (const body of ["{", "[]", "null"]) assert.equal((await handleWorkflowRequest(post("/rank", body), ENV, options)).status, 400);
  assert.equal((await handleWorkflowRequest(post("/rank", "{}", { "Content-Type": "text/plain" }), ENV, options)).status, 415);
  assert.equal((await handleWorkflowRequest(post("/jobs", "{}", { "Content-Type": "multipart/form-data" }), ENV, options)).status, 415);
  assert.equal(calls, 0);
});

test("upstream failures preserve error status without leaking bodies or retrying POST", async () => {
  let calls = 0;
  const response = await handleWorkflowRequest(post("/rank"), ENV, {
    fetch: async () => { calls++; return new Response("https://models.example server-only-secret", { status: 429 }); },
  });
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "Model service request failed." });
  assert.equal(calls, 1);
  const network = await handleWorkflowRequest(request("/health"), ENV, { fetch: async () => { throw new Error("https://models.example server-only-secret"); } });
  assert.equal(network.status, 502);
  assert.deepEqual(await network.json(), { available: false, reason: "Model service could not be reached.", models: { esm2: false, lamar: false } });
});

test("health and normal request timeouts abort a single upstream request", async () => {
  for (const isHealth of [true, false]) {
    let calls = 0;
    let signal;
    const response = await handleWorkflowRequest(isHealth ? request("/health") : post("/rank"), ENV, {
      healthTimeoutMs: 5, requestTimeoutMs: 5,
      fetch: async (_, init) => {
        calls++;
        signal = init.signal;
        return new Promise(() => {});
      },
    });
    assert.equal(response.status, 504);
    assert.equal(signal.aborted, true);
    assert.equal(calls, 1);
    const message = await response.text();
    assert.equal(message.includes("server-only-secret"), false);
    assert.equal(message.includes("models.example"), false);
  }
});

test("non-JSON and malformed health responses never imply readiness", async () => {
  for (const upstream of [new Response("<html>failure</html>"), new Response("{", { headers: { "Content-Type": "application/json" } }), Response.json({ available: true })]) {
    const response = await handleWorkflowRequest(request("/health"), ENV, { fetch: async () => upstream });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).available, false);
  }
});
