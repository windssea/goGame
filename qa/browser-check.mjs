import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { click3DPoint } from "./board-input.mjs";

await mkdir(".qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const report = [];
const base = process.env.GO_STUDIO_URL || "http://127.0.0.1:5186";
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "开始学围棋", exact: true }).waitFor();
  await page.screenshot({
    path: ".qa/home-desktop.png",
    fullPage: false,
    animations: "disabled",
  });
  const webgl = await page.locator(".three-canvas canvas").count();
  report.push({ check: "homepage 3D", canvases: webgl });
  assert.equal(webgl, 1, "Desktop should create the Three.js scene");
  await page.getByRole("button", { name: "开始学围棋", exact: true }).click();
  await page.getByRole("button", { name: "轮到你了" }).click();
  const canvasBounds = await page.locator(".three-canvas canvas").boundingBox();
  const cx = canvasBounds.x + canvasBounds.width / 2,
    cy = canvasBounds.y + canvasBounds.height / 2;
  await page.mouse.click(cx, cy, { button: "right" });
  assert.equal(await page.getByText("做到了！", { exact: true }).count(), 0);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 55, cy + 15, { steps: 5 });
  await page.mouse.move(cx, cy, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.getByText("做到了！", { exact: true }).count(), 0);
  report.push({
    check: "rotation drag and right mouse button never place a stone",
    result: "passed",
  });
  // Arrow keys only choose a point; they must not submit a move.
  await page.getByRole("grid", { name: "围棋棋盘" }).focus();
  for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown");
  for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByText("做到了！", { exact: true }).count(), 0);
  await page.keyboard.press("Enter");
  await page.getByText("做到了！", { exact: true }).waitFor();
  await page.getByRole("button", { name: "独立练习", exact: true }).click();
  for (const answer of ["线与线的交叉点", "黑棋", "不可以，只有被提走才离盘"]) {
    await page.getByRole("button", { name: new RegExp(answer) }).click();
    await page.getByRole("button", { name: "确认答案", exact: true }).click();
    await page.getByRole("button", { name: /下一题|完成练习/ }).click();
  }
  await page.getByText("又懂了一点围棋。", { exact: true }).waitFor();
  assert.ok(
    (await page.locator("main").innerText()).includes("本节独立答对 3 / 3"),
  );
  report.push({
    check: "lesson operation and independent quiz",
    result: "passed",
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.goto(`${base}/#/learn`, { waitUntil: "networkidle" });
  await page.getByText(/已完成 1 节课程/).waitFor();
  assert.ok(
    (await page.locator(".progress-caption").innerText()).includes(
      "已完成 1 节",
    ),
  );
  report.push({ check: "IndexedDB progress after reload", result: "passed" });
  await page.goto(`${base}/#/opening/sanrensei`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "最后一步", exact: true }).click();
  assert.ok((await page.locator("main").innerText()).includes("第 6 手"));
  await page.screenshot({
    path: ".qa/opening-desktop.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "我来跟练一遍", exact: true }).click();
  const moves = [
    { row: 3, col: 15 },
    { row: 3, col: 3 },
    { row: 15, col: 15 },
    { row: 15, col: 3 },
    { row: 9, col: 15 },
    { row: 13, col: 2 },
  ];
  // Actual pointer input verifies camera projection, picking and the teaching state machine.
  for (const { row, col } of moves) {
    await click3DPoint(page, row, col, 19);
  }
  await page
    .getByText("跟练完成！记住构架的目的，而不是要求对手配合这个顺序。")
    .waitFor();
  report.push({
    check: "classic opening playback and complete practice",
    result: "passed",
  });
  await page.goto(`${base}/#/settings`, { waitUntil: "networkidle" });
  await page
    .getByRole("checkbox", { name: "使用 2D 棋盘", exact: true })
    .check();
  await page.getByRole("checkbox", { name: "落子前确认", exact: true }).check();
  await page.getByRole("checkbox", { name: "落子音效", exact: true }).uncheck();
  await page.goto(`${base}/#/play`, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "开始对弈", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "E5 空点", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "落子 · E5", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".game-stats strong")?.textContent === "2",
  );
  await page.screenshot({
    path: ".qa/game-desktop.png",
    animations: "disabled",
  });
  report.push({
    check: "local opponent responds to confirmed move",
    result: "passed",
  });
  await page.getByRole("button", { name: "悔棋", exact: true }).click();
  assert.equal(
    await page.locator(".game-stats strong").first().innerText(),
    "0",
  );
  await page
    .getByRole("button", { name: "E5 空点", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "落子 · E5", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".game-stats strong")?.textContent === "2",
  );
  const savedURL = page.url();
  await page.getByRole("button", { name: "复盘当前棋局", exact: true }).click();
  await page.getByRole("button", { name: "复盘起点", exact: true }).click();
  await page
    .getByRole("button", { name: "从这里试下一个变化", exact: true })
    .click();
  await page
    .getByRole("button", { name: "C7 空点", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "落子 · C7", exact: true }).click();
  await page
    .getByRole("button", { name: "退出试下，回到原棋谱", exact: true })
    .click();
  await page.getByRole("button", { name: "返回对局", exact: true }).click();
  assert.equal(
    await page.locator(".game-stats strong").first().innerText(),
    "2",
  );
  report.push({
    check: "undo and review variation preserve game",
    result: "passed",
  });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(page.url(), savedURL);
  await page.waitForFunction(
    () => document.querySelector(".game-stats strong")?.textContent === "2",
  );
  report.push({
    check: "saved game restores exact move count",
    result: "passed",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/#/learn`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: ".qa/home-mobile.png",
    fullPage: false,
    animations: "disabled",
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false, "mobile must not overflow horizontally");
  report.push({ check: "mobile layout", result: "passed" });
  assert.deepEqual(errors, [], "no uncaught browser exceptions");
  report.push({ check: "uncaught browser errors", errors });
} finally {
  await writeFile(".qa/browser-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
