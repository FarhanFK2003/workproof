// Shared helpers for the end-to-end suites: production server, headless Chrome
// over the DevTools protocol, and a tiny check() reporter. No dependencies.
//
// Requirements: `npm run build` first; Google Chrome (set CHROME_PATH if it is
// not in the default Windows location); `.env.local` with Supabase settings.
// The suites write synthetic rows titled "[E2E TEST] ..." to the configured
// Supabase project, so they only run with WORKPROOF_E2E_ALLOW_WRITES=1.
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const projectDir = process.cwd();
export const COOKIE = "__Host-workproof_session"; // production cookie name (next start)
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function requireOptIn(suite) {
  if (process.env.WORKPROOF_E2E_ALLOW_WRITES !== "1") {
    console.error(`${suite}: writes synthetic "[E2E TEST]" rows to the Supabase project in .env.local.\n` +
      "Re-run with WORKPROOF_E2E_ALLOW_WRITES=1 to confirm.");
    process.exit(2);
  }
  if (!existsSync(path.join(projectDir, ".next", "BUILD_ID"))) {
    console.error(`${suite}: no production build found. Run \`npm run build\` first.`);
    process.exit(2);
  }
}

let failures = 0;
export function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
export function finish() {
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

/** Generates throwaway owner credentials. They are never printed. */
export function testSecrets() {
  return { pass: randomBytes(18).toString("base64url"), secret: randomBytes(32).toString("base64url") };
}

export function startServer(port, extraEnv) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    cwd: projectDir,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.log = "";
  child.stdout.on("data", (d) => (child.log += d));
  child.stderr.on("data", (d) => (child.log += d));
  return child;
}

export async function waitForServer(base) {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${base}/`)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`server at ${base} did not start`);
}

/** Same algorithm as lib/server/session-token.ts, to craft test cookies. */
export function craftSessionCookie(secret, pass, { iat, exp } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const key = createHmac("sha256", secret)
    .update(`workproof-owner-session:v1:${createHash("sha256").update(pass).digest("hex")}`)
    .digest();
  const payload = Buffer.from(
    JSON.stringify({ v: 1, sid: randomBytes(16).toString("base64url"), iat: iat ?? now, exp: exp ?? now + 600 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}

/** Launches headless Chrome and returns a small CDP client. */
export async function launchBrowser(debugPort = 9334) {
  const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "workproof-e2e-"));
  const chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`, "--window-size=1280,1000", "about:blank",
  ]);
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try {
      target = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((t) => t.type === "page");
    } catch {
      // not up yet
    }
  }
  if (!target) throw new Error("Chrome did not start (set CHROME_PATH)");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  let id = 0;
  const pending = new Map();
  const actionRequests = [];
  const pageErrors = [];
  ws.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === "Network.requestWillBeSent") {
      const h = m.params.request.headers;
      if (h["Next-Action"] ?? h["next-action"]) {
        actionRequests.push({ requestId: m.params.requestId, url: m.params.request.url, headers: h });
      }
    }
    if (m.method === "Runtime.exceptionThrown") {
      pageErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.result?.value;
  async function waitFor(expression, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  }
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  const browser = {
    send,
    evaluate,
    waitFor,
    actionRequests,
    pageErrors,
    go: (url) => send("Page.navigate", { url }),
    /** Waits for an element and gives React time to hydrate before interacting. */
    async hydrated(selector) {
      await waitFor(`!!document.querySelector(${JSON.stringify(selector)}) && document.readyState === "complete"`);
      await sleep(1000);
    },
    setValue: (selector, value) =>
      evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); })()`),
    clickButton: (text) =>
      evaluate(`(() => { const b = [...document.querySelectorAll("button")].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}));
        if (!b) return false; b.click(); return true; })()`),
    bodyText: () => evaluate("document.body.innerText"),
    cookie: async (base, name = COOKIE) =>
      (await send("Network.getCookies", { urls: [base] })).result.cookies.find((c) => c.name === name),
    /** Captures the most recent Server Action request, including its body (Chrome evicts bodies later). */
    async captureLastAction() {
      const request = actionRequests.at(-1);
      if (!request) throw new Error("no Server Action request captured");
      request.body = (await send("Network.getRequestPostData", { requestId: request.requestId })).result?.postData ?? "";
      if (!request.body) throw new Error("could not capture the Server Action body");
      return request;
    },
    close() {
      ws.close();
      chrome.kill();
    },
  };
  return browser;
}

/** Re-sends a captured Server Action request, optionally to another server, cookie, or header set. */
export async function replayAction(captured, { base, origin, cookie, transform = (b) => b, headers: extra = {} } = {}) {
  const headers = { ...captured.headers, Origin: origin ?? base };
  for (const key of Object.keys(headers)) {
    if (["cookie", "content-length", "x-forwarded-for"].includes(key.toLowerCase())) delete headers[key];
  }
  if (cookie) headers.Cookie = `${COOKIE}=${cookie}`;
  Object.assign(headers, extra);
  const url = new URL(captured.url);
  const target = base ? `${base}${url.pathname}${url.search}` : captured.url;
  return (await fetch(target, { method: "POST", headers, body: transform(captured.body) })).text();
}

export const actionStatus = (text) => text.match(/"status":"([a-z_]+)"/)?.[1] ?? "(none)";

/** Files in .next/static whose content includes any of the given strings. */
export function bundleFilesContaining(needles) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(path.join(projectDir, ".next", "static"));
  return files.filter((file) => {
    const text = readFileSync(file, "utf8");
    return needles.some((needle) => needle && text.includes(needle));
  });
}
