import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir(".qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [],
  report = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.GO_STUDIO_URL || "http://127.0.0.1:5186";
try {
  await page.goto(`${base}/#/practice`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /完整对局.*6 道题/ }).click();
  for (const answer of [
    "气、打吃和救棋",
    "分支不覆盖真实主线",
    "需要，实际来源可查看",
    "不必，可以从任何结果复盘",
    "主动结束并保存棋谱",
    "丢弃，不修改当前棋盘",
  ]) {
    await page.getByRole("button", { name: new RegExp(answer) }).click();
    await page.getByRole("button", { name: "确认答案", exact: true }).click();
    await page.getByRole("button", { name: /下一题|完成练习/ }).click();
  }
  await page.getByText(/第八阶段还需要完成一局/).waitFor();
  await page.getByRole("button", { name: "完成独立对局", exact: true }).click();
  assert.equal(
    await page.getByLabel("对局模式", { exact: true }).inputValue(),
    "challenge",
  );
  await page
    .getByRole("button", { name: "开始对弈", exact: true })
    .last()
    .click();
  assert.equal(
    await page.getByRole("button", { name: "悔棋", exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "给我一个思路", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("checkbox", { name: "显示选中棋块的气", exact: true })
      .isDisabled(),
    true,
  );
  const grid = page.getByRole("grid", { name: "围棋棋盘" });
  await grid.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.locator(".game-stats strong").first().innerText(),
    "0",
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.querySelector(".game-stats strong")?.textContent === "2",
  );
  report.push({
    check:
      "stage-eight real-game requirement and independent challenge disables assistance",
    result: "passed",
  });
  report.push({
    check: "keyboard movement never commits until Enter",
    result: "passed",
  });
  await page.getByRole("button", { name: "复盘当前棋局", exact: true }).click();
  await page
    .getByRole("button", { name: "从这里试下一个变化", exact: true })
    .click();
  await page.getByRole("button", { name: "返回对局", exact: true }).click();
  await page.goto(`${base}/#/records`, { waitUntil: "networkidle" });
  await page.getByText(/辅助练习/).waitFor();
  report.push({
    check: "mid-game analysis is recorded as assisted",
    result: "passed",
  });
  await page.goto(`${base}/#/learn`, { waitUntil: "networkidle" });
  assert.ok(
    (await page.locator(".overview-stat").first().innerText()).includes("0"),
  );
  const fallback = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (
        kind === "webgl" ||
        kind === "webgl2" ||
        kind === "experimental-webgl"
      )
        return null;
      return original.call(this, kind, ...args);
    };
  });
  const mobile = await fallback.newPage();
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(base, { waitUntil: "networkidle" });
  await mobile
    .getByText("设备暂不支持 3D，已切换为相同规则的 2D 棋盘。")
    .waitFor();
  await mobile.getByRole("button", { name: "开始学围棋", exact: true }).click();
  await mobile.getByRole("button", { name: "轮到你了" }).click();
  await mobile
    .getByRole("button", { name: "C3 空点", exact: true })
    .first()
    .click();
  await mobile.getByText("做到了！", { exact: true }).waitFor();
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  report.push({
    check: "WebGL-unavailable mobile fallback completes the same lesson",
    result: "passed",
  });
  await fallback.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(
    ".qa/challenge-fallback-report.json",
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report, null, 2));
