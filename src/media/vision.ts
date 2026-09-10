import { type FileHandle, type ToolsProviderController } from "@lmstudio/sdk";

export async function describeImages(
  ctl: ToolsProviderController,
  imagePaths: string[],
  question: string,
  kind: "screenshot" | "video" | "image",
): Promise<string> {
  if (!imagePaths.length) return "Error: no images to describe";
  const handles: FileHandle[] = [];
  for (const path of imagePaths) {
    handles.push(await ctl.client.files.prepareImage(path));
  }
  const prefix =
    kind === "screenshot"
      ? "You are verifying a screenshot. Read visible text, headings, buttons, and layout. Be concrete. Never say you cannot see images."
      : "You are describing visual frames for someone who cannot watch them. Be chronological and concrete. Do not mention file paths.";
  const model = await ctl.client.llm.model();
  const result = await model.respond(
    [
      {
        role: "user",
        content: `${prefix}\n\nUser question: ${question.trim() || "Describe what is visible."}\nThere are ${imagePaths.length} image(s) attached.`,
        images: handles,
      },
    ],
    { signal: ctl.abortSignal },
  );
  return result.content.trim() || "Error: empty vision response. Load a vision-capable model.";
}
