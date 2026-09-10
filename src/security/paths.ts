import { isAbsolute, relative, resolve, sep } from "path";

const NUL = "\0";
const MAX_PATH_CHARS = 1024;

export class PathEscapeError extends Error {
  override readonly name = "PathEscapeError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * Resolve `userPath` inside `root`. Rejects traversal, NUL bytes, and
 * absolute paths that leave the workspace.
 */
export function resolveInWorkspace(root: string, userPath: string): string {
  if (typeof userPath !== "string" || !userPath.trim()) {
    throw new PathEscapeError("path is required");
  }
  if (userPath.includes(NUL) || userPath.length > MAX_PATH_CHARS) {
    throw new PathEscapeError("invalid path");
  }

  const rootResolved = resolve(root);
  const trimmed = userPath.trim();
  const candidate = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(rootResolved, trimmed);

  const rel = relative(rootResolved, candidate);
  if (rel === "") {
    return candidate;
  }
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new PathEscapeError(`path escapes workspace (${rootResolved})`);
  }
  return candidate;
}

export function workspaceRootLabel(root: string): string {
  return resolve(root);
}
