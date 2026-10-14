import http from "node:http";

const destination = process.argv[2] || process.env.GO_UPSTREAM_URL;
if (!destination) {
  console.error("用法: node scripts/local-ai-proxy.mjs https://你的服务/v1");
  process.exit(1);
}
const base = new URL(destination);
if (
  !["https:", "http:"].includes(base.protocol) ||
  base.username ||
  base.password ||
  base.search ||
  base.hash
)
  throw new Error("上游地址不能包含密钥、认证或查询参数。");
if (
  base.protocol === "http:" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
)
  throw new Error("远程上游服务需要 HTTPS。");
const endpoint = base.toString().replace(/\/+$/, "") + "/chat/completions";
if (base.pathname.replace(/\/$/, "").endsWith("/chat/completions"))
  throw new Error("请传入 API 根地址，不要包含 /chat/completions。");
const port = Number(process.env.GO_PROXY_PORT || 5190);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("代理端口需要为1到65535的整数。");
const origins = new Set(
  (
    process.env.GO_ALLOWED_ORIGINS ||
    "http://127.0.0.1:5186,http://localhost:5186,http://127.0.0.1:5187"
  )
    .split(",")
    .map((s) => s.trim()),
);
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !origins.has(origin)) {
    res.writeHead(403);
    res.end("Origin not allowed");
    return;
  }
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "3600");
  res.setHeader("Cache-Control", "no-store");
  if (req.url !== "/v1/chat/completions") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }
  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 2_000_000) {
        res.writeHead(413);
        res.end("Request too large");
        return;
      }
      chunks.push(chunk);
    }
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization
          ? { Authorization: req.headers.authorization }
          : {}),
      },
      body: Buffer.concat(chunks),
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(120_000),
      ]),
    });
    res.setHeader("Content-Type", "application/json");
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) res.setHeader("Retry-After", retryAfter);
    const payload = Buffer.from(await response.arrayBuffer());
    if (!res.destroyed && !res.writableEnded) {
      res.writeHead(response.status);
      res.end(payload);
    }
  } catch {
    if (!res.destroyed && !res.writableEnded) {
      res.writeHead(502);
      res.end('{"error":"Upstream request failed"}');
    }
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `个人 AI 代理已就绪: http://127.0.0.1:${port}/v1\n仅监听本机，不保存或记录请求与密钥。`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
