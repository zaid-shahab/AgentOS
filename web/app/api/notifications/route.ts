import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId") || "demo";
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data });
}
