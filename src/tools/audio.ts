import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { text, tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { ffmpegBin, ffprobeBin, findBin, runBin } from "../media/bins";
import { resolveMediaFile, UnsafeMediaPathError } from "../security/mediaPaths";

function audioDir(root: string): string {
  const dir = join(root, "_audio");
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function probeAudio(file: string): Promise<Record<string, unknown> | string> {
  const probe = ffprobeBin();
  if (!probe) {
    return {
      path: file,
      size_bytes: statSync(file).size,
      ffprobe: "missing — brew install ffmpeg",
    };
  }
  const result = await runBin(
    probe,
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file],
    20_000,
  );
  if (result.status !== 0) return `Error: ffprobe failed: ${result.stderr.slice(-400)}`;
  const data = JSON.parse(result.stdout || "{}") as {
    format?: Record<string, string>;
    streams?: { codec_type?: string; codec_name?: string; channels?: number; sample_rate?: string; duration?: string }[];
  };
  const audio = (data.streams || []).find((s) => s.codec_type === "audio") || {};
  return {
    path: file,
    duration_sec: data.format?.duration || audio.duration || "?",
    format: data.format?.format_name,
    codec: audio.codec_name,
    channels: audio.channels,
    sample_rate: audio.sample_rate,
  };
}

async function runWhisper(file: string, outDir: string, language: string): Promise<string> {
  const whisper = findBin("whisper");
  if (!whisper) {
    return "Error: whisper CLI not found. Install: pipx install openai-whisper  (or brew). Then retry.";
  }
  const args = [file, "--model", "base", "--output_format", "txt", "--output_dir", outDir];
  if (language.trim()) args.push("--language", language.trim());
  const result = await runBin(whisper, args, 120_000);
  if (result.status !== 0) return `Error: whisper failed: ${result.stderr.slice(-500)}`;
  return result.stdout.slice(0, 20_000) || "Transcription finished (see workspace _audio).";
}

export function audioTools(
  ctl: ToolsProviderController,
  opts: { allowExternal: boolean },
): Tool[] {
  const root = ctl.getWorkingDirectory();

  const listAudio = tool({
    name: "list_workspace_audio",
    description: text`
      List audio files in the workspace _audio folder only.
      Does not scan Voice Memos, Desktop, or Downloads.
      Copy files into the workspace (or pass an explicit path) to analyze them.
    `,
    parameters: {},
    implementation: async () => {
      const dir = audioDir(root);
      const files = readdirSync(dir)
        .filter((n) => /\.(m4a|mp3|wav|aac|flac|ogg|aiff|caf)$/i.test(n))
        .map((n) => {
          const p = join(dir, n);
          return { name: n, bytes: statSync(p).size };
        });
      return files.length
        ? files
        : "No workspace audio yet. Put files in _audio or pass a path to get_audio_info.";
    },
  });

  const info = tool({
    name: "get_audio_info",
    description: "Probe duration, codec, channels, and sample rate (needs ffmpeg/ffprobe).",
    parameters: { path: z.string() },
    implementation: async ({ path }) => {
      try {
        const file = resolveMediaFile(root, path, "audio", opts.allowExternal);
        return await probeAudio(file);
      } catch (err) {
        if (err instanceof UnsafeMediaPathError) return `Error: ${err.message}`;
        return err instanceof Error ? `Error: ${err.message}` : "Error: probe failed";
      }
    },
  });

  const transcribe = tool({
    name: "transcribe_audio",
    description: text`
      Transcribe an audio file with the whisper CLI if installed
      (\`brew install openai-whisper\` or a local whisper binary).
    `,
    parameters: {
      path: z.string(),
      language: z.string().default(""),
    },
    implementation: async ({ path, language }) => {
      try {
        const file = resolveMediaFile(root, path, "audio", opts.allowExternal);
        return await runWhisper(file, audioDir(root), language);
      } catch (err) {
        if (err instanceof UnsafeMediaPathError) return `Error: ${err.message}`;
        return err instanceof Error ? `Error: ${err.message}` : "Error: transcribe failed";
      }
    },
  });

  const analyze = tool({
    name: "analyze_audio",
    description: "Transcribe if possible, then return duration + transcript for summarization.",
    parameters: {
      path: z.string(),
      question: z.string().default("Summarize and extract action items."),
    },
    implementation: async ({ path, question }) => {
      try {
        const file = resolveMediaFile(root, path, "audio", opts.allowExternal);
        const infoResult = await probeAudio(file);
        const transcript = await runWhisper(file, audioDir(root), "");
        return { question, info: infoResult, transcript };
      } catch (err) {
        if (err instanceof UnsafeMediaPathError) return `Error: ${err.message}`;
        return err instanceof Error ? `Error: ${err.message}` : "Error: analyze failed";
      }
    },
  });

  const clip = tool({
    name: "extract_audio_clip",
    description: "Cut a clip from audio/video into workspace _audio (ffmpeg).",
    parameters: {
      path: z.string(),
      start_sec: z.number().min(0).default(0),
      duration_sec: z.number().min(1).max(300).default(30),
    },
    implementation: async ({ path, start_sec, duration_sec }) => {
      try {
        const file = resolveMediaFile(root, path, "audio", opts.allowExternal);
        const ffmpeg = ffmpegBin();
        if (!ffmpeg) return "Error: ffmpeg not found (brew install ffmpeg)";
        const out = join(audioDir(root), `clip_${Date.now()}.m4a`);
        const result = await runBin(
          ffmpeg,
          ["-y", "-ss", String(start_sec), "-t", String(duration_sec), "-i", file, "-vn", "-acodec", "aac", out],
          55_000,
        );
        if (result.status !== 0 || !existsSync(out)) {
          return `Error: ffmpeg failed: ${result.stderr.slice(-400)}`;
        }
        return { path: out, bytes: statSync(out).size };
      } catch (err) {
        if (err instanceof UnsafeMediaPathError) {
          try {
            const file = resolveMediaFile(root, path, "video", opts.allowExternal);
            const ffmpeg = ffmpegBin();
            if (!ffmpeg) return "Error: ffmpeg not found (brew install ffmpeg)";
            const out = join(audioDir(root), `clip_${Date.now()}.m4a`);
            const result = await runBin(
              ffmpeg,
              ["-y", "-ss", String(start_sec), "-t", String(duration_sec), "-i", file, "-vn", "-acodec", "aac", out],
              55_000,
            );
            if (result.status !== 0) return `Error: ffmpeg failed: ${result.stderr.slice(-400)}`;
            return { path: out, bytes: statSync(out).size };
          } catch (inner) {
            return inner instanceof Error ? `Error: ${inner.message}` : "Error: extract failed";
          }
        }
        return err instanceof Error ? `Error: ${err.message}` : "Error: extract failed";
      }
    },
  });

  return [listAudio, info, transcribe, analyze, clip];
}
