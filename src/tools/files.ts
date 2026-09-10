import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "fs";
import { dirname } from "path";
import { text, tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { PathEscapeError, resolveInWorkspace, workspaceRootLabel } from "../security/paths";

const MAX_READ_CHARS = 20_000;
const MAX_WRITE_BYTES = 500_000;

function err(exc: unknown): string {
  if (exc instanceof PathEscapeError) return `Error: ${exc.message}`;
  if (exc instanceof Error) return `Error: ${exc.message}`;
  return "Error: unexpected failure";
}

export function fileTools(ctl: ToolsProviderController): Tool[] {
  const root = ctl.getWorkingDirectory();

  const workspaceInfo = tool({
    name: "workspace_info",
    description: "Show the sandboxed workspace root used by file tools.",
    parameters: {},
    implementation: async () =>
      `workspace=${workspaceRootLabel(root)}\nfile tools are sandboxed here and cannot read your home folder`,
  });

  const listDir = tool({
    name: "list_dir",
    description: "List files and folders inside the workspace (relative path).",
    parameters: {
      path: z.string().default("."),
      max_entries: z.number().int().min(1).max(200).default(80),
    },
    implementation: async ({ path, max_entries }) => {
      try {
        const target = resolveInWorkspace(root, path || ".");
        if (!existsSync(target) || !statSync(target).isDirectory()) {
          return `Error: not a directory: ${path}`;
        }
        const entries = readdirSync(target, { withFileTypes: true }).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        const lines = entries.slice(0, max_entries).map((entry) => {
          const kind = entry.isDirectory() ? "dir" : "file";
          return `${kind}\t${entry.name}`;
        });
        if (entries.length > max_entries) {
          lines.push(`... truncated (${entries.length} total)`);
        }
        return [`dir=${target}`, `count=${entries.length}`, ...lines].join("\n");
      } catch (exc) {
        return err(exc);
      }
    },
  });

  const readFile = tool({
    name: "read_file",
    description: "Read a text file inside the workspace.",
    parameters: {
      path: z.string(),
      max_chars: z.number().int().min(200).max(MAX_READ_CHARS).default(MAX_READ_CHARS),
    },
    implementation: async ({ path, max_chars }) => {
      try {
        const filePath = resolveInWorkspace(root, path);
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          return `Error: file not found: ${path}`;
        }
        const textContent = readFileSync(filePath, "utf8");
        if (textContent.length > max_chars) {
          return `${textContent.slice(0, max_chars)}\n\n... truncated (${textContent.length} chars total)`;
        }
        return textContent;
      } catch (exc) {
        return err(exc);
      }
    },
  });

  const writeFile = tool({
    name: "write_file",
    description: "Write a text file inside the workspace. Refuses to overwrite unless overwrite=true.",
    parameters: {
      path: z.string(),
      content: z.string(),
      overwrite: z.boolean().default(false),
    },
    implementation: async ({ path, content, overwrite }) => {
      try {
        if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) {
          return `Error: content exceeds ${MAX_WRITE_BYTES} byte limit`;
        }
        const dest = resolveInWorkspace(root, path);
        if (existsSync(dest) && !overwrite) {
          return `Error: exists (set overwrite=true): ${path}`;
        }
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, content, "utf8");
        return `Wrote ${content.length} chars to workspace path ${path}`;
      } catch (exc) {
        return err(exc);
      }
    },
  });

  const replaceText = tool({
    name: "replace_text_in_file",
    description: "Replace exact text in a workspace file (not regex).",
    parameters: {
      path: z.string(),
      old_text: z.string(),
      new_text: z.string(),
      replace_all: z.boolean().default(false),
    },
    implementation: async ({ path, old_text, new_text, replace_all }) => {
      try {
        if (!old_text) return "Error: old_text is required";
        const filePath = resolveInWorkspace(root, path);
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          return `Error: file not found: ${path}`;
        }
        const current = readFileSync(filePath, "utf8");
        if (!current.includes(old_text)) return "Error: old_text not found in file";
        const count = current.split(old_text).length - 1;
        if (replace_all && count > 50) {
          return `Error: too many matches (${count}); refine old_text`;
        }
        const updated = replace_all
          ? current.replaceAll(old_text, new_text)
          : current.replace(old_text, new_text);
        writeFileSync(filePath, updated, "utf8");
        return `Replaced ${replace_all ? count : 1} occurrence(s) in ${path}`;
      } catch (exc) {
        return err(exc);
      }
    },
  });

  const deleteFile = tool({
    name: "delete_file",
    description: text`
      Delete a file inside the workspace. Directories are refused.
      This cannot delete files outside the chat working directory.
    `,
    parameters: { path: z.string() },
    implementation: async ({ path }) => {
      try {
        const target = resolveInWorkspace(root, path);
        if (!existsSync(target)) return `Error: not found: ${path}`;
        if (statSync(target).isDirectory()) {
          return "Error: refusing to delete directories; delete files only";
        }
        unlinkSync(target);
        return `Deleted workspace file ${path}`;
      } catch (exc) {
        return err(exc);
      }
    },
  });

  return [workspaceInfo, listDir, readFile, writeFile, replaceText, deleteFile];
}
