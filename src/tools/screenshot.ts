import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { text, tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { runBin } from "../media/bins";
import { describeImages } from "../media/vision";
import { resolveMediaFile, UnsafeMediaPathError } from "../security/mediaPaths";

const SENSITIVE_APPS = [
  "mail",
  "messages",
  "facetime",
  "keychain",
  "1password",
  "bitwarden",
  "passwords",
  "wallet",
  "banking",
];

function shotsDir(root: string): string {
  const dir = join(root, "_screenshots");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function stampName(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}_${stamp}.jpg`;
}

export function screenshotTools(
  ctl: ToolsProviderController,
  opts: { allowExternal: boolean; allowSensitive: boolean },
): Tool[] {
  const root = ctl.getWorkingDirectory();

  const listShots = tool({
    name: "list_screenshots",
    description: "List screenshots previously saved in the workspace _screenshots folder.",
    parameters: {},
    implementation: async () => {
      const dir = shotsDir(root);
      const files = readdirSync(dir)
        .filter((n) => /\.(jpg|jpeg|png)$/i.test(n))
        .map((n) => {
          const p = join(dir, n);
          return { name: n, bytes: statSync(p).size };
        });
      return files.length ? files : "No screenshots yet. Call take_screenshot.";
    },
  });

  const take = tool({
    name: "take_screenshot",
    description: text`
      Capture the main display to the workspace (_screenshots). macOS only.
      Requires Screen Recording permission for LM Studio.
      Does not open or focus apps. Does not scan Mail/Messages unless the user
      enabled sensitive-app screenshots.
    `,
    parameters: {
      prefix: z.string().default("shot"),
    },
    implementation: async ({ prefix }) => {
      if (process.platform !== "darwin") {
        return "Error: take_screenshot is currently macOS-only (screencapture).";
      }
      const bin = "/usr/sbin/screencapture";
      if (!existsSync(bin)) return "Error: screencapture not found";
      const dest = join(shotsDir(root), stampName((prefix || "shot").replace(/[^\w-]+/g, "_")));
      const result = await runBin(bin, ["-x", "-t", "jpg", dest], 20_000);
      if (result.status !== 0 || !existsSync(dest) || statSync(dest).size < 100) {
        return (
          "Error: screenshot failed or empty. Grant Screen Recording: System Settings → " +
          "Privacy & Security → Screen Recording → enable LM Studio."
        );
      }
      return { path: dest, bytes: statSync(dest).size, hint: "Call describe_screenshot to read it." };
    },
  });

  const describe = tool({
    name: "describe_screenshot",
    description: "Describe a screenshot with the currently loaded vision model.",
    parameters: {
      path: z.string().describe("Workspace-relative path, or empty for the latest screenshot."),
      question: z.string().default("What is on screen? Read visible text."),
    },
    implementation: async ({ path, question }) => {
      try {
        let file = "";
        if (!path.trim()) {
          const dir = shotsDir(root);
          const latest = readdirSync(dir)
            .filter((n) => /\.(jpg|jpeg|png)$/i.test(n))
            .map((n) => join(dir, n))
            .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
          if (!latest) return "Error: no screenshots yet. Call take_screenshot first.";
          file = latest;
        } else {
          file = resolveMediaFile(root, path, "image", opts.allowExternal);
        }
        return await describeImages(ctl, [file], question, "screenshot");
      } catch (err) {
        return err instanceof Error ? `Error: ${err.message}` : "Error: describe failed";
      }
    },
  });

  const screenshotApp = tool({
    name: "screenshot_app",
    description: text`
      Capture the main display (headless). Named-app targeting is best-effort:
      Mail, Messages, and password apps are blocked unless sensitive screenshots
      are enabled in plugin settings.
    `,
    parameters: {
      app: z.string().default(""),
    },
    implementation: async ({ app }) => {
      const name = app.trim().toLowerCase();
      if (name && SENSITIVE_APPS.some((s) => name.includes(s)) && !opts.allowSensitive) {
        return (
          "Error: screenshots of Mail, Messages, and password apps are blocked. " +
          "Enable “Allow sensitive-app screenshots” in plugin settings if you really need that."
        );
      }
      if (process.platform !== "darwin") {
        return "Error: screenshot_app is currently macOS-only.";
      }
      const dest = join(shotsDir(root), stampName(name ? name.replace(/[^\w-]+/g, "_") : "display"));
      const result = await runBin("/usr/sbin/screencapture", ["-x", "-t", "jpg", dest], 20_000);
      if (result.status !== 0 || !existsSync(dest)) {
        return "Error: screencapture failed. Grant Screen Recording permission to LM Studio.";
      }
      return { path: dest, bytes: statSync(dest).size, captured: "main_display" };
    },
  });

  const analyzeImage = tool({
    name: "analyze_image_frames",
    description: "Describe one or more image files (workspace, or explicit allowed media path).",
    parameters: {
      paths: z.string().describe("Comma-separated image paths"),
      question: z.string().default("Describe these images."),
    },
    implementation: async ({ paths, question }) => {
      try {
        const files = paths
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => resolveMediaFile(root, p, "image", opts.allowExternal));
        if (!files.length) return "Error: no image paths";
        if (files.length > 6) return "Error: max 6 images per call";
        return await describeImages(ctl, files, question, "image");
      } catch (err) {
        if (err instanceof UnsafeMediaPathError) return `Error: ${err.message}`;
        return err instanceof Error ? `Error: ${err.message}` : "Error: analyze failed";
      }
    },
  });

  return [listShots, take, describe, screenshotApp, analyzeImage];
}
