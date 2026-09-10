import { createConfigSchematics } from "@lmstudio/sdk";

export const configSchematics = createConfigSchematics()
  .field(
    "enableFiles",
    "boolean",
    {
      displayName: "Workspace files",
      hint: "Read/write files only inside this chat's LM Studio working directory. Paths cannot escape that folder.",
    },
    true,
  )
  .field(
    "enableWeb",
    "boolean",
    {
      displayName: "Web search + fetch",
      hint: "Search the public web and fetch http(s) pages. Private/localhost/metadata addresses are blocked.",
    },
    true,
  )
  .field(
    "enableResearch",
    "boolean",
    {
      displayName: "Literature search",
      hint: "Search OpenAlex, Crossref, and arXiv. No API key required. Cite only returned papers.",
    },
    true,
  )
  .field(
    "enableMemory",
    "boolean",
    {
      displayName: "Local memory",
      hint: "Store profile, facts, and rules on this machine under ~/.llm-toolbox/. Never invent personal details.",
    },
    true,
  )
  .field(
    "enableTodos",
    "boolean",
    {
      displayName: "Todos",
      hint: "Local todo list stored under ~/.llm-toolbox/.",
    },
    true,
  )
  .field(
    "enableAccuracy",
    "boolean",
    {
      displayName: "Accuracy helpers",
      hint: "Groundedness checks and claim verification. Does not browse your files.",
    },
    true,
  )
  .field(
    "enablePromptPrep",
    "boolean",
    {
      displayName: "Prompt prep",
      hint: "Analyze and rewrite vague prompts into a clear task spec before acting.",
    },
    true,
  )
  .field(
    "enableScreenshots",
    "boolean",
    {
      displayName: "Screenshots",
      hint: "Capture the main display to the workspace and describe it with a vision model. macOS Screen Recording permission required. Mail/Messages/password apps stay blocked unless you enable the sensitive option.",
    },
    true,
  )
  .field(
    "enableAudio",
    "boolean",
    {
      displayName: "Audio",
      hint: "Probe, clip, transcribe, and summarize audio. Workspace files always work. Explicit paths outside the workspace need the media-path toggle. Does not scan Voice Memos or Downloads.",
    },
    true,
  )
  .field(
    "enableVideo",
    "boolean",
    {
      displayName: "Video",
      hint: "Get info, extract keyframes, and describe videos with a vision model. Requires ffmpeg. Load a vision-capable model.",
    },
    true,
  )
  .field(
    "allowExternalMediaPaths",
    "boolean",
    {
      displayName: "Allow explicit media paths outside workspace",
      hint: "If on, you may pass an exact file path to audio/video/image tools. Secrets folders (.ssh, Keychains, Mail, Messages) are still blocked. The plugin will not crawl Desktop/Downloads/Voice Memos.",
    },
    true,
  )
  .field(
    "allowSensitiveScreenshots",
    "boolean",
    {
      displayName: "Allow sensitive-app screenshots",
      hint: "Keep off unless you want Mail, Messages, or password-app names unblocked.",
    },
    false,
  )
  .field(
    "maxFetchChars",
    "numeric",
    {
      displayName: "Max fetched page characters",
      hint: "Caps how much page text is returned to the model.",
      int: true,
      min: 1000,
      max: 20000,
      slider: { min: 1000, max: 20000, step: 1000 },
    },
    8000,
  )
  .build();

export const globalConfigSchematics = createConfigSchematics()
  .field(
    "contactEmail",
    "string",
    {
      displayName: "Polite-pool contact (optional)",
      hint: "Your email, used only in OpenAlex User-Agent for higher public rate limits. Leave empty to skip. Never sent to the model as a default identity.",
      isProtected: true,
      placeholder: "you@example.com",
    },
    "",
  )
  .build();
