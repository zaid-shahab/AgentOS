"use client";

import { useState, useRef, useEffect } from "react";
import NodeCanvas from "@/components/NodeCanvas";
import type { Graph, GraphNode, GraphEdge } from "@/lib/schema";

type Tab = "architect" | "insights" | "knowledge" | "crons";
type Message = { role: "user" | "assistant"; content: string; cron?: string };

export default function CommandCenter() {
  const [tab, setTab] = useState<Tab>("architect");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Ask me anything about your interactions — leads, sentiment, top issues, or schedule a daily briefing." },
  ]);
  const [insightInput, setInsightInput] = useState("");
  const [kbText, setKbText] = useState("");
  const [kbSaving, setKbSaving] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Build agent from prompt ──────────────────────────────────────────────
  async function handleBuild() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const graph: Graph = await res.json();
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setPrompt("");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // ── Voice input via Web Speech API ──────────────────────────────────────
  function handleVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Speech recognition not supported in this browser.");
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onstart = () => setRecording(true);
    recognition.onend = () => setRecording(false);
    recognition.onresult = (e: any) => {
      const transcript: string = e.results[0][0].transcript;
      setPrompt(transcript);
      if (tab === "architect") {
        setTimeout(() => handleBuild(), 300);
      } else if (tab === "insights") {
        setInsightInput(transcript);
        setTimeout(() => handleInsight(transcript), 300);
      }
    };
    recognition.start();
  }

  // ── Insight query ────────────────────────────────────────────────────────
  async function handleInsight(question?: string) {
    const q = question ?? insightInput;
    if (!q.trim()) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInsightInput("");

    // Check if it's a cron request
    const isCron = /every|daily|weekly|at \d|each morning|each evening/i.test(q);
    if (isCron) {
      try {
        const res = await fetch("/api/cron", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: q }),
        });
        const data = await res.json();
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Scheduled: ${data.cronJob.description}`,
            cron: data.cronJob.cron_expression,
          },
        ]);
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: "Failed to schedule. Try again." }]);
      }
      return;
    }

    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.answer ?? data.error }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Failed to query. Check your connection." }]);
    }
  }

  // ── Save Knowledge Base ──────────────────────────────────────────────────
  async function handleSaveKb() {
    if (!kbText.trim()) return;
    setKbSaving(true);
    try {
      await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: kbText }),
      });
    } finally {
      setKbSaving(false);
    }
  }

  return (
    <div className="of-shell">
      {/* Topbar */}
      <header className="of-topbar">
        <span className="of-logo">Agent<span>OS</span></span>
        <span className="of-topbar-badge">Generative Orchestrator</span>
      </header>

      {/* Sidebar */}
      <aside className="of-sidebar">
        <div className="of-sidebar-section">Platform</div>
        {(["architect", "insights", "knowledge", "crons"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`of-sidebar-item${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {SIDEBAR_ICONS[t]} {SIDEBAR_LABELS[t]}
          </button>
        ))}
      </aside>

      {/* Main */}
      <main className="of-main">
        <nav className="of-tabs">
          {(["architect", "insights", "knowledge", "crons"] as Tab[]).map((t) => (
            <button key={t} className={`of-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
              {SIDEBAR_LABELS[t]}
            </button>
          ))}
        </nav>

        <div className="of-tab-content">
          {/* ── Architect tab ───────────────────────────────────────────── */}
          {tab === "architect" && (
            <>
              <NodeCanvas nodes={nodes} edges={edges} />
              <div className="of-command-bar">
                <textarea
                  className="of-command-input"
                  rows={1}
                  placeholder='Describe your agent — e.g. "Watch IG comments. DM price list to anyone asking. Hide trolls."'
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleBuild(); } }}
                />
                <button className={`of-btn of-btn-voice${recording ? " recording" : ""}`} onClick={handleVoice}>
                  {recording ? "● REC" : "🎙"}
                </button>
                <button className="of-btn of-btn-primary" onClick={handleBuild} disabled={loading || !prompt.trim()}>
                  {loading ? "Building…" : "⚡ Build"}
                </button>
              </div>
            </>
          )}

          {/* ── Insights tab ───────────────────────────────────────────── */}
          {tab === "insights" && (
            <>
              <div className="of-chat">
                {messages.map((msg, i) => (
                  <div key={i} className={`of-message ${msg.role}`}>
                    <div className="of-message-avatar">{msg.role === "assistant" ? "⚡" : "U"}</div>
                    <div className="of-message-bubble">
                      {msg.content}
                      {msg.cron && (
                        <div className="of-cron-badge">⏱ Scheduled · {msg.cron}</div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="of-command-bar">
                <textarea
                  className="of-command-input"
                  rows={1}
                  placeholder='Ask or schedule — e.g. "How many hot leads today?" or "Email me a summary every 9 AM"'
                  value={insightInput}
                  onChange={(e) => setInsightInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleInsight(); } }}
                />
                <button className={`of-btn of-btn-voice${recording ? " recording" : ""}`} onClick={handleVoice}>
                  {recording ? "● REC" : "🎙"}
                </button>
                <button
                  className="of-btn of-btn-primary"
                  onClick={() => handleInsight()}
                  disabled={!insightInput.trim()}
                >
                  Ask
                </button>
              </div>
            </>
          )}

          {/* ── Knowledge Base tab ─────────────────────────────────────── */}
          {tab === "knowledge" && (
            <div className="of-kb-panel">
              <p className="of-label">Business Knowledge Base</p>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                Paste your product info, pricing, FAQs, or any context the agent should know. The system
                will embed this and use it to craft accurate DM replies.
              </p>
              <textarea
                className="of-kb-textarea"
                placeholder={"Pricing:\n  Pro plan: $49/mo\n  Basic plan: $19/mo\n\nReturn policy: 30-day no-questions-asked refund.\n\nSupport email: support@yourbrand.com"}
                value={kbText}
                onChange={(e) => setKbText(e.target.value)}
              />
              <button className="of-btn of-btn-primary" style={{ alignSelf: "flex-start" }} onClick={handleSaveKb} disabled={kbSaving}>
                {kbSaving ? "Saving…" : "Save & Embed"}
              </button>
            </div>
          )}

          {/* ── Crons tab ──────────────────────────────────────────────── */}
          {tab === "crons" && <CronsPanel />}
        </div>
      </main>
    </div>
  );
}

// ── Crons Panel ───────────────────────────────────────────────────────────────
function CronsPanel() {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/cron?accountId=demo")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []));
  }, []);

  async function deleteJob(key: string) {
    await fetch("/api/cron", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: key }),
    });
    setJobs((j) => j.filter((x) => x.key !== key));
  }

  return (
    <div className="of-kb-panel">
      <p className="of-label">Scheduled Reports</p>
      {jobs.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          No scheduled reports yet. Go to Insights and say "Email me a hot-lead briefing at 9 AM daily."
        </p>
      )}
      {jobs.map((job) => (
        <div key={job.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600 }}>{job.name}</p>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{job.cron} · next: {job.next ? new Date(job.next).toLocaleString() : "—"}</p>
          </div>
          <button className="of-btn of-btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => deleteJob(job.key)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

const SIDEBAR_ICONS: Record<Tab, string> = {
  architect: "⚡",
  insights:  "💬",
  knowledge: "📚",
  crons:     "⏱",
};
const SIDEBAR_LABELS: Record<Tab, string> = {
  architect: "Architect",
  insights:  "Insights",
  knowledge: "Knowledge Base",
  crons:     "Scheduled Reports",
};
