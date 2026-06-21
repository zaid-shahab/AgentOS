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
const MAX_PAGES   = 40;
const MAX_DEPTH   = 3;
const DELAY_MS    = 250;   // polite delay between fetches
const CHUNK_SIZE  = 600;
const CHUNK_OVERLAP = 100;
const TIMEOUT_MS  = 12_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise a URL: strip fragment, trailing slash, lowercase host */
function normalise(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    // remove trailing slash on non-root paths
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** Extract same-domain absolute links from an HTML document */
function extractLinks($: cheerio.CheerioAPI, base: string, origin: string): string[] {
  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const abs = new URL(href, base).toString();
      const u   = new URL(abs);
      // same origin, only http/https, skip assets
      if (
        u.origin === origin &&
        (u.protocol === "http:" || u.protocol === "https:") &&
        !/\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|woff2?|ttf|pdf|zip|mp4|mp3)(\?|$)/i.test(u.pathname)
      ) {
        links.push(normalise(abs));
      }
    } catch {
      // ignore malformed URLs
    }
  });
  return [...new Set(links)];
}

/** Pull readable text from a page, stripping boilerplate tags */
function extractText($: cheerio.CheerioAPI, url: string): string {
  // Remove noise elements
  $("script, style, noscript, iframe, svg, header, footer, nav, aside, " +
    "[role='navigation'], [role='banner'], [role='contentinfo'], " +
    ".cookie-banner, .cookie-consent, #cookie-notice, " +
    ".nav, .navbar, .sidebar, .footer, .header").remove();

  // Build structured text: title → h1-h3 → paragraphs → lists → table cells
  const parts: string[] = [];

  const title = $("title").text().trim();
  if (title) parts.push(`Page: ${title}`);

  $("h1, h2, h3").each((_, el) => {
    const t = $(el).text().trim();
    if (t) parts.push(`# ${t}`);
  });

  $("p, li, td, th, dt, dd, blockquote, [class*='product'], [class*='price'], [class*='description']").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 20) parts.push(t);  // skip tiny fragments
  });

  // Deduplicate adjacent identical lines
  const deduped = parts.filter((v, i, a) => i === 0 || v !== a[i - 1]);
  return `[Source: ${url}]\n\n` + deduped.join("\n");
}

/** Split text into overlapping chunks */
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + CHUNK_SIZE));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.trim().length > 30);
}

/** Fetch a page with timeout, returning HTML or null on failure */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "AgentOS-Crawler/1.0 (informational bot; contact support@agentos.ai)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ── POST /api/crawl ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { url, accountId = "demo", replace = true } = await req.json();

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let startUrl: URL;
  try {
    startUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const origin = startUrl.origin;

  // ── 1. Delete existing chunks from this domain if replace=true ────────────
  if (replace) {
    await supabase
      .from("knowledge_base")
      .delete()
      .eq("account_id", accountId)
      .like("source", `${origin}%`);
  }

  // ── 2. BFS crawl ──────────────────────────────────────────────────────────
  type QueueItem = { url: string; depth: number };
  const queue: QueueItem[]   = [{ url: normalise(startUrl.toString()), depth: 0 }];
  const visited  = new Set<string>();
  const allText: { url: string; text: string }[] = [];

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const item = queue.shift()!;
    if (visited.has(item.url)) continue;
    visited.add(item.url);

    const html = await fetchPage(item.url);
    if (!html) continue;

    const $ = cheerio.load(html);
    const text = extractText($, item.url);
    if (text.trim().length > 50) {
      allText.push({ url: item.url, text });
    }

    // Queue child links if not at max depth
    if (item.depth < MAX_DEPTH) {
      const links = extractLinks($, item.url, origin);
      for (const link of links) {
        if (!visited.has(link)) {
          queue.push({ url: link, depth: item.depth + 1 });
        }
      }
    }

    // Polite delay
    if (queue.length > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  if (allText.length === 0) {
    return NextResponse.json({
      error: "No readable content found. The site may require JavaScript to render (SPA).",
      pages: 0,
      chunks: 0,
    }, { status: 422 });
  }

  // ── 3. Chunk all pages ────────────────────────────────────────────────────
  const allChunks: { content: string; source: string }[] = [];
  for (const { url: pageUrl, text } of allText) {
    for (const chunk of chunkText(text)) {
      allChunks.push({ content: chunk, source: pageUrl });
    }
  }

  // ── 4. Embed in batches of 96 (OpenAI limit) ─────────────────────────────
  const BATCH = 96;
  let totalInserted = 0;

  for (let i = 0; i < allChunks.length; i += BATCH) {
    const batch = allChunks.slice(i, i + BATCH);
    const texts  = batch.map((c) => c.content);

    let embeddings: number[][] = [];
    try {
      const result = await embedMany({
        model: openai.embedding("text-embedding-3-small"),
        values: texts,
      });
      embeddings = result.embeddings;
    } catch (e) {
      console.error("[crawl] embedMany failed:", e);
      // Insert without embeddings as fallback (KB keyword search still works)
      embeddings = texts.map(() => []);
    }

    const rows = batch.map((c, j) => ({
      account_id: accountId,
      content:    c.content,
      source:     c.source,
      embedding:  embeddings[j]?.length ? JSON.stringify(embeddings[j]) : null,
    }));

    const { error } = await supabase.from("knowledge_base").insert(rows);
    if (error) {
      console.error("[crawl] insert error:", error.message);
    } else {
      totalInserted += rows.length;
    }
  }

  return NextResponse.json({
    success:  true,
    domain:   origin,
    pages:    allText.length,
    chunks:   totalInserted,
    replaced: replace,
  });
}

// ── GET /api/crawl?domain=… — list crawled domains ───────────────────────────
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId") ?? "demo";

  const { data } = await supabase
    .from("knowledge_base")
    .select("source")
    .eq("account_id", accountId)
    .not("source", "is", null);

  // Deduplicate to unique origins
  const domains = [...new Set(
    (data ?? [])
      .map((r) => {
        try { return new URL(r.source).origin; } catch { return null; }
      })
      .filter(Boolean)
  )];

  return NextResponse.json({ domains });
}
