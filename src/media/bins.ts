import { accessSync, constants } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const BIN_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  join(homedir(), ".local/bin"),
];

export function findBin(name: string): string | null {
  const extra = (process.env.PATH || "").split(":").filter(Boolean);
  for (const dir of [...BIN_DIRS, ...extra]) {
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

export async function runBin(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; status: number }> {
  try {
    const result = await execFileAsync(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return { stdout: result.stdout, stderr: result.stderr, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
    if (e.killed) {
      throw new Error(`timed out after ${timeoutMs}ms`);
    }
    return {
      stdout: e.stdout || "",
      stderr: e.stderr || (err instanceof Error ? err.message : "command failed"),
      status: typeof e.code === "number" ? e.code : 1,
    };
  }
}

export function ffmpegBin(): string | null {
  return findBin("ffmpeg");
}

export function ffprobeBin(): string | null {
  return findBin("ffprobe");
}
