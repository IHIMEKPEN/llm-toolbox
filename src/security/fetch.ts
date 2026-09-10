import { outboundLimiter } from "./rateLimit";
import { assertResolvesPublic, parsePublicHttpUrl, UnsafeUrlError } from "./urls";

export const PLUGIN_USER_AGENT =
  "LLM-Toolbox/1.0 (https://lmstudio.ai/oihimekpen/llm-toolbox)";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 1_500_000;

export type SafeFetchOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  timeoutMs?: number;
  maxBytes?: number;
};

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<{ url: string; status: number; contentType: string; body: string }> {
  if (!outboundLimiter.try()) {
    throw new UnsafeUrlError("rate limit: too many outbound requests, try again shortly");
  }

  let current = parsePublicHttpUrl(rawUrl);
  await assertResolvesPublic(current);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const method = options.method ?? "GET";

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        method: hop === 0 ? method : "GET",
        headers: {
          "User-Agent": PLUGIN_USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
          ...(options.headers ?? {}),
        },
        body: hop === 0 ? options.body : undefined,
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new UnsafeUrlError(`request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new UnsafeUrlError("redirect missing Location header");
      }
      if (hop === MAX_REDIRECTS) {
        throw new UnsafeUrlError("too many redirects");
      }
      current = parsePublicHttpUrl(new URL(location, current).toString());
      await assertResolvesPublic(current);
      continue;
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new UnsafeUrlError(`response exceeds ${maxBytes} byte limit`);
    }
    return {
      url: current.toString(),
      status: response.status,
      contentType,
      body: buf.toString("utf8"),
    };
  }

  throw new UnsafeUrlError("too many redirects");
}

export function htmlToText(html: string, maxChars: number): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > maxChars) {
    return `${text.slice(0, maxChars)}...[truncated]`;
  }
  return text;
}
