import { text, tool, type Tool } from "@lmstudio/sdk";
import { z } from "zod";

const VAGUE = [
  /\b(fix|improve|enhance|optimize|update|handle|deal with)\b/i,
  /\b(stuff|things|something|somehow|whatever|etc\.?)\b/i,
  /\b(good|nice|better|best|proper)\b/i,
  /\b(asap|soon|later|whenever)\b/i,
];

function detectDomain(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/\b(paper|arxiv|citation|literature|survey|ieee|neurips)\b/.test(p)) return "research";
  if (/\b(code|bug|refactor|implement|typescript|python|fix)\b/.test(p)) return "code";
  if (/\b(plan|multi-step|workflow|automate)\b/.test(p)) return "planning";
  if (/\b(search|news|current|today|website|url)\b/.test(p)) return "web";
  if (/\b(screenshot|audio|video|transcribe|ffmpeg|whisper)\b/.test(p)) return "media";
  return "general";
}

export function promptPrepTools(): Tool[] {
  const analyze = tool({
    name: "analyze_prompt",
    description: "Score a user prompt for clarity and list missing pieces before acting.",
    parameters: { prompt: z.string() },
    implementation: async ({ prompt }) => {
      const flags = VAGUE.filter((re) => re.test(prompt)).map((re) => re.source);
      const domain = detectDomain(prompt);
      const missing: string[] = [];
      if (!/\b(so that|goal|i need|i want|please)\b/i.test(prompt)) missing.push("goal");
      if (prompt.trim().split(/\s+/).length < 8) missing.push("detail");
      if (!/\b(must|don't|do not|never|only|constraint)\b/i.test(prompt)) missing.push("constraints");
      const score = Math.max(1, 10 - flags.length * 2 - missing.length);
      return {
        domain,
        clarity_score: score,
        vague_markers: flags,
        missing,
        recommendation: score < 7 ? "Call preprocess_prompt before acting." : "Prompt is usable.",
      };
    },
  });

  const preprocess = tool({
    name: "preprocess_prompt",
    description: text`
      Rewrite a vague or multi-step request into TASK / CONTEXT / CONSTRAINTS /
      DELIVERABLE / SUCCESS CRITERIA. Execute the rewritten prompt; ask only critical questions.
    `,
    parameters: { prompt: z.string() },
    implementation: async ({ prompt }) => {
      const domain = detectDomain(prompt);
      const hints: Record<string, string[]> = {
        research: ["search_literature / literature_review_brief", "Cite only returned papers"],
        code: ["Read existing files first", "Prefer small diffs; verify before claiming success"],
        planning: ["Break into steps", "Verify each step with tools"],
        web: ["web_search then fetch_url", "Do not invent current facts"],
        media: [
          "take_screenshot / describe_screenshot; get_audio_info / transcribe_audio; get_video_info / analyze_video_with_vision",
          "Prefer workspace files; do not crawl Voice Memos or Downloads",
        ],
        general: ["Use ping / get_local_datetime if time matters", "Ask only critical questions"],
      };
      return {
        domain,
        rewritten_prompt: [
          `TASK: ${prompt.trim()}`,
          "CONTEXT: Use only tool results and user-provided facts.",
          "CONSTRAINTS: No invented citations, dates, or personal details. Stay inside the workspace for files.",
          "DELIVERABLE: A concise, evidence-backed answer or artifact.",
          "SUCCESS CRITERIA: Every factual claim is backed by a tool result or the user's words.",
          `TOOLBOX HINTS: ${(hints[domain] ?? hints.general).join("; ")}`,
        ].join("\n"),
        critical_questions: [],
      };
    },
  });

  return [analyze, preprocess];
}
