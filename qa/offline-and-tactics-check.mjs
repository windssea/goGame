import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { click3DPoint } from "./board-input.mjs";

await mkdir(".qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const base = process.env.GO_STUDIO_PRODUCTION_URL || "http://127.0.0.1:5187";
const report = [],
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page.evaluate(() => !!navigator.serviceWorker.controller),
    true,
  );
  await context.setOffline(true);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "开始学围棋", exact: true }).waitFor();
  await page.goto(`${base}/#/lesson/lesson-16`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "轮到你了" }).click();
  await click3DPoint(page, 0, 0, 5);
  assert.equal(await page.getByText("做到了！", { exact: true }).count(), 0);
  await click3DPoint(page, 0, 0, 5);
  await page.getByText("做到了！", { exact: true }).waitFor();
  assert.ok(
    (await page.locator("main").innerText()).includes("先舍一子，再提三子"),
  );
  report.push({
    check:
      "production offline reload and multi-step snapback with actual 3D pointer input",
    result: "passed",
  });
  await page.goto(`${base}/#/lesson/lesson-15`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "轮到你了" }).click();
  const ladder = [
    [1, 2],
    [3, 1],
    [2, 3],
    [4, 2],
    [3, 4],
    [5, 3],
    [4, 5],
    [6, 4],
    [5, 6],
    [7, 5],
    [6, 7],
    [8, 6],
    [7, 8],
    [8, 8],
  ];
  for (const [row, col] of ladder) await click3DPoint(page, row, col, 9);
  await page.getByText("做到了！", { exact: true }).waitFor();
  report.push({
    check: "full 27-ply ladder interactive playback offline",
    result: "passed",
  });
  await page.goto(`${base}/#/settings`, { waitUntil: "networkidle" });
  await page
    .getByRole("checkbox", { name: "使用 2D 棋盘", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "落子前确认", exact: true })
    .uncheck();
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
  await page.waitForFunction(
    () => document.querySelector(".game-stats strong")?.textContent === "2",
  );
  report.push({ check: "offline local Worker opponent", result: "passed" });
  const gameURL = page.url();
  const duplicate = await context.newPage();
  await duplicate.goto(gameURL, { waitUntil: "networkidle" });
  await duplicate.getByText(/此局正在另一个标签中使用/).waitFor();
  await page
    .locator(".flat-board")
    .getByRole("button", { name: / 空点$/ })
    .first()
    .click();
  await page.waitForFunction(
    () => document.querySelector(".game-stats strong")?.textContent === "4",
  );
  await duplicate.waitForFunction(
    () => document.querySelector(".game-stats strong")?.textContent === "4",
  );
  report.push({
    check: "single-writer game lock and synchronized read-only tab",
    result: "passed",
  });
  await duplicate.close();
  await context.setOffline(false);
  await page.goto(`${base}/#/settings`, { waitUntil: "networkidle" });
  await page
    .getByRole("checkbox", { name: "使用 2D 棋盘", exact: true })
    .uncheck();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/#/learn`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: ".qa/home-mobile-3d.png",
    animations: "disabled",
  });
  assert.equal(await page.locator(".three-canvas canvas").count(), 1);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.goto(`${base}/#/opening/chinese`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "最后一步", exact: true }).click();
  await page.screenshot({
    path: ".qa/opening-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  report.push({
    check: "mobile 3D and 19-line opening layout",
    result: "passed",
  });
  await page.goto(`${base}/#/settings`, { waitUntil: "networkidle" });
  await page.getByRole("checkbox", { name: "深色主题", exact: true }).check();
  await page.goto(`${base}/#/learn`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: ".qa/home-dark-mobile.png",
    animations: "disabled",
  });
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  report.push({ check: "dark theme", result: "passed" });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    ".qa/offline-tactics-report.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
