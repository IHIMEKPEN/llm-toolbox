import { type Tool, type ToolsProviderController } from "@lmstudio/sdk";
import { configSchematics, globalConfigSchematics } from "./configSchematics";
import { accuracyTools } from "./tools/accuracy";
import { audioTools } from "./tools/audio";
import { fileTools } from "./tools/files";
import { memoryTools } from "./tools/memory";
import { promptPrepTools } from "./tools/promptPrep";
import { researchTools } from "./tools/research";
import { screenshotTools } from "./tools/screenshot";
import { systemTools } from "./tools/system";
import { todoTools } from "./tools/todos";
import { videoTools } from "./tools/video";
import { webTools } from "./tools/web";

export async function toolsProvider(ctl: ToolsProviderController) {
  const config = ctl.getPluginConfig(configSchematics);
  const globalConfig = ctl.getGlobalPluginConfig(globalConfigSchematics);
  const contactEmail = String(globalConfig.get("contactEmail") || "");
  const maxFetchChars = Number(config.get("maxFetchChars") || 8000);
  const allowExternal = Boolean(config.get("allowExternalMediaPaths"));
  const allowSensitive = Boolean(config.get("allowSensitiveScreenshots"));

  const tools: Tool[] = [...systemTools()];

  if (config.get("enableFiles")) tools.push(...fileTools(ctl));
  if (config.get("enableWeb")) tools.push(...webTools(maxFetchChars));
  if (config.get("enableResearch")) tools.push(...researchTools(contactEmail));
  if (config.get("enableMemory")) tools.push(...memoryTools());
  if (config.get("enableTodos")) tools.push(...todoTools());
  if (config.get("enableAccuracy")) tools.push(...accuracyTools());
  if (config.get("enablePromptPrep")) tools.push(...promptPrepTools());
  if (config.get("enableScreenshots")) {
    tools.push(...screenshotTools(ctl, { allowExternal, allowSensitive }));
  }
  if (config.get("enableAudio")) tools.push(...audioTools(ctl, { allowExternal }));
  if (config.get("enableVideo")) tools.push(...videoTools(ctl, { allowExternal }));

  return tools;
}
