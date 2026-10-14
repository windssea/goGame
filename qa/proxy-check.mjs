import { chromium } from "@playwright/test";
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";

await mkdir(".qa", { recursive: true });
const upstreamPort = 5192,
  proxyPort = 5191;
let moveCalls = 0,
  coachCalls = 0,
  capturedTokenSent = false;
const upstream = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body);
  assert.equal(req.url, "/v1/chat/completions");
  assert.equal(req.headers.authorization, "Bearer qa-proxy-token");
  let content = "OK";
  if (request.messages[0].role === "system") {
    const state = JSON.parse(request.messages[1].content);
    if (state.protocol === "go-coach-v1") {
      coachCalls++;
      content = "先检查己方棋块的气和连接。战略方向需要继续验证。";
    } else {
      moveCalls++;
      assert.equal(state.positionHash.length, 64);
      assert.ok(!JSON.stringify(state).includes("qa-proxy-token"));
      content = JSON.stringify({
        protocol: state.protocol,
        requestId: state.requestId,
        positionVersion: state.positionVersion,
        positionHash: state.positionHash,
        actionId: state.allowedActions[0].id,
      });
    }
  }
  capturedTokenSent = true;
  res.writeHead(200, { "Content-Type": "application/json" });
  // Deliberately no CORS headers upstream: the personal proxy supplies them.
  res.end(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { total_tokens: 64 },
    }),
  );
});
await new Promise((resolve) =>
  upstream.listen(upstreamPort, "127.0.0.1", resolve),
);
const proxy = spawn(
  process.execPath,
  ["scripts/local-ai-proxy.mjs", `http://127.0.0.1:${upstreamPort}/v1`],
  {
    env: { ...process.env, GO_PROXY_PORT: String(proxyPort) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
await new Promise((resolve, reject) => {
  proxy.stdout.once("data", resolve);
  proxy.once("error", reject);
  proxy.once("exit", (code) => reject(new Error(`Proxy exited ${code}`)));
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const report = [];
try {
  await page.goto("http://127.0.0.1:5186/#/settings", {
    waitUntil: "networkidle",
  });
  await page.getByLabel(/^Base URL/).fill(`http://127.0.0.1:${proxyPort}/v1`);
  await page.getByLabel(/^API Key/).fill("qa-proxy-token");
  await page.getByLabel(/^模型名称/).fill("qa-local-model");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page.getByText(/本次测试通过/).waitFor();
  report.push({
    check: "actual local HTTP proxy connection and browser CORS",
    result: "passed",
  });
  await page
    .getByRole("checkbox", { name: "使用 2D 棋盘", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "落子前确认", exact: true })
    .uncheck();
  await page.getByRole("checkbox", { name: "落子音效", exact: true }).uncheck();
  await page.goto("http://127.0.0.1:5186/#/play", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^我的 AI/ }).click();
  await page
    .getByRole("button", { name: "开始对弈", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "E5 空点", exact: true })
    .first()
    .click();
  await page.waitForFunction(
    () => document.querySelector(".game-stats strong")?.textContent === "2",
  );
  assert.equal(moveCalls, 1);
  assert.equal(capturedTokenSent, true);
  await page.getByText(/64 tokens/).waitFor();
  report.push({
    check:
      "opaque history digest, auth forwarding and real token-usage display",
    result: "passed",
  });
  await page
    .getByRole("textbox", { name: "对当前局面提问", exact: true })
    .fill("我该先看哪里？");
  await page.getByRole("button", { name: "发送局面问题", exact: true }).click();
  await page
    .getByText("先检查己方棋块的气和连接。战略方向需要继续验证。", {
      exact: true,
    })
    .waitFor();
  assert.equal(coachCalls, 1);
  report.push({
    check: "user-triggered current-position AI coaching",
    result: "passed",
  });
  await page.screenshot({
    path: ".qa/ai-coaching.png",
    animations: "disabled",
  });
  const blocked = await fetch(
    `http://127.0.0.1:${proxyPort}/v1/chat/completions`,
    { method: "OPTIONS", headers: { Origin: "https://untrusted.example" } },
  );
  assert.equal(blocked.status, 403);
  report.push({
    check: "proxy rejects unconfigured origins",
    result: "passed",
  });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  proxy.kill();
  await new Promise((resolve) => upstream.close(resolve));
  await writeFile(".qa/proxy-report.json", JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
