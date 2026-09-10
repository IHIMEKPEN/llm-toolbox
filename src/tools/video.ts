import { mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { text, tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { ffmpegBin, ffprobeBin, runBin } from "../media/bins";
import { describeImages } from "../media/vision";
import { resolveMediaFile, UnsafeMediaPathError } from "../security/mediaPaths";

const MAX_FRAMES = 6;

function framesDir(root: string): string {
  const dir = join(root, "_video_frames");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function videoTools(
  ctl: ToolsProviderController,
  opts: { allowExternal: boolean },
): Tool[] {
  const root = ctl.getWorkingDirectory();

  const info = tool({
    name: "get_video_info",
    description: "Return duration and resolution for a video file (ffprobe).",
    parameters: { path: z.string() },
    implementation: async ({ path }) => {
      try {
        const file = resolveMediaFile(root, path, "video", opts.allowExternal);
        const probe = ffprobeBin();
        if (!probe) {
          return { path: file, size_bytes: statSync(file).size, ffprobe: "missing — brew install ffmpeg" };
        }
        const dur = await runBin(
          probe,
          ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
          15_000,
        );
        const res = await runBin(
          probe,
          ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", file],
          15_000,
        );
        const seconds = Number.parseFloat((dur.stdout || "").trim());
        return {
          path: file,
          duration_s: Number.isFinite(seconds) ? seconds : "unknown",
          resolution: (res.stdout || "").trim() || "unknown",
          recommended_frames: Number.isFinite(seconds)
            ? Math.min(MAX_FRAMES, Math.max(2, Math.ceil(seconds / 8)))
            : MAX_FRAMES,
        };
      } catch (err) {
        if (err instanceof UnsafeMediaPathError) return `Error: ${err.message}`;
        return err instanceof Error ? `Error: ${err.message}` : "Error: probe failed";
      }
    },
  });

  const extract = tool({
    name: "extract_video_frames",
    description: text`
      Extract up to 6 JPEG keyframes into workspace _video_frames using ffmpeg.
      Use analyze_video_with_vision afterwards with a loaded vision model.
    `,
    parameters: {
      path: z.string(),
      fps: z.number().int().min(1).max(3).default(1),
      max_frames: z.number().int().min(1).max(MAX_FRAMES).default(MAX_FRAMES),
    },
    implementation: async ({ path, fps, max_frames }) => {
      try {
        const file = resolveMediaFile(root, path, "video", opts.allowExternal);
        const ffmpeg = ffmpegBin();
        if (!ffmpeg) return "Error: ffmpeg not found (brew install ffmpeg)";
        const dir = framesDir(root);
        const prefix = `f_${Date.now()}_`;
        const pattern = join(dir, `${prefix}%03d.jpg`);
        const result = await runBin(
          ffmpeg,
          ["-y", "-i", file, "-vf", `fps=${fps}`, "-frames:v", String(max_frames), pattern],
          55_000,
        );
        if (result.status !== 0) return `Error: ffmpeg failed: ${result.stderr.slice(-400)}`;
        const frames = readdirSync(dir)
          .filter((n) => n.startsWith(prefix) && n.endsWith(".jpg"))
          .sort()
          .map((n) => join(dir, n));
        if (!frames.length) return "Error: no frames extracted";
        return { count: frames.length, frames };
      } catch (err) {
        if (err instanceof UnsafeMediaPathError) return `Error: ${err.message}`;
        return err instanceof Error ? `Error: ${err.message}` : "Error: extract failed";
      }
    },
  });

  const analyze = tool({
    name: "analyze_video_with_vision",
    description: text`
      Extract keyframes and describe them with the currently loaded vision model.
      Load a vision-capable model in LM Studio first.
    `,
    parameters: {
      path: z.string(),
      question: z.string().default("Describe what happens in this video, in order."),
      max_frames: z.number().int().min(1).max(MAX_FRAMES).default(4),
    },
    implementation: async ({ path, question, max_frames }) => {
      try {
        const file = resolveMediaFile(root, path, "video", opts.allowExternal);
        const ffmpeg = ffmpegBin();
        if (!ffmpeg) return "Error: ffmpeg not found (brew install ffmpeg)";
        const dir = framesDir(root);
        const prefix = `a_${Date.now()}_`;
        const pattern = join(dir, `${prefix}%03d.jpg`);
        const extracted = await runBin(
          ffmpeg,
          ["-y", "-i", file, "-vf", "fps=1", "-frames:v", String(max_frames), pattern],
          55_000,
        );
        if (extracted.status !== 0) {
          return `Error: ffmpeg failed: ${extracted.stderr.slice(-400)}`;
        }
        const frames = readdirSync(dir)
          .filter((n) => n.startsWith(prefix) && n.endsWith(".jpg"))
          .sort()
          .map((n) => join(dir, n));
        if (!frames.length) return "Error: no frames extracted";
        const description = await describeImages(ctl, frames, question, "video");
        for (const frame of frames) {
          try {
            unlinkSync(frame);
          } catch {
            /* keep going */
          }
        }
        return { frames_used: frames.length, description };
      } catch (err) {
        if (err instanceof UnsafeMediaPathError) return `Error: ${err.message}`;
        return err instanceof Error ? `Error: ${err.message}` : "Error: analyze failed";
      }
    },
  });

  return [info, extract, analyze];
}
