import { text, tool, type Tool } from "@lmstudio/sdk";
import { z } from "zod";
import { PLUGIN_USER_AGENT, safeFetch } from "../security/fetch";
import { UnsafeUrlError } from "../security/urls";

type Paper = {
  id: string;
  source: string;
  title: string;
  abstract: string;
  authors: string[];
  published: string;
  venue: string;
  url: string;
  doi: string;
};

function headers(contactEmail: string): Record<string, string> {
  const ua = contactEmail.trim()
    ? `${PLUGIN_USER_AGENT} mailto:${contactEmail.trim()}`
    : PLUGIN_USER_AGENT;
  return { "User-Agent": ua, Accept: "application/json" };
}

async function searchOpenAlex(query: string, limit: number, contactEmail: string): Promise<Paper[]> {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(limit));
  url.searchParams.set("sort", "relevance_score:desc");
  const page = await safeFetch(url.toString(), { headers: headers(contactEmail) });
  if (page.status >= 400) return [];
  const data = JSON.parse(page.body) as {
    results?: {
      id?: string;
      display_name?: string;
      publication_year?: number;
      doi?: string;
      abstract_inverted_index?: Record<string, number[]>;
      authorships?: { author?: { display_name?: string } }[];
      primary_location?: { source?: { display_name?: string }; landing_page_url?: string };
    }[];
  };
  return (data.results ?? []).map((row) => {
    const abstract = row.abstract_inverted_index
      ? Object.entries(row.abstract_inverted_index)
          .flatMap(([word, idx]) => idx.map((i) => ({ i, word })))
          .sort((a, b) => a.i - b.i)
          .map((x) => x.word)
          .join(" ")
          .slice(0, 800)
      : "";
    return {
      id: row.id || "",
      source: "openalex",
      title: row.display_name || "",
      abstract,
      authors: (row.authorships ?? []).map((a) => a.author?.display_name || "").filter(Boolean).slice(0, 8),
      published: row.publication_year ? String(row.publication_year) : "",
      venue: row.primary_location?.source?.display_name || "",
      url: row.primary_location?.landing_page_url || row.id || "",
      doi: (row.doi || "").replace("https://doi.org/", ""),
    };
  });
}

async function searchCrossref(query: string, limit: number, contactEmail: string): Promise<Paper[]> {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query", query);
  url.searchParams.set("rows", String(limit));
  url.searchParams.set("select", "DOI,title,author,published,container-title,URL,abstract");
  const page = await safeFetch(url.toString(), { headers: headers(contactEmail) });
  if (page.status >= 400) return [];
  const data = JSON.parse(page.body) as {
    message?: {
      items?: {
        DOI?: string;
        title?: string[];
        author?: { given?: string; family?: string }[];
        published?: { "date-parts"?: number[][] };
        "container-title"?: string[];
        URL?: string;
        abstract?: string;
      }[];
    };
  };
  return (data.message?.items ?? []).map((row) => ({
    id: row.DOI ? `doi:${row.DOI}` : row.URL || "",
    source: "crossref",
    title: (row.title && row.title[0]) || "",
    abstract: (row.abstract || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800),
    authors: (row.author ?? [])
      .map((a) => [a.given, a.family].filter(Boolean).join(" "))
      .filter(Boolean)
      .slice(0, 8),
    published: row.published?.["date-parts"]?.[0]?.[0] ? String(row.published["date-parts"][0][0]) : "",
    venue: (row["container-title"] && row["container-title"][0]) || "",
    url: row.URL || (row.DOI ? `https://doi.org/${row.DOI}` : ""),
    doi: row.DOI || "",
  }));
}

