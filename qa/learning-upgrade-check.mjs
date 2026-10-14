import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { click3DPoint } from "./board-input.mjs";

await mkdir(".qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const base = process.env.GO_STUDIO_URL || "http://127.0.0.1:5186",
  errors = [],
  report = [],
  requests = [];
let deferred = null;
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() =>
  localStorage.setItem(
    "goGame.ai.v1",
    JSON.stringify({
      version: 1,
      baseURL: "https://coach.example.test/v1",
      model: "test-coach",
      apiKey: "dummy-portable-key",
      remember: true,
      timeout: 30,
      maxTokens: 800,
    }),
  ),
);
await page.route(
  "https://coach.example.test/v1/chat/completions",
  async (route) => {
    const body = route.request().postDataJSON(),
      data = JSON.parse(body.messages.at(-1).content);
    requests.push({ messages: body.messages, data });
    if (data.question === "测试取消") {
      deferred = route;
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [
          {
            message: {
              content:
                "先数气，再比较连接与展开。这里是结合课程和棋盘的测试讲解。",
            },
          },
        ],
      }),
    });
  },
);
try {
  await page.goto(`${base}/#/lesson/lesson-05`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "问教练 · 深入讲解" }).click();
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.locator(".coach-message.assistant").waitFor();
  assert.equal(requests[0].data.lessonContext.title, "提子与释放空间");
  assert.ok(requests[0].data.lessonContext.reference.includes("气"));
  assert.equal(requests[0].data.board.length, 9);
  await page.getByLabel("向教练提问").fill("那为什么不能先在别处落子？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.locator(".coach-message.assistant").nth(1).waitFor();
  assert.ok(requests[1].messages.some((m) => m.role === "assistant"));
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".coach-drawer").count(), 0);
  report.push({
    check: "lesson-aware global AI and follow-up history",
    result: "passed",
  });

  for (const [scene, material] of [
    ["room", "walnut"],
    ["night", "slate"],
    ["bamboo", "kaya"],
  ]) {
    await page.getByLabel("快速切换场景").selectOption(scene);
    await page.getByLabel("快速切换棋盘材质").selectOption(material);
    await page
      .locator(`.board-shell.scene-${scene}.material-${material} canvas`)
      .waitFor();
    assert.equal(await page.locator(".three-canvas canvas").count(), 1);
    await page.screenshot({
      path: `.qa/scene-${scene}.png`,
      animations: "disabled",
    });
  }
  report.push({
    check: "three scene/material combinations create a single WebGL canvas",
    result: "passed",
  });
  await page.getByRole("button", { name: "轮到你了", exact: true }).click();
  await click3DPoint(page, 6, 3, 9);
  await page.getByRole("button", { name: "独立练习", exact: true }).click();
  await page.getByRole("button", { name: "问教练 · 深入讲解" }).click();
  await page.getByLabel("向教练提问").fill("请帮助我理解这一题");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.locator(".coach-message.assistant").nth(2).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /整块两颗/ }).click();
  await page.getByRole("button", { name: "确认答案", exact: true }).click();
  await page
    .getByText("答对了，提示帮助你完成了练习。", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  report.push({
    check:
      "global coach use during a quiz is recorded as assisted, not independent success",
    result: "passed",
  });

  await page.goto(`${base}/#/openings`, { waitUntil: "networkidle" });
  await page.getByLabel("导入 SGF 棋谱文件").setInputFiles({
    name: "teaching.sgf",
    mimeType: "application/x-go-sgf",
    buffer: Buffer.from(
      "(;GM[1]FF[4]CA[UTF-8]SZ[9]GN[测试分支谱]C[起点];B[cc]C[占角];W[gg]C[对角](;B[cg]C[主线])(;B[gc]C[比较变化]))",
    ),
  });
  await page.getByText("已导入 1 盘棋，注解与分支已保存。").waitFor();
  await page.getByRole("button", { name: /测试分支谱/ }).click();
  await page.getByRole("button", { name: "棋谱下一步" }).click();
  await page.getByRole("button", { name: "棋谱下一步" }).click();
  await page.getByRole("button", { name: /变化 1/ }).click();
  await page
    .locator(".study-comment")
    .filter({ hasText: "比较变化" })
    .waitFor();
  report.push({
    check: "SGF import with comments and selectable variations",
    result: "passed",
  });

  await page.getByRole("button", { name: "问教练 · 深入讲解" }).click();
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.locator(".coach-message.assistant").nth(3).waitFor();
  assert.ok(
    requests
      .at(-1)
      .data.lessonContext.reference.includes("当前步骤注解：比较变化"),
  );
  await page.getByLabel("向教练提问").fill("测试取消");
  const sent = page.waitForRequest(
    "https://coach.example.test/v1/chat/completions",
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await sent;
  await page.getByRole("button", { name: "返回棋谱研习室" }).click();
  assert.equal(await page.locator(".coach-thinking").count(), 0);
  if (deferred)
    await deferred
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choices: [{ message: { content: "过期回复不应该出现" } }],
        }),
      })
      .catch(() => {});
  assert.equal(await page.getByText("过期回复不应该出现").count(), 0);
  await page.keyboard.press("Escape");
  report.push({
    check:
      "coach uses current imported-step annotation and cancels stale replies after SPA navigation",
    result: "passed",
  });

  await page.goto(`${base}/#/challenge/snapback`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "开始这一轮" }).click();
  for (let round = 0; round < 3; round++) {
    await page.getByRole("button", { name: "看目标提示（转为练习）" }).click();
    const instruction = await page.locator(".lesson-panel .notice").innerText();
    const coord = instruction.match(/[A-HJ-T][1-9]/)[0];
    const row = 5 - Number(coord.slice(1)),
      col = "ABCDEFGHJKLMNOPQRST".indexOf(coord[0]);
    await click3DPoint(page, row, col, 5);
    await click3DPoint(page, row, col, 5);
    await page
      .getByRole("button", {
        name: round === 2 ? "完成挑战" : "下一题",
        exact: true,
      })
      .click();
  }
  await page.getByText("这一轮完成了。", { exact: true }).waitFor();
  report.push({
    check:
      "transformed snapback task with forced opponent response and legal recapture",
    result: "passed",
  });

  await page.goto(`${base}/#/settings`, { waitUntil: "networkidle" });
  await page.getByLabel("包含 API 密钥").check();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整存档", exact: true }).click();
  const download = await downloadEvent;
  const archiveText = await readFile(await download.path(), "utf8"),
    archive = JSON.parse(archiveText);
  assert.equal(archive.profile.apiKey, "dummy-portable-key");
  assert.equal(archive.games.length, 1);
  assert.equal(archive.preferences.scene, "bamboo");
  assert.equal(archive.progress.challenges.snapback.attempts, 1);
  assert.ok(Object.values(archive.progress.attempts).some((a) => a.hinted));
  assert.equal(
    archive.progress.challenges.snapback.best,
    0,
    "Assisted practice does not overwrite the independent best",
  );
  const fresh = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    freshPage = await fresh.newPage();
  await freshPage.goto(`${base}/#/settings`, { waitUntil: "networkidle" });
  await freshPage.getByLabel("加载完整存档文件").setInputFiles({
    name: "archive.json",
    mimeType: "application/json",
    buffer: Buffer.from(archiveText),
  });
  await freshPage.getByRole("button", { name: "合并并加载" }).click();
  await freshPage.getByText("存档已加载，学习进度与棋谱已合并。").waitFor();
  await freshPage.reload({ waitUntil: "networkidle" });
  assert.equal(
    await freshPage.getByLabel(/^模型名称/).inputValue(),
    "test-coach",
  );
  await freshPage.goto(`${base}/#/openings`, { waitUntil: "networkidle" });
  assert.equal(
    await freshPage.getByRole("button", { name: /测试分支谱/ }).count(),
    1,
  );
  await freshPage.goto(`${base}/#/practice`, { waitUntil: "networkidle" });
  assert.ok(
    (
      await freshPage
        .locator(".challenge-card")
        .filter({ hasText: "倒扑实验" })
        .innerText()
    ).includes("已练 1 轮"),
  );
  await freshPage.locator(".exam-card").first().click();
  await freshPage.getByRole("button", { name: "打开全局围棋教练" }).click();
  await freshPage
    .getByText("当前是独立测评。完成后可用教练复盘，练习模式可以随时提问。", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await freshPage.getByRole("button", { name: "发送", exact: true }).count(),
    0,
  );
  await freshPage.keyboard.press("Escape");
  await freshPage.goto(`${base}/#/openings`, { waitUntil: "networkidle" });
  await freshPage.getByLabel("导入 SGF 棋谱文件").setInputFiles({
    name: "extra.sgf",
    mimeType: "application/x-go-sgf",
    buffer: Buffer.from("(;GM[1]FF[4]CA[UTF-8]SZ[9]GN[稍后新增棋谱];B[aa])"),
  });
  await freshPage.getByText("已导入 1 盘棋，注解与分支已保存。").waitFor();
  await freshPage.goto(`${base}/#/settings`, { waitUntil: "networkidle" });
  await freshPage.getByLabel("加载完整存档文件").setInputFiles({
    name: "archive.json",
    mimeType: "application/json",
    buffer: Buffer.from(archiveText),
  });
  await freshPage.getByLabel("存档加载方式").selectOption("restore");
  await freshPage
    .getByRole("button", { name: "恢复此存档", exact: true })
    .click();
  await freshPage.getByText("已恢复为存档中的进度与棋谱。").waitFor();
  await freshPage.reload({ waitUntil: "networkidle" });
  await freshPage.getByLabel("加载完整存档文件").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      '{"format":"go-studio-archive","version":1,"progress":null}',
    ),
  });
  await freshPage
    .getByText("存档结构不完整或已损坏，未修改现有记录。")
    .waitFor();
  assert.equal(
    await freshPage.getByLabel(/^模型名称/).inputValue(),
    "test-coach",
  );
  await freshPage.goto(`${base}/#/openings`, { waitUntil: "networkidle" });
  assert.equal(
    await freshPage.getByRole("button", { name: /稍后新增棋谱/ }).count(),
    0,
  );
  assert.equal(
    await freshPage.getByRole("button", { name: /测试分支谱/ }).count(),
    1,
  );
  await fresh.close();
  report.push({
    check:
      "complete archive restores AI credentials, appearance and branched SGF into fresh browser and survives reload",
    result: "passed",
  });
  report.push({
    check:
      "restore mode replaces later records atomically; corrupt archive leaves current records intact",
    result: "passed",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "practice",
    "openings",
    "study/nine-direction",
    "settings",
  ]) {
    await page.goto(`${base}/#/${route}`, { waitUntil: "networkidle" });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${route} must fit mobile viewport`,
    );
  }
  await page.getByRole("button", { name: "打开全局围棋教练" }).click();
  await page.screenshot({
    path: ".qa/coach-mobile.png",
    animations: "disabled",
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  report.push({
    check: "new learning pages and coach fit a 390px mobile viewport",
    result: "passed",
  });
  assert.deepEqual(errors, []);
  await writeFile(
    ".qa/learning-upgrade-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
