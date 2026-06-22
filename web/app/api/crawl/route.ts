import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Config ────────────────────────────────────────────────────────────────────
const MAX_PAGES     = 40;
const MAX_DEPTH     = 3;
const DELAY_MS      = 220;
const CHUNK_SIZE    = 700;
const CHUNK_OVERLAP = 120;
const TIMEOUT_MS    = 14_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalise(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/"))
      u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch { return url; }
}

function extractLinks($: cheerio.CheerioAPI, base: string, origin: string): string[] {
  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const abs = new URL(href, base).toString();
      const u   = new URL(abs);
      if (
        u.origin === origin &&
        (u.protocol === "http:" || u.protocol === "https:") &&
        !/\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|woff2?|ttf|pdf|zip|mp4|mp3)(\?|$)/i.test(u.pathname)
      ) links.push(normalise(abs));
    } catch { /* skip */ }
  });
  return [...new Set(links)];
}

/**
 * Pull readable text from a page.
 *
 * Strategy (ordered by reliability):
 * 1. Meta tags — always present even on React/JS-rendered sites
 * 2. Page title
 * 3. Headings h1–h5
 * 4. Body paragraphs, lists, tables, product/service/feature content
 *
 * We deliberately keep <header> body text — many brand sites put their
 * hero tagline and key services inside <header>.  We only strip <nav>
 * inside headers, pure navigation elements, and script/style tags.
 */
function extractText($: cheerio.CheerioAPI, url: string): string {
  const parts: string[] = [];

  // ── 1. Meta tags (work even when JS hasn't rendered the page) ─────────────
  const metaDesc  = $('meta[name="description"]').attr("content")?.trim();
  const ogTitle   = $('meta[property="og:title"]').attr("content")?.trim();
  const ogDesc    = $('meta[property="og:description"]').attr("content")?.trim();
  const ogSite    = $('meta[property="og:site_name"]').attr("content")?.trim();
  const twDesc    = $('meta[name="twitter:description"]').attr("content")?.trim();
  const kwds      = $('meta[name="keywords"]').attr("content")?.trim();

  const pageTitle = $("title").text().trim();

  if (pageTitle)                          parts.push(`Page: ${pageTitle}`);
  if (ogSite && ogSite !== pageTitle)     parts.push(`Brand: ${ogSite}`);
  if (ogTitle && ogTitle !== pageTitle)   parts.push(`Title: ${ogTitle}`);
  if (metaDesc)                           parts.push(`Description: ${metaDesc}`);
  if (ogDesc && ogDesc !== metaDesc)      parts.push(`About: ${ogDesc}`);
  if (twDesc && twDesc !== metaDesc && twDesc !== ogDesc) parts.push(`Summary: ${twDesc}`);
  if (kwds)                               parts.push(`Keywords: ${kwds}`);

  // ── 2. Strip only true noise — NOT <header> body text ─────────────────────
  $(
    "script, style, noscript, iframe, " +
    "nav, [role='navigation'], " +           // navigation menus only
    ".cookie-banner, .cookie-consent, #cookie-notice, #cookie-bar, " +
    ".ad, .ads, .advertisement, " +
    "[aria-hidden='true']"
  ).remove();

  // ── 3. Structured heading extraction ──────────────────────────────────────
  $("h1, h2, h3, h4, h5").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 2) parts.push(`# ${t}`);
  });

  // ── 4. Body content ───────────────────────────────────────────────────────
  $(
    "p, li, td, th, dt, dd, blockquote, " +
    "[class*='hero'], [class*='tagline'], [class*='slogan'], " +
    "[class*='service'], [class*='feature'], [class*='benefit'], " +
    "[class*='product'], [class*='price'], [class*='plan'], " +
    "[class*='description'], [class*='about'], [class*='overview'], " +
    "[class*='card'], [class*='item'], [class*='text'], " +
    "[class*='content'], [class*='intro'], [class*='summary']"
  ).each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 15) parts.push(t);   // lower bar — short phrases matter
  });

  // Deduplicate exact duplicates while preserving order
  const seen  = new Set<string>();
  const final = parts.filter((v) => {
    const k = v.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return `[Source: ${url}]\n\n` + final.join("\n");
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + CHUNK_SIZE));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.trim().length > 20);
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res   = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "AgentOS-Crawler/1.0 (+https://agentos.ai/bot)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return null;
    return await res.text();
  } catch { return null; }
}

