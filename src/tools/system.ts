import { text, tool, type Tool } from "@lmstudio/sdk";

export function systemTools(): Tool[] {
  const pingTool = tool({
    name: "ping",
    description: "Health check. Returns immediately if the plugin is running.",
    parameters: {},
    implementation: async () => "llm-toolbox pong",
  });

  const datetimeTool = tool({
    name: "get_local_datetime",
    description: text`
      Return this machine's current local date and time. Call before answering
      anything about today, tonight, tomorrow, or relative dates. Never invent dates.
    `,
    parameters: {},
    implementation: async () => {
      const now = new Date();
      return {
        now_iso: now.toISOString(),
        local: now.toString(),
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        weekday: now.toLocaleDateString(undefined, { weekday: "long" }),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        rule: "Use these values for today/now. Do not use training-data dates.",
      };
    },
  });

  return [pingTool, datetimeTool];
}