async function searchArxiv(query: string, limit: number): Promise<Paper[]> {
  const q = query.includes(":") ? query : `all:"${query}"`;
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", q);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(limit));
  url.searchParams.set("sortBy", "relevance");
  const page = await safeFetch(url.toString());
  if (page.status >= 400) return [];
  const papers: Paper[] = [];
  const entries = page.body.split("<entry>").slice(1);
  for (const raw of entries) {
    const title = (raw.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    const summary = (raw.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || "";
    const published = ((raw.match(/<published>([\s\S]*?)<\/published>/) || [])[1] || "").slice(0, 10);
    const id = (raw.match(/<id>([\s\S]*?)<\/id>/) || [])[1] || "";
    const arxivId = id.includes("/abs/") ? id.split("/abs/").pop() || id : id;
    const authors = [...raw.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim()).slice(0, 8);
    papers.push({
      id: `arxiv:${arxivId}`,
      source: "arxiv",
      title: title.replace(/\s+/g, " ").trim(),
      abstract: summary.replace(/\s+/g, " ").trim().slice(0, 800),
      authors,
      published,
      venue: "arXiv preprint",
      url: `https://arxiv.org/abs/${arxivId}`,
      doi: "",
    });
  }
  return papers;
}

function dedupe(papers: Paper[]): Paper[] {
  const seen = new Set<string>();
  const out: Paper[] = [];
  for (const paper of papers) {
    const key = (paper.doi || paper.title).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(paper);
  }
  return out;
}

async function runLiteratureSearch(
  query: string,
  maxResults: number,
  contactEmail: string,
): Promise<{ count: number; papers: Paper[]; rule: string } | string> {
  const q = query.trim();
  if (!q) return "Error: empty query";
  const per = Math.min(maxResults, 8);
  const settled = await Promise.allSettled([
    searchOpenAlex(q, per, contactEmail),
    searchCrossref(q, per, contactEmail),
    searchArxiv(q, per),
  ]);
  const papers = dedupe(
    settled.flatMap((s) => (s.status === "fulfilled" ? s.value : [])),
  ).slice(0, maxResults);
  if (!papers.length) return "No papers found. Try a more canonical scholarly term.";
  return {
    count: papers.length,
    papers,
    rule: "Cite only these papers. If a claim is not supported here, say so.",
  };
}

export function researchTools(contactEmail: string): Tool[] {
  const search = tool({
    name: "search_literature",
    description: text`
      Search OpenAlex, Crossref, and arXiv for scholarly papers. No API key required.
      Cite ONLY papers returned here. Never invent titles, DOIs, or citations.
    `,
    parameters: {
      query: z.string(),
      max_results: z.number().int().min(1).max(12).default(6),
    },
    implementation: async ({ query, max_results }) => {
      try {
        return await runLiteratureSearch(query, max_results, contactEmail);
      } catch (exc) {
        if (exc instanceof UnsafeUrlError) return `Error: ${exc.message}`;
        return "Error: literature search failed";
      }
    },
  });

  const brief = tool({
    name: "literature_review_brief",
    description: text`
      Search literature and return a compact briefing: titles, years, venues, URLs.
      Do not add papers that were not returned by the search.
    `,
    parameters: {
      query: z.string(),
      max_results: z.number().int().min(3).max(10).default(6),
    },
    implementation: async ({ query, max_results }) => {
      let raw: Awaited<ReturnType<typeof runLiteratureSearch>>;
      try {
        raw = await runLiteratureSearch(query, max_results, contactEmail);
      } catch (exc) {
        if (exc instanceof UnsafeUrlError) return `Error: ${exc.message}`;
        return "Error: literature search failed";
      }
      if (typeof raw === "string") return raw;
      const lines = raw.papers.map((p, i) => {
        const authors = p.authors.slice(0, 3).join(", ");
        const year = p.published || "n.d.";
        const doi = p.doi ? ` doi:${p.doi}` : "";
        return `${i + 1}. ${p.title} (${year}, ${p.venue || p.source}) — ${authors}. ${p.url}${doi}`;
      });
      return ["LITERATURE BRIEF — cite only the entries below.", ...lines].join("\n");
    },
  });

  return [search, brief];
}
