import { text, tool, type Tool } from "@lmstudio/sdk";
import { z } from "zod";
import { htmlToText, safeFetch } from "../security/fetch";
import { UnsafeUrlError } from "../security/urls";

type SearchHit = { title: string; url: string; snippet: string; source: string };

function unwrapDuckUrl(href: string): string | null {
  try {
    const url = new URL(href, "https://html.duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    if (uddg) return uddg;
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    return null;
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(query: string, max: number): Promise<SearchHit[]> {
  const form = new URLSearchParams({ q: query });
  const page = await safeFetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (page.status >= 400) return [];

  const hits: SearchHit[] = [];
  const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(page.body)) && hits.length < max) {
    const url = unwrapDuckUrl(match[1].replace(/&amp;/g, "&"));
    if (!url) continue;
    const title = htmlToText(match[2], 160);
    hits.push({ title, url, snippet: "", source: "duckduckgo" });
  }
  return hits;
}

async function searchWikipedia(query: string, max: number): Promise<SearchHit[]> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", String(max));
  url.searchParams.set("format", "json");
  url.searchParams.set("utf8", "1");
  const page = await safeFetch(url.toString());
  if (page.status >= 400) return [];
  const data = JSON.parse(page.body) as {
    query?: { search?: { title: string; snippet: string; pageid: number }[] };
  };
  return (data.query?.search ?? []).map((row) => ({
    title: row.title,
    url: `https://en.wikipedia.org/?curid=${row.pageid}`,
    snippet: htmlToText(row.snippet || "", 240),
    source: "wikipedia",
  }));
}

export function webTools(maxFetchChars: number): Tool[] {
  const searchTool = tool({
    name: "web_search",
    description: text`
      Search the live public web. Returns titles, URLs, and snippets.
      For current facts, call this then fetch_url on the best 1–2 links.
      Do not invent answers from training data.
    `,
    parameters: {
      query: z.string(),
      max_results: z.number().int().min(1).max(8).default(5),
    },
    implementation: async ({ query, max_results }) => {
      const q = query.trim();
      if (!q) return "Error: empty query";
      try {
        const [ddg, wiki] = await Promise.allSettled([
          searchDuckDuckGo(q, max_results),
          searchWikipedia(q, Math.min(3, max_results)),
        ]);
        const hits: SearchHit[] = [];
        if (ddg.status === "fulfilled") hits.push(...ddg.value);
        if (wiki.status === "fulfilled") hits.push(...wiki.value);
        const seen = new Set<string>();
        const unique = hits.filter((hit) => {
          if (seen.has(hit.url)) return false;
          seen.add(hit.url);
          return true;
        });
        if (!unique.length) {
          return "No search results. Try a more canonical term.";
        }
        return {
          results: unique.slice(0, max_results),
          hint: "If a result looks relevant, call fetch_url before answering. Do not invent facts.",
        };
      } catch (exc) {
        if (exc instanceof UnsafeUrlError) return `Error: ${exc.message}`;
        return "Error: search failed";
      }
    },
  });

  const fetchTool = tool({
    name: "fetch_url",
    description: text`
      Fetch a public http(s) URL and return readable text (HTML stripped).
      Private, localhost, link-local, and cloud-metadata addresses are blocked.
    `,
    parameters: {
      url: z.string(),
      max_chars: z.number().int().min(500).max(20000).optional(),
    },
    implementation: async ({ url, max_chars }) => {
      try {
        const cap = Math.min(max_chars ?? maxFetchChars, 20_000);
        const page = await safeFetch(url);
        if (page.status >= 400) {
          return `Error fetching URL (${page.status}): ${page.url}`;
        }
        const body = page.contentType.includes("json")
          ? page.body.slice(0, cap)
          : htmlToText(page.body, cap);
        return {
          url: page.url,
          status: page.status,
          note: "Extract facts from this content. If a date/score is missing, search again — do not invent.",
          text: body,
        };
      } catch (exc) {
        if (exc instanceof UnsafeUrlError) return `Error: ${exc.message}`;
        return "Error: fetch failed";
      }
    },
  });

  return [searchTool, fetchTool];
}
