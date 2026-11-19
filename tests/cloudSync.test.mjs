import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const originalGlobals = Object.fromEntries(
  ["window", "document", "navigator", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
);

afterEach(() => {
  for (const [key, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

function harness() {
  const stored = new Map();
  const localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  };
  let interval;
  const window = Object.assign(new EventTarget(), {
    localStorage,
    setInterval: (callback) => { interval = callback; return 1; },
    clearInterval: () => { interval = undefined; },
  });
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const navigator = { onLine: true };
  for (const [key, value] of Object.entries({ window, document, navigator })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  // Compile the project's TypeScript in memory, using its existing dependency.
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const sourceModule = new Module(filename);
    cache.set(filename, sourceModule);
    sourceModule.filename = filename;
    sourceModule.paths = Module._nodeModulePaths(path.dirname(filename));
    const originalRequire = sourceModule.require.bind(sourceModule);
    sourceModule.require = (specifier) => {
      const candidate = specifier.startsWith("@/")
        ? path.join(root, "src", specifier.slice(2))
        : specifier.startsWith(".") ? path.resolve(path.dirname(filename), specifier) : null;
      if (candidate && fs.existsSync(`${candidate}.ts`)) return load(`${candidate}.ts`);
      return originalRequire(specifier);
    };
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    sourceModule._compile(outputText, filename);
    return sourceModule.exports;
  }
  return { load, localStorage, window, document, navigator, tick: () => interval?.() };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function task(title = "A") {
  return {
    id: "test-task", title, status: "not_started", note: "", sourceText: "",
    deadlineDate: null, deadlineTime: null, deadlineAt: null,
  };
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("sync requests bypass caches and reject a static HTML fallback", async () => {
  const { load } = harness();
  const { cloudSyncRequest } = load("src/lib/cloudSyncRequest.ts");
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.cache, "no-store");
    return new Response("<html>Static fallback</html>", { headers: { "Content-Type": "text/html" } });
  };
  await assert.rejects(cloudSyncRequest("/api/tasks"), /Cloudflare Pages Functions/);
  globalThis.fetch = async () => json({ error: "Missing server configuration" }, 503);
  await assert.rejects(cloudSyncRequest("/api/tasks"), /503.*Missing server configuration/);
});

test("Supabase supports secret keys, legacy JWTs, and the old URL variable", async () => {
  const { load } = harness();
  const { getTasks, createJsonResponse } = load("functions/_lib/supabase.ts");
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, headers: init.headers });
    return json([]);
  };
  await getTasks({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" });
  assert.equal(seen[0].headers.get("apikey"), "sb_secret_test");
  assert.equal(seen[0].headers.get("Authorization"), null);
  assert.match(seen[0].url, /^https:\/\/example.supabase.co\/rest\/v1\/tasks/);
  await getTasks({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "eyJ.test.legacy" });
  assert.equal(seen[1].headers.get("Authorization"), "Bearer eyJ.test.legacy");
  assert.match(createJsonResponse([]).headers.get("Cache-Control"), /no-store/);
});

test("failed task deletion survives reload and retries before downloading tasks", async () => {
  const context = harness();
  let client = context.load("src/lib/taskSyncClient.ts");
  globalThis.fetch = async () => json({ error: "Offline" }, 502);
  await assert.rejects(client.deleteCloudTask("deleted-task"), /Offline/);
  const pending = context.localStorage.getItem("agenda_generate_tasks_pending_sync");
  assert.match(pending, /deleted-task/);

  const freshContext = harness();
  freshContext.localStorage.setItem("agenda_generate_tasks_pending_sync", pending);
  client = freshContext.load("src/lib/taskSyncClient.ts");
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push([url, init.method ?? "GET"]);
    return json(init.method === "DELETE" ? { ok: true } : []);
  };
  assert.deepEqual(await client.fetchCloudTasks(), []);
  assert.deepEqual(requests.map((request) => request[1]), ["DELETE", "GET"]);
  assert.equal(client.hasPendingCloudTaskChanges(), false);
});

test("rapid task edits and deletion are delivered in order", async () => {
  const { load } = harness();
  const client = load("src/lib/taskSyncClient.ts");
  let release;
  const firstResponse = new Promise((resolve) => { release = resolve; });
  const seen = [];
  globalThis.fetch = async (_url, init) => {
    seen.push(init.method === "POST" ? JSON.parse(init.body).title : init.method);
    if (seen.length === 1) await firstResponse;
    return json({ ok: true });
  };
  const first = client.upsertCloudTask(task("First edit"));
  const second = client.upsertCloudTask(task("Second edit"));
  const third = client.deleteCloudTask("test-task");
  assert.deepEqual(seen, ["First edit"]);
  release();
  await Promise.all([first, second, third]);
  assert.deepEqual(seen, ["First edit", "Second edit", "DELETE"]);
});

test("failed requirement saves retry before a pull, preserving hidden flags and order", async () => {
  const { load, localStorage } = harness();
  const client = load("src/lib/requirementSyncClient.ts");
  const text = "[[agenda-hidden]]A：Morning\nB：Afternoon";
  localStorage.setItem("agenda_generate_exam_requirements", text);
  globalThis.fetch = async () => json({ error: "Temporary error" }, 502);
  await assert.rejects(client.pushRequirementTextToCloud("exam", text));
  assert.equal(localStorage.getItem("agenda_generate_exam_requirements"), text);
  const seen = [];
  globalThis.fetch = async (_url, init) => {
    seen.push(init.method ?? "GET");
    if (init.method === "POST") assert.equal(JSON.parse(init.body).content, text);
    return json({ type: "exam", content: text, updatedAt: "2026-11-19T08:00:00Z" });
  };
  await client.refreshRequirementFromCloud("exam");
  assert.deepEqual(seen, ["POST", "GET"]);
  assert.equal(localStorage.getItem("agenda_generate_exam_requirements"), text);
});

test("a slow requirement download cannot overwrite an edit saved during the request", async () => {
  const { load, localStorage } = harness();
  const client = load("src/lib/requirementSyncClient.ts");
  let release;
  globalThis.fetch = async (_url, init) => {
    if (init.method === "POST") return json({ type: "exam", content: "A：New", updatedAt: "now" });
    return new Promise((resolve) => {
      release = () => resolve(json({ type: "exam", content: "A：Old", updatedAt: "earlier" }));
    });
  };
  const pull = client.refreshRequirementFromCloud("exam");
  await nextTurn();
  localStorage.setItem("agenda_generate_exam_requirements", "A：New");
  await client.pushRequirementTextToCloud("exam", "A：New");
  release();
  await pull;
  assert.equal(localStorage.getItem("agenda_generate_exam_requirements"), "A：New");
});

test("an empty cloud requirement clears initialized caches without re-uploading deleted content", async () => {
  const { load, localStorage } = harness();
  const client = load("src/lib/requirementSyncClient.ts");
  localStorage.setItem("agenda_generate_exam_requirements", "A：Deleted");
  client.setRequirementCloudInitializedInStorage("exam", true);
  globalThis.fetch = async (_url, init) => {
    assert.notEqual(init.method, "POST");
    return json({ type: "exam", content: "", updatedAt: null });
  };
  await client.refreshRequirementFromCloud("exam");
  assert.equal(localStorage.getItem("agenda_generate_exam_requirements"), "");
});

test("cloud changes update an already-open requirement list through the storage subscription", async () => {
  const { load } = harness();
  const storage = load("src/lib/requirementStorage.ts");
  const client = load("src/lib/requirementSyncClient.ts");
  let observed;
  const unsubscribe = storage.subscribeRequirementText("course", () => {
    observed = storage.loadRequirementText("course");
  });
  globalThis.fetch = async () => json({ type: "course", content: "B：Updated remotely", updatedAt: "now" });
  await client.refreshRequirementFromCloud("course");
  assert.equal(observed, "B：Updated remotely");
  unsubscribe();
});

test("foreground sync checks on focus, reconnection and timer, and cleans up on unmount", async () => {
  const { load, window, document, navigator, tick } = harness();
  const { startCloudSyncLifecycle } = load("src/lib/cloudSyncLifecycle.ts");
  let calls = 0;
  const cleanup = startCloudSyncLifecycle(async () => { calls += 1; }, assert.fail);
  await nextTurn();
  assert.equal(calls, 1);
  window.dispatchEvent(new Event("focus"));
  await nextTurn();
  assert.equal(calls, 2);
  document.visibilityState = "hidden";
  tick();
  await nextTurn();
  assert.equal(calls, 2);
  document.visibilityState = "visible";
  navigator.onLine = false;
  tick();
  await nextTurn();
  assert.equal(calls, 2);
  navigator.onLine = true;
  window.dispatchEvent(new Event("online"));
  await nextTurn();
  assert.equal(calls, 3);
  tick();
  await nextTurn();
  assert.equal(calls, 4);
  cleanup();
  window.dispatchEvent(new Event("focus"));
  await nextTurn();
  assert.equal(calls, 4);
});

test("successful task sync does not hide a failed requirement sync", () => {
  const { load } = harness();
  const status = load("src/lib/cloudSyncStatus.ts");
  status.recordCloudSyncFailure("Requirements API failed", "exam");
  status.recordCloudSyncSuccess("tasks");
  assert.equal(status.readCloudSyncStatus().lastFailure, "Requirements API failed");
  status.recordCloudSyncSuccess("exam");
  assert.equal(status.readCloudSyncStatus().lastFailure, "");
});

test("Next.js API entry forwards the JSON body and server-only environment", async () => {
  const { load } = harness();
  const { createNextApiHandler } = load("src/lib/server/nextApiAdapter.ts");
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_adapter_test";
  try {
    const handler = createNextApiHandler({ POST: async ({ request, env }) => {
      assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, "sb_secret_adapter_test");
      assert.equal(new URL(request.url).pathname, "/api/tasks");
      assert.deepEqual(await request.json(), task());
      return json({ ok: true });
    } });
    const request = Object.assign(Readable.from([JSON.stringify(task())]), {
      url: "/api/tasks", method: "POST", headers: { "content-type": "application/json" },
    });
    const response = {
      headers: new Map(),
      setHeader(name, value) { this.headers.set(name, value); return this; },
      status(code) { this.statusCode = code; return this; },
      send(body) { this.body = JSON.parse(body.toString()); return this; },
    };
    await handler(request, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { ok: true });
    assert.ok(!JSON.stringify(response.body).includes("sb_secret"));
  } finally {
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