// ── POST /api/crawl ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // `extraUrls` — additional seed pages to force-crawl even if not linked
  // (useful when JS nav menus hide links from cheerio)
  const { url, extraUrls = [], accountId = "demo", replace = true } = await req.json();
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  let startUrl: URL;
  try {
    startUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const origin = startUrl.origin;

  // Parse + validate extra seed URLs (must be same domain)
  const extraSeeds: string[] = [];
  for (const raw of extraUrls as string[]) {
    try {
      const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      if (u.origin === origin) extraSeeds.push(normalise(u.toString()));
    } catch { /* skip invalid */ }
  }

  // 1. Delete existing chunks from this domain ────────────────────────────────
  if (replace) {
    await supabase
      .from("knowledge_base")
      .delete()
      .eq("account_id", accountId)
      .like("source", `${origin}%`);
  }

  // 2. BFS crawl — seed with root URL + any extra pages the user specified ───
  type QueueItem = { url: string; depth: number };
  const queue: QueueItem[] = [
    { url: normalise(startUrl.toString()), depth: 0 },
    // Extra seeds go in at depth 0 so they're always crawled even if
    // they aren't reachable from the homepage via static HTML links
    ...extraSeeds.map((u) => ({ url: u, depth: 0 })),
  ];
  const visited = new Set<string>();
  const allText: { url: string; text: string }[] = [];

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const item = queue.shift()!;
    if (visited.has(item.url)) continue;
    visited.add(item.url);

    const html = await fetchPage(item.url);
    if (!html) continue;

    const $    = cheerio.load(html);
    const text = extractText($, item.url);

    // Lower threshold — even meta-only pages are valuable
    if (text.trim().length > 30) {
      allText.push({ url: item.url, text });
    }

    if (item.depth < MAX_DEPTH) {
      const links = extractLinks($, item.url, origin);
      for (const link of links) {
        if (!visited.has(link)) queue.push({ url: link, depth: item.depth + 1 });
      }
    }

    if (queue.length > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  if (allText.length === 0) {
    return NextResponse.json({
      error: "No readable content found. The site may be fully JS-rendered (SPA). Try adding an OpenAI key and re-crawling, or paste your content manually.",
      pages: 0, chunks: 0,
    }, { status: 422 });
  }

  // 3. Chunk ─────────────────────────────────────────────────────────────────
  const allChunks: { content: string; source: string }[] = [];
  for (const { url: pageUrl, text } of allText) {
    for (const chunk of chunkText(text)) {
      allChunks.push({ content: chunk, source: pageUrl });
    }
  }

  // 4. Embed (if OpenAI key present) + insert ────────────────────────────────
  const BATCH = 96;
  let totalInserted     = 0;
  let embeddingsEnabled = false;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  for (let i = 0; i < allChunks.length; i += BATCH) {
    const batch = allChunks.slice(i, i + BATCH);
    const texts = batch.map((c) => c.content);

    let embeddings: (number[] | null)[] = texts.map(() => null);

    if (hasOpenAI) {
      try {
        const result = await embedMany({
          model: openai.embedding("text-embedding-3-small"),
          values: texts,
        });
        embeddings = result.embeddings;
        embeddingsEnabled = true;
      } catch (e) {
        console.warn("[crawl] embedMany failed — keyword search still works:", e);
      }
    }

    const rows = batch.map((c, j) => ({
      account_id: accountId,
      content:    c.content,
      source:     c.source,
      embedding:  embeddings[j]?.length ? JSON.stringify(embeddings[j]) : null,
    }));

    const { error } = await supabase.from("knowledge_base").insert(rows);
    if (error) console.error("[crawl] insert error:", error.message);
    else totalInserted += rows.length;
  }

  return NextResponse.json({
    success:          true,
    domain:           origin,
    pages:            allText.length,
    chunks:           totalInserted,
    replaced:         replace,
    searchMode:       embeddingsEnabled ? "vector+keyword" : "keyword",
  });
}

// ── GET /api/crawl — list crawled domains ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId") ?? "demo";
  const { data } = await supabase
    .from("knowledge_base")
    .select("source")
    .eq("account_id", accountId)
    .not("source", "is", null);

  const domains = [...new Set(
    (data ?? [])
      .map((r) => { try { return new URL(r.source).origin; } catch { return null; } })
      .filter(Boolean)
  )];

  return NextResponse.json({ domains });
}
