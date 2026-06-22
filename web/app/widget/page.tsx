"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────
type Msg = { role: "user" | "assistant"; content: string };

// ── Icons (self-contained, no external deps) ──────────────────────────────────
function IconSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
    </svg>
  );
}
function IconBot() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4" />
      <circle cx="12" cy="4" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function Dots() {
  return (
    <div style={{ display: "flex", gap: 5, padding: "6px 4px", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="wdot"
          style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </div>
  );
}

// ── Design tokens (static — no template literals injected into <style>) ────────
const BG      = "#0b0c14";
const SURFACE = "#131420";
const BORDER  = "rgba(255,255,255,0.07)";
const INK     = "#e2e4f0";
const SUB_INK = "#8891b0";

// ── Main widget body (reads params, rendered inside Suspense) ─────────────────
function WidgetInner() {
  const sp       = useSearchParams();
  const accountId = sp.get("accountId") ?? "demo";
  const botName   = sp.get("botName")   ?? "Assistant";
  const color     = sp.get("color")     ?? "#22d3ee";
  const greeting  = sp.get("greeting")  ?? "Hi! How can I help you today?";

  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [busy, setBusy]   = useState(false);
  const endRef            = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    const history = msgs.slice(-10);
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/widget-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, accountId, history }),
      });
      const data = await res.json();
      setMsgs((m) => [...m, { role: "assistant", content: data.reply ?? data.error ?? "I had trouble responding — please try again." }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Network error — please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  // ── Pass the dynamic accent colour as a CSS custom property on the root div.
  // This is the ONLY dynamic value — all other styles come from widget.css.
  // Using a CSS var avoids injecting dynamic values into <style> tags, which
  // React 19 validates strictly during hydration and causes mismatches.
  return (
    <div
      className="w-shell"
      style={{ "--w-color": color } as React.CSSProperties}
    >
      {/* ── Dot styles that need the CSS var ──────────────────────────── */}
      {/* Static styles live in widget.css; only the CSS var is dynamic */}

      {/* Header */}
      <div className="w-head" style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
        <div className="w-av">
          <IconBot />
        </div>
        <div>
          <div className="w-name">{botName}</div>
          <div className="w-status">
            <span className="w-online" />
            Online · Powered by AgentOS
          </div>
        </div>
        <svg className="w-logo" width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="var(--w-color)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          style={{ marginLeft: "auto", opacity: 0.4 }}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
      </div>

      {/* Message list */}
      <div className="w-msgs">
        {msgs.map((m, i) => (
          <div key={i} className={`wmsg w-row ${m.role}`}>
            {m.role === "assistant" && (
              <div className="w-av w-av-sm"><IconBot /></div>
            )}
            <div className={`w-bub w-bub-${m.role}`}>{m.content}</div>
          </div>
        ))}

        {busy && (
          <div className="wmsg w-row assistant">
            <div className="w-av w-av-sm"><IconBot /></div>
            <div className="w-bub w-bub-assistant"><Dots /></div>
          </div>
        )}

        {/* Quick suggestion chips — only on first open */}
        {msgs.length === 1 && (
          <div className="w-chips">
            {["Pricing plans", "How does it work?", "Contact support"].map((s) => (
              <button key={s} className="w-chip" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <div className="w-bar" style={{ background: SURFACE, borderTop: `1px solid ${BORDER}` }}>
        <textarea
          className="w-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Type a message…"
          rows={1}
          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: INK }}
        />
        <button
          className="w-send"
          onClick={() => send()}
          disabled={busy || !input.trim()}
          style={{
            background: input.trim() && !busy ? color : "rgba(255,255,255,0.06)",
            color: input.trim() && !busy ? "#fff" : SUB_INK,
          }}
        >
          <IconSend />
        </button>
      </div>

      {/* Footer */}
      <div className="w-foot" style={{ background: SURFACE, color: SUB_INK }}>
        Powered by <span style={{ color }}>AgentOS</span>
      </div>
    </div>
  );
}

// ── Page root: wrap in Suspense (required by useSearchParams in App Router) ───
export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <WidgetInner />
    </Suspense>
  );
}
