import { createServer } from "vite";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir(".qa", { recursive: true });
const baseline = execFileSync("git", ["show", "02bcac1:src/ai/local.ts"], {
  encoding: "utf8",
}).replaceAll('"../domain/go"', '"../src/domain/go"');
await writeFile(".qa/legacy-local.ts", baseline);
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const rules = await server.ssrLoadModule("/src/domain/go.ts"),
    current = await server.ssrLoadModule("/src/ai/local.ts"),
    old = await server.ssrLoadModule("/.qa/legacy-local.ts");
  const reports = [];
  const difficulty = process.argv[2] || "beginner";
  for (const [size, newColor] of [
    [5, 1],
    [5, 2],
    [9, 1],
    [9, 2],
  ]) {
    let p = rules.createPosition(size, size === 9 ? 6.5 : 0),
      elapsed = 0,
      moves = 0;
    // Both versions use the same beginner mode and deterministic, non-random selection.
    const times = [];
    while (p.passes < 2 && moves < size * size * 3) {
      const isNew = p.toPlay === newColor,
        start = performance.now();
      const candidate = (isNew ? current : old).rankCandidates(
        p,
        isNew ? difficulty : "beginner",
        () => 1,
      )[0];
      if (isNew) times.push(performance.now() - start);
      const result = rules.play(p, candidate.action);
      if (!result.ok) throw new Error(result.reason);
      p = result.position;
      moves++;
    }
    const score = rules.areaScore(p);
    reports.push({
      difficulty,
      size,
      newColor,
      moves,
      passes: p.passes,
      newWon: score.winner === newColor,
      black: score.black,
      white: score.white,
      captures: p.captures,
      meanMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      maxMs: Math.round(Math.max(...times)),
    });
    console.log(JSON.stringify(reports.at(-1)));
  }
  await writeFile(
    ".qa/engine-benchmark.json",
    JSON.stringify(
      {
        note: "Diagnostic self-play against commit 02bcac1; raw area count without adjudicated dead stones, not a rank or calibrated strength rating.",
        reports,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
