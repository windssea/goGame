import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir(".qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  contextWarnings = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (/Too many active WebGL contexts/i.test(e.text()))
    contextWarnings.push(e.text());
});
const base = process.env.GO_STUDIO_URL || "http://127.0.0.1:5186";
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator(".three-canvas canvas").waitFor();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const before = (await cdp.send("Performance.getMetrics")).metrics.find(
    (m) => m.name === "JSHeapUsedSize",
  ).value;
  for (let i = 0; i < 15; i++) {
    await page.goto(`${base}/#/lesson/lesson-01`, { waitUntil: "networkidle" });
    await page
      .getByRole("heading", { name: "棋盘与第一颗棋子", exact: true })
      .waitFor();
    assert.equal(await page.locator(".three-canvas canvas").count(), 1);
    await page.goto(`${base}/#/learn`, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "开始学围棋", exact: true })
      .waitFor();
    assert.equal(await page.locator(".three-canvas canvas").count(), 1);
  }
  await cdp.send("HeapProfiler.collectGarbage");
  const warm = (await cdp.send("Performance.getMetrics")).metrics.find(
    (m) => m.name === "JSHeapUsedSize",
  ).value;
  for (let i = 0; i < 15; i++) {
    await page.goto(`${base}/#/lesson/lesson-01`, { waitUntil: "networkidle" });
    await page
      .getByRole("heading", { name: "棋盘与第一颗棋子", exact: true })
      .waitFor();
    await page.goto(`${base}/#/learn`, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "开始学围棋", exact: true })
      .waitFor();
  }
  await cdp.send("HeapProfiler.collectGarbage");
  const after = (await cdp.send("Performance.getMetrics")).metrics.find(
    (m) => m.name === "JSHeapUsedSize",
  ).value;
  await writeFile(
    ".qa/scene-lifecycle-diagnostic.json",
    JSON.stringify(
      {
        before,
        warm,
        after,
        steadyGrowth: after - warm,
        contextWarnings,
        errors,
      },
      null,
      2,
    ),
  );
  assert.ok(
    after - warm < 4_000_000,
    "Heap should stabilize after component warm-up",
  );
  assert.ok(
    after - before < 20_000_000,
    "Repeated scene changes should not retain large JS allocations",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(contextWarnings, []);
  const result = {
    sceneChanges: 60,
    beforeHeapBytes: before,
    warmHeapBytes: warm,
    afterHeapBytes: after,
    steadyGrowthBytes: after - warm,
    heapGrowthBytes: after - before,
    contextWarnings,
    errors,
    result: "passed",
  };
  await writeFile(
    ".qa/scene-lifecycle-report.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
