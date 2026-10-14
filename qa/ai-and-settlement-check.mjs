import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir(".qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();
const base = process.env.GO_STUDIO_URL || "http://127.0.0.1:5186";
const report = [],
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let mode = "valid",
  calls = 0,
  pendingRoute = null,
  recordedHeaders = null;
await page.route(
  "https://ai.example.test/v1/chat/completions",
  async (route) => {
    calls++;
    recordedHeaders = route.request().headers();
    const request = route.request().postDataJSON();
    if (request.messages[0].role === "user") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ choices: [{ message: { content: "OK" } }] }),
      });
      return;
    }
    const state = JSON.parse(request.messages[1].content);
    if (mode === "delayed") {
      pendingRoute = { route, state };
      return;
    }
    const content =
      mode === "invalid"
        ? "{ invalid-json"
        : JSON.stringify({
            protocol: state.protocol,
            requestId: state.requestId,
            positionVersion: state.positionVersion,
            positionHash: state.positionHash,
            actionId: state.allowedActions[0].id,
          });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content } }] }),
    });
  },
);
async function newRemoteGame() {
  await page.goto(`${base}/#/play`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^我的 AI/ }).click();
  await page
    .getByRole("button", { name: "开始对弈", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "E5 空点", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "落子 · E5", exact: true }).click();
}
try {
  await page.goto(`${base}/#/settings`, { waitUntil: "networkidle" });
  await page.getByLabel(/^Base URL/).fill("https://ai.example.test/v1");
  await page.getByLabel(/^API Key/).fill("qa-key-do-not-export");
  await page.getByLabel(/^模型名称/).fill("qa-model");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page.getByText(/本次测试通过/).waitFor();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("goGame.ai.v1")),
  );
  assert.equal(stored.apiKey, "qa-key-do-not-export");
  assert.equal(stored.model, "qa-model");
  report.push({
    check: "personal AI settings and minimal connection test",
    result: "passed",
  });
  await page.getByRole("checkbox", { name: /在当前浏览器记住密钥/ }).uncheck();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("goGame.ai.v1")).apiKey,
    ),
    "",
  );
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "使用 2D 棋盘", exact: true })
    .check();
  await page.getByRole("checkbox", { name: "落子前确认", exact: true }).check();
  await page.getByRole("checkbox", { name: "落子音效", exact: true }).uncheck();
  calls = 0;
  await newRemoteGame();
  await page.waitForFunction(
    () => document.querySelector(".game-stats strong")?.textContent === "2",
  );
  assert.equal(calls, 1);
  assert.equal(recordedHeaders.authorization, "Bearer qa-key-do-not-export");
  report.push({
    check: "valid AI selection commits exactly one move",
    result: "passed",
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出棋谱", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(".qa/ai-game.sgf");
  const stream = await download.createReadStream();
  let sgf = "";
  for await (const chunk of stream) sgf += chunk;
  assert.ok(!sgf.includes("qa-key-do-not-export"));
  assert.ok(sgf.includes("个人 AI"));
  report.push({
    check: "SGF contains actual source and no API key",
    result: "passed",
  });
  mode = "invalid";
  calls = 0;
  await newRemoteGame();
  await page.waitForFunction(
    () => document.querySelector(".game-stats strong")?.textContent === "2",
  );
  assert.equal(calls, 2);
  await page.getByText(/本手由本地对手完成/).waitFor();
  report.push({
    check: "malformed AI response retries once then visibly falls back",
    result: "passed",
  });
  mode = "delayed";
  calls = 0;
  await newRemoteGame();
  await page.waitForFunction(
    () => document.querySelector(".game-stats strong")?.textContent === "1",
  );
  for (let i = 0; i < 40 && !pendingRoute; i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(pendingRoute);
  await page.getByRole("button", { name: "撤回上一手", exact: true }).click();
  assert.equal(
    await page.locator(".game-stats strong").first().innerText(),
    "0",
  );
  try {
    const { route, state } = pendingRoute;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                protocol: state.protocol,
                requestId: state.requestId,
                positionVersion: state.positionVersion,
                positionHash: state.positionHash,
                actionId: state.allowedActions[0].id,
              }),
            },
          },
        ],
      }),
    });
  } catch {
    /* Aborted requests can no longer be fulfilled, which is an expected outcome. */
  }
  await page.waitForTimeout(400);
  assert.equal(
    await page.locator(".game-stats strong").first().innerText(),
    "0",
  );
  report.push({
    check: "undo during remote thinking discards stale reply",
    result: "passed",
  });
  await page.reload({ waitUntil: "networkidle" });
  const remembered = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("goGame.ai.v1")),
  );
  assert.equal(remembered.apiKey, "");
  report.push({
    check: "temporary key is not restored after refresh",
    result: "passed",
  });
  // Complete a real pass-based game against the local opponent, without injecting board state.
  await page.goto(`${base}/#/play`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^本地练习对手/ }).click();
  await page
    .getByRole("button", { name: "开始对弈", exact: true })
    .last()
    .click();
  let turns = 0;
  while (
    !(await page.getByText("先确认，再数目。", { exact: true }).count()) &&
    turns < 90
  ) {
    const pass = page.getByRole("button", { name: "停一手", exact: true });
    await pass.waitFor();
    await pass.click();
    turns++;
    await page.waitForFunction(
      () =>
        document.querySelector(".game-panel h2")?.textContent ===
          "先确认，再数目。" ||
        document.querySelector(".turn-status strong")?.textContent ===
          "轮到你了",
      { timeout: 10000 },
    );
  }
  assert.ok(turns < 90, "Local opponent must eventually offer end-of-game");
  await page
    .getByRole("checkbox", {
      name: "我已确认死子与边界，接受此结果",
      exact: true,
    })
    .check();
  await page.screenshot({
    path: ".qa/settlement-desktop.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: /^确认 ·/ }).click();
  await page.getByText("对局已保存", { exact: true }).waitFor();
  report.push({
    check: "real two-pass settlement and persisted score",
    turns,
    result: "passed",
  });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    ".qa/ai-settlement-report.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
