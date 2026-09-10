import { existsSync, statSync } from "fs";
import { homedir } from "os";
import { extname, resolve } from "path";
import { PathEscapeError, resolveInWorkspace } from "./paths";

export class UnsafeMediaPathError extends Error {
  override readonly name = "UnsafeMediaPathError";
  constructor(message: string) {
    super(message);
  }
}

const AUDIO_EXTS = new Set([".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg", ".aiff", ".caf", ".wma"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);

const BLOCKED_DIR_NAMES = [
  ".ssh",
  ".gnupg",
  ".aws",
  ".config/gh",
  "Library/Keychains",
  "Library/Cookies",
  "Library/Mail",
  "Library/Messages",
  "Library/Accounts",
  "Library/Safari",
];

function isBlockedLocation(absPath: string): boolean {
  const home = homedir();
  const lower = absPath.toLowerCase();
  if (lower.endsWith(".env") || lower.includes("/.env.")) return true;
  if (/(^|\/)id_rsa($|\.)|(^|\/)credentials$/i.test(absPath)) return true;
  for (const rel of BLOCKED_DIR_NAMES) {
    const blocked = resolve(home, rel);
    if (absPath === blocked || absPath.startsWith(`${blocked}/`)) return true;
  }
  if (
    absPath.startsWith("/etc/") ||
    absPath.startsWith("/private/etc/") ||
    absPath.startsWith("/dev/") ||
    absPath.startsWith("/proc/")
  ) {
    return true;
  }
  return false;
}

export type MediaKind = "audio" | "video" | "image";

export function extAllowed(path: string, kind: MediaKind): boolean {
  const ext = extname(path).toLowerCase();
  if (kind === "audio") return AUDIO_EXTS.has(ext);
  if (kind === "video") return VIDEO_EXTS.has(ext);
  return IMAGE_EXTS.has(ext);
}

/**
 * Resolve a media file. Relative paths stay in the workspace. Absolute paths
 * are allowed only when `allowExternal` is true, the file exists, the
 * extension matches, and the location is not a secrets directory.
 * This never recursively scans Desktop / Downloads / Voice Memos.
 */
export function resolveMediaFile(
  workspaceRoot: string,
  userPath: string,
  kind: MediaKind,
  allowExternal: boolean,
): string {
  if (!userPath.trim()) {
    throw new UnsafeMediaPathError("path is required");
  }
  try {
    const inside = resolveInWorkspace(workspaceRoot, userPath);
    if (!existsSync(inside) || !statSync(inside).isFile()) {
      throw new UnsafeMediaPathError(`file not found: ${userPath}`);
    }
    if (!extAllowed(inside, kind)) {
      throw new UnsafeMediaPathError(`not a ${kind} file`);
    }
    return inside;
  } catch (err) {
    if (!(err instanceof PathEscapeError)) throw err;
  }

  if (!allowExternal) {
    throw new UnsafeMediaPathError(
      "path is outside the workspace. Copy the file into the chat workspace, or enable “Allow explicit media paths outside workspace”.",
    );
  }

  const abs = resolve(userPath.trim());
  if (isBlockedLocation(abs)) {
    throw new UnsafeMediaPathError("refusing to read a sensitive location");
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new UnsafeMediaPathError(`file not found: ${userPath}`);
  }
  if (!extAllowed(abs, kind)) {
    throw new UnsafeMediaPathError(`not a ${kind} file`);
  }
  return abs;
}

export { AUDIO_EXTS, VIDEO_EXTS, IMAGE_EXTS };
