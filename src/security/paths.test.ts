import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PathEscapeError, resolveInWorkspace } from "./paths";

const root = mkdtempSync(join(tmpdir(), "llm-toolbox-"));

test("allows relative files inside the workspace", () => {
  const resolved = resolveInWorkspace(root, "notes/todo.txt");
  assert.equal(resolved, join(root, "notes/todo.txt"));
});

test("allows the workspace root itself", () => {
  assert.equal(resolveInWorkspace(root, "."), root);
});

test("rejects parent traversal", () => {
  assert.throws(() => resolveInWorkspace(root, "../secret.txt"), PathEscapeError);
  assert.throws(() => resolveInWorkspace(root, "a/../../etc/passwd"), PathEscapeError);
});

test("rejects NUL and empty paths", () => {
  assert.throws(() => resolveInWorkspace(root, ""), PathEscapeError);
  assert.throws(() => resolveInWorkspace(root, "a\0b"), PathEscapeError);
});

test("rejects absolute paths outside the workspace", () => {
  assert.throws(() => resolveInWorkspace(root, "/etc/passwd"), PathEscapeError);
});
