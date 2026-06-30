import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

const args = parseArgs(process.argv.slice(2));
const root = resolve(args.root || "app");
const host = args.host || "127.0.0.1";
const port = Number(args.port || 8000);

const server = createServer((request, response) => {
  const filePath = resolveRequestPath(request.url || "/");
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": MIME_TYPES.get(extname(filePath)) || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host);

function parseArgs(entries) {
  const result = {};
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry.startsWith("--")) {
      continue;
    }

    result[entry.slice(2)] = entries[index + 1];
    index += 1;
  }

  return result;
}

function resolveRequestPath(url) {
  const pathname = new URL(url, `http://${host}:${port}`).pathname;
  const decodedPathname = decodeURIComponent(pathname);
  const relativePath = normalize(decodedPathname).replace(/^([/\\])+/, "");
  const requestedPath = resolve(join(root, relativePath || "index.html"));
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;

  if (requestedPath !== root && !requestedPath.startsWith(rootPrefix)) {
    return null;
  }

  if (existsSync(requestedPath) && statSync(requestedPath).isDirectory()) {
    return join(requestedPath, "index.html");
  }

  return requestedPath;
}
