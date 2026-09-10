import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resolveMediaFile, UnsafeMediaPathError } from "./mediaPaths";

const root = mkdtempSync(join(tmpdir(), "llm-media-"));
const wav = join(root, "clip.wav");
writeFileSync(wav, "RIFF");

test("resolves media inside the workspace", () => {
  assert.equal(resolveMediaFile(root, "clip.wav", "audio", false), wav);
});

test("rejects non-media extensions", () => {
  const txt = join(root, "notes.txt");
  writeFileSync(txt, "hi");
  assert.throws(() => resolveMediaFile(root, "notes.txt", "audio", false), UnsafeMediaPathError);
});

test("rejects ssh and keychain locations even when external paths are on", () => {
  assert.throws(
    () => resolveMediaFile(root, join(homedir(), ".ssh", "id_rsa"), "audio", true),
    UnsafeMediaPathError,
  );
  assert.throws(
    () => resolveMediaFile(root, join(homedir(), "Library/Keychains/foo.wav"), "audio", true),
    UnsafeMediaPathError,
  );
});
