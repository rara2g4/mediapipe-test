import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["app/src", "tools"];
const javascriptExtensions = new Set([".js", ".mjs"]);

function collectJavaScriptFiles(path) {
  const stats = statSync(path);
  if (stats.isFile()) {
    return javascriptExtensions.has(extname(path)) ? [path] : [];
  }

  return readdirSync(path)
    .flatMap((entry) => collectJavaScriptFiles(join(path, entry)))
    .sort();
}

const files = roots.flatMap(collectJavaScriptFiles);

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const localImportPattern =
  /(?:import\s+(?:[\s\S]*?\s+from\s+)?|import\s*\()\s*["'](\.[^"']+)["']/g;
const missingImports = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");

  for (const match of source.matchAll(localImportPattern)) {
    const importPath = match[1];
    const resolvedPath = resolve(dirname(file), importPath);

    if (!existsSync(resolvedPath)) {
      missingImports.push(`${file} -> ${importPath}`);
    }
  }
}

if (missingImports.length > 0) {
  console.error("Missing local imports:");
  missingImports.forEach((entry) => console.error(`- ${entry}`));
  process.exit(1);
}
