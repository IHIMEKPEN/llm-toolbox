import { text, tool, type Tool } from "@lmstudio/sdk";
import { z } from "zod";
import { nowIso, readJson, writeJson } from "../store/jsonStore";

type Profile = Record<string, string>;
type Fact = { id: string; text: string; saved_at: string };
type Rule = { id: string; text: string; saved_at: string };

const MAX_ITEM_CHARS = 2_000;
const MAX_FACTS = 200;
const MAX_RULES = 50;

function clip(value: string): string {
  return value.trim().slice(0, MAX_ITEM_CHARS);
}

function loadProfile(): Profile {
  const data = readJson<Profile>("memory/profile.json", {});
  return data && typeof data === "object" ? data : {};
}

function loadFacts(): Fact[] {
  const data = readJson<Fact[]>("memory/facts.json", []);
  return Array.isArray(data) ? data : [];
}

function loadRules(): Rule[] {
  const data = readJson<Rule[]>("memory/rules.json", []);
  return Array.isArray(data) ? data : [];
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function memoryTools(): Tool[] {
  const loadContext = tool({
    name: "load_user_context",
    description: text`
      Load local personal context (profile + rules + facts) stored on this machine.
      Treat it as ground truth. Never invent personal details that are not in memory.
      Call at the start of substantive chats when memory is relevant.
    `,
    parameters: {},
    implementation: async () => {
      const profile = loadProfile();
      const rules = loadRules();
      const facts = loadFacts();
      return {
        loaded_at: nowIso(),
        profile: Object.keys(profile).length ? profile : "(empty)",
        rules: rules.length ? rules.map((r) => r.text) : [],
        facts: facts.slice(-50).map((f) => f.text),
        hint: "Never invent personal details. Ask before saving new facts.",
      };
    },
  });

  const getProfile = tool({
    name: "get_profile",
    description: "Return the locally stored user profile fields.",
    parameters: {},
    implementation: async () => loadProfile(),
  });

  const updateProfile = tool({
    name: "update_profile",
    description: "Merge key/value fields into the local profile. Values must come from the user.",
    parameters: {
      fields_json: z
        .string()
        .describe('JSON object of string fields, e.g. {"display_name":"Ada","timezone":"UTC"}'),
    },
    implementation: async ({ fields_json }) => {
      let incoming: unknown;
      try {
        incoming = JSON.parse(fields_json);
      } catch {
        return "Error: fields_json must be valid JSON";
      }
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
        return "Error: fields_json must be an object";
      }
      const profile = loadProfile();
      for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
        const k = clip(String(key)).slice(0, 64);
        if (!k || value == null) continue;
        profile[k] = clip(String(value));
      }
      writeJson("memory/profile.json", { ...profile, updated_at: nowIso() });
      return { ok: true, profile };
    },
  });

  const remember = tool({
    name: "remember_fact",
    description: "Save a durable fact the user stated. Do not save secrets (passwords, tokens, SSNs).",
    parameters: { fact: z.string() },
    implementation: async ({ fact }) => {
      const textValue = clip(fact);
      if (!textValue) return "Error: fact is required";
      const facts = loadFacts();
      facts.push({ id: newId(), text: textValue, saved_at: nowIso() });
      writeJson("memory/facts.json", facts.slice(-MAX_FACTS));
      return { ok: true, saved: textValue };
    },
  });

  const searchMemory = tool({
    name: "search_memory",
    description: "Search saved facts and profile values for a query string.",
    parameters: { query: z.string() },
    implementation: async ({ query }) => {
      const q = query.trim().toLowerCase();
      if (!q) return "Error: empty query";
      const profile = loadProfile();
      const facts = loadFacts();
      const hits = [
        ...Object.entries(profile)
          .filter(([k, v]) => `${k} ${v}`.toLowerCase().includes(q))
          .map(([k, v]) => ({ kind: "profile", key: k, text: v })),
        ...facts
          .filter((f) => f.text.toLowerCase().includes(q))
          .map((f) => ({ kind: "fact", id: f.id, text: f.text })),
      ];
      return { count: hits.length, hits: hits.slice(0, 30) };
    },
  });

  const forget = tool({
    name: "forget_fact",
    description: "Delete a saved fact by id or by exact/substring text.",
    parameters: { fact_or_id: z.string() },
    implementation: async ({ fact_or_id }) => {
      const needle = fact_or_id.trim().toLowerCase();
      const facts = loadFacts();
      const kept = facts.filter(
        (f) => f.id.toLowerCase() !== needle && !f.text.toLowerCase().includes(needle),
      );
      writeJson("memory/facts.json", kept);
      return { ok: true, removed: facts.length - kept.length };
    },
  });

  const addRule = tool({
    name: "add_user_rule",
    description: "Add a standing rule the model should follow (e.g. always ask before sending email).",
    parameters: { rule: z.string() },
    implementation: async ({ rule }) => {
      const textValue = clip(rule);
      if (!textValue) return "Error: rule is required";
      const rules = loadRules();
      if (rules.length >= MAX_RULES) return `Error: max ${MAX_RULES} rules`;
      rules.push({ id: newId(), text: textValue, saved_at: nowIso() });
      writeJson("memory/rules.json", rules);
      return { ok: true, id: rules[rules.length - 1].id };
    },
  });

  const listRules = tool({
    name: "list_user_rules",
    description: "List standing user rules.",
    parameters: {},
    implementation: async () => loadRules(),
  });

  const removeRule = tool({
    name: "remove_user_rule",
    description: "Remove a standing rule by id or matching text.",
    parameters: { rule_or_id: z.string() },
    implementation: async ({ rule_or_id }) => {
      const needle = rule_or_id.trim().toLowerCase();
      const rules = loadRules();
      const kept = rules.filter(
        (r) => r.id.toLowerCase() !== needle && !r.text.toLowerCase().includes(needle),
      );
      writeJson("memory/rules.json", kept);
      return { ok: true, removed: rules.length - kept.length };
    },
  });

  return [
    loadContext,
    getProfile,
    updateProfile,
    remember,
    searchMemory,
    forget,
    addRule,
    listRules,
    removeRule,
  ];
}
