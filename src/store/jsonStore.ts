import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export const DATA_DIR_NAME = ".llm-toolbox";
const MAX_JSON_BYTES = 750_000;

export function dataRoot(): string {
  const root = join(homedir(), DATA_DIR_NAME);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return root;
}

function atomicWrite(path: string, text: string): void {
  const encoded = Buffer.from(text, "utf8");
  if (encoded.length > MAX_JSON_BYTES) {
    throw new Error(`refusing to write more than ${MAX_JSON_BYTES} bytes`);
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, encoded, { encoding: "utf8", mode: 0o600 });
}

export function readJson<T>(relativeName: string, fallback: T): T {
  const path = join(dataRoot(), relativeName);
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return fallback;
  }
}

export function writeJson(relativeName: string, value: unknown): void {
  const path = join(dataRoot(), relativeName);
  atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function nowIso(): string {
  return new Date().toISOString();
}
