import { NextRequest, NextResponse } from "next/server";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { supabase } from "@/lib/supabase";

function chunk(text: string, size = 500, overlap = 100): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks.filter((c) => c.trim().length > 20);
}

async function chunksToRows(
  chunks: string[],
  accountId: string,
  source?: string
) {
  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: chunks,
  });
  return chunks.map((content, i) => ({
    account_id: accountId,
    content,
    source: source ?? null,
    embedding: embeddings[i],
  }));
}

async function extractText(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type;

  if (mime === "application/pdf" || file.name.endsWith(".pdf")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const result = await pdfParse(buf);
    return result.text ?? "";
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.endsWith(".docx")
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value ?? "";
  }

  // Plain text / markdown / CSV
  return buf.toString("utf-8");
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // ── File upload mode ──────────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const accountId = (formData.get("accountId") as string) ?? "demo";

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
      "text/csv",
    ];
    const isAllowed =
      allowedTypes.includes(file.type) ||
      /\.(pdf|docx|txt|md|csv)$/i.test(file.name);

    if (!isAllowed) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload PDF, DOCX, or TXT." },
        { status: 400 }
      );
    }

    let text: string;
    try {
      text = await extractText(file);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to parse file";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "No text could be extracted from this file." }, { status: 400 });
    }

    const chunks = chunk(text);
    let rows;
    try {
      rows = await chunksToRows(chunks, accountId, file.name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Embedding failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const { error } = await supabase.from("knowledge_base").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, chunks: rows.length, filename: file.name });
  }

  // ── Plain text mode (existing) ────────────────────────────────────────────
  const { text, accountId = "demo" } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  const chunks = chunk(text);
  let rows;
  try {
    rows = await chunksToRows(chunks, accountId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Embedding failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { error } = await supabase.from("knowledge_base").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, chunks: rows.length });
}

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId") || "demo";
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("id, content, source, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chunks: data });
}

export async function DELETE(req: NextRequest) {
  const { id, accountId = "demo" } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("knowledge_base")
    .delete()
    .eq("id", id)
    .eq("account_id", accountId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
