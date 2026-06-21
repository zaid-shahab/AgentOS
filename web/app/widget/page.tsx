"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────
type Msg = { role: "user" | "assistant"; content: string };

// ── Icons (inline SVG so the widget is fully self-contained) ──────────────────
function IconSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
    </svg>
  );
}
function IconBot() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4" />
      <circle cx="12" cy="4" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconZap({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function Dots({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", gap: 5, padding: "6px 4px", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: color,
            opacity: 0.6,
            animation: `wbounce 1.1s ${i * 0.18}s infinite ease-in-out`,
          }}
        />
      ))}
    </div>
  );
}

// ── Main widget (reads URL params) ────────────────────────────────────────────
function WidgetInner() {
  const sp = useSearchParams();
  const accountId = sp.get("accountId") ?? "demo";
  const botName   = sp.get("botName")   ?? "Assistant";
  const color     = sp.get("color")     ?? "#22d3ee";
  const greeting  = sp.get("greeting")  ?? "Hi! How can I help you today?";

  const [msgs, setMsgs]   = useState<Msg[]>([
    { role: "assistant", content: greeting },
  ]);
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

    const history = msgs.slice(-10); // keep last 10 turns as context
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
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

  // Derived colours
  const bg       = "#0b0c14";
  const surface  = "#131420";
  const border   = "rgba(255,255,255,0.07)";
  const ink      = "#e2e4f0";
  const subInk   = "#8891b0";
  const userBg   = color;

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${bg};color:${ink};font-family:system-ui,-apple-system,sans-serif;height:100vh;overflow:hidden}
        @keyframes wbounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
        @keyframes wfade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .wmsg{animation:wfade .22s ease}
        textarea:focus,input:focus{outline:none}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
      `}</style>

      {/* Shell */}
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px",
          background: surface,
          borderBottom: `1px solid ${border}`,
          flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: `${color}22`,
            border: `1.5px solid ${color}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color,
          }}>
            <IconBot />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{botName}</div>
            <div style={{ fontSize: 11, color: subInk, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34e29b", display: "inline-block" }} />
              Online · Powered by AgentOS
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <IconZap color={`${color}80`} />
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "16px 14px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {msgs.map((m, i) => (
            <div
              key={i}
              className="wmsg"
              style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                gap: 8,
                alignItems: "flex-end",
              }}
            >
              {m.role === "assistant" && (
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  background: `${color}22`,
                  border: `1.5px solid ${color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color, fontSize: 13,
                }}>
                  <IconBot />
                </div>
              )}
              <div style={{
                maxWidth: "78%",
                padding: "10px 14px",
                borderRadius: m.role === "user"
                  ? "18px 18px 4px 18px"
                  : "4px 18px 18px 18px",
                background: m.role === "user"
                  ? userBg
                  : "rgba(255,255,255,0.05)",
                border: m.role === "user"
                  ? "none"
                  : `1px solid ${border}`,
                color: m.role === "user" ? "#fff" : ink,
                fontSize: 13.5,
                lineHeight: 1.55,
                wordBreak: "break-word",
              }}>
                {m.content}
              </div>
            </div>
          ))}

          {busy && (
            <div className="wmsg" style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: `${color}22`,
                border: `1.5px solid ${color}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color,
              }}>
                <IconBot />
              </div>
              <div style={{
                padding: "6px 14px",
                borderRadius: "4px 18px 18px 18px",
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${border}`,
              }}>
                <Dots color={color} />
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Quick suggestions (only on first open) */}
        {msgs.length === 1 && (
          <div style={{
            padding: "0 14px 10px",
            display: "flex", gap: 6, flexWrap: "wrap",
          }}>
            {["Pricing plans", "How does it work?", "Contact support"].map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: `1px solid ${color}44`,
                  background: `${color}11`,
                  color,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div style={{
          padding: "10px 12px",
          borderTop: `1px solid ${border}`,
          background: surface,
          display: "flex", gap: 8, alignItems: "flex-end",
          flexShrink: 0,
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message…"
            rows={1}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${border}`,
              borderRadius: 12,
              color: ink,
              fontSize: 13.5,
              padding: "9px 12px",
              resize: "none",
              fontFamily: "inherit",
              lineHeight: 1.4,
              maxHeight: 96,
              overflowY: "auto",
            }}
          />
          <button
            onClick={() => send()}
            disabled={busy || !input.trim()}
            style={{
              width: 40, height: 40,
              borderRadius: 12,
              background: input.trim() && !busy ? color : "rgba(255,255,255,0.06)",
              border: "none",
              cursor: input.trim() && !busy ? "pointer" : "default",
              color: input.trim() && !busy ? "#fff" : subInk,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "background .15s, color .15s",
            }}
          >
            <IconSend />
          </button>
        </div>

        {/* Powered-by footer */}
        <div style={{
          textAlign: "center",
          padding: "6px 0 10px",
          fontSize: 10.5,
          color: subInk,
          background: surface,
          letterSpacing: "0.02em",
        }}>
          Powered by <span style={{ color }}>AgentOS</span>
        </div>
      </div>
    </>
  );
}

// Wrap in Suspense because useSearchParams() requires it in App Router
export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <WidgetInner />
    </Suspense>
  );
}
