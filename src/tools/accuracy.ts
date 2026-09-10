import { text, tool, type Tool } from "@lmstudio/sdk";
import { z } from "zod";
import { nowIso, readJson, writeJson } from "../store/jsonStore";

type Correction = { claim: string; correction: string; saved_at: string };

export function accuracyTools(): Tool[] {
  const rules = tool({
    name: "accuracy_rules",
    description: "Return anti-hallucination rules the model must follow when using this plugin.",
    parameters: {},
    implementation: async () =>
      text`
        ACCURACY RULES
        1. Never invent dates, scores, citations, URLs, or tool results.
        2. Use get_local_datetime for "today" / relative time.
        3. Cite only papers returned by search_literature.
        4. After web_search, fetch_url before stating page-specific facts.
        5. Never claim a tool succeeded without a tool result.
        6. If evidence is missing, say so and ask or search again.
        7. Do not store passwords, API keys, or government IDs in memory.
      `,
  });

  const grounded = tool({
    name: "groundedness_check",
    description: "Check whether a draft claim is supported by provided evidence text.",
    parameters: {
      claim: z.string(),
      evidence: z.string(),
    },
    implementation: async ({ claim, evidence }) => {
      const ev = evidence.toLowerCase();
      const tokens = claim
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 3);
      const hits = tokens.filter((t) => ev.includes(t));
      const ratio = tokens.length ? hits.length / tokens.length : 0;
      const supported = ratio >= 0.45 && evidence.trim().length > 20;
      return {
        supported,
        overlap: Number(ratio.toFixed(2)),
        matched_tokens: hits.slice(0, 20),
        guidance: supported
          ? "Evidence overlaps the claim. Still quote conservatively."
          : "Weak overlap. Do not assert this claim; search or qualify it.",
      };
    },
  });

  const verify = tool({
    name: "verify_claim",
    description:
      "Record a claim the model wants to make and return a reminder to verify it with tools first.",
    parameters: {
      claim: z.string(),
      already_verified_with_tools: z.boolean().default(false),
    },
    implementation: async ({ claim, already_verified_with_tools }) => {
      if (!already_verified_with_tools) {
        return {
          ok: false,
          claim,
          next: "Call web_search, fetch_url, or search_literature before asserting this.",
        };
      }
      return { ok: true, claim, note: "Mark as verified only if a prior tool result supports it." };
    },
  });

  const record = tool({
    name: "record_correction",
    description: "Save a user correction so the same mistake is less likely next time.",
    parameters: {
      claim: z.string(),
      correction: z.string(),
    },
    implementation: async ({ claim, correction }) => {
      const rows = readJson<Correction[]>("accuracy/corrections.json", []);
      const list = Array.isArray(rows) ? rows : [];
      list.push({
        claim: claim.trim().slice(0, 500),
        correction: correction.trim().slice(0, 500),
        saved_at: nowIso(),
      });
      writeJson("accuracy/corrections.json", list.slice(-100));
      return { ok: true, stored: list.length };
    },
  });

  return [rules, grounded, verify, record];
}
