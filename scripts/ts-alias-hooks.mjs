import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

const SRC = resolvePath("/workspace/src");

function mapAlias(specifier) {
  if (!specifier.startsWith("@/")) return null;
  const base = resolvePath(SRC, specifier.slice(2));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    resolvePath(base, "index.ts"),
    resolvePath(base, "index.tsx"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) return pathToFileURL(file).href;
  }
  return pathToFileURL(`${base}.ts`).href;
}

export async function resolve(specifier, context, nextResolve) {
  const mapped = mapAlias(specifier);
  if (mapped) return { url: mapped, shortCircuit: true };
  return nextResolve(specifier, context);
}
