"use client";

import { useState, useRef, useEffect } from "react";
import NodeCanvas from "@/components/NodeCanvas";
import InsightRenderer from "@/components/InsightRenderer";
import Icon from "@/components/Icon";
import Landing from "@/components/Landing";
import type { GraphNode, GraphEdge } from "@/lib/schema";

type Tab = "home" | "architect" | "insights" | "knowledge" | "crons" | "embed";
type RenderAs = "text" | "table" | "bar_chart" | "line_chart";
type Message = {
  role: "user" | "assistant";
  content: string;
  cron?: string;
  data?: Record<string, unknown>[];
  render_as?: RenderAs;
};

const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: "home",      icon: "home",     label: "Home" },
  { id: "architect", icon: "workflow", label: "Orchestrator" },
  { id: "insights",  icon: "database", label: "Database / Insights" },
  { id: "knowledge", icon: "book",     label: "Knowledge Base" },
  { id: "crons",     icon: "clock",    label: "Scheduled Reports" },
  { id: "embed",     icon: "code",     label: "Website Widget" },
];

type OrchMsg = { role: "user" | "assistant"; content: string };

// Detect whether the user is asking to build/execute the flow now.
function buildIntent(text: string) {
  return /\b(build it|build the flow|build this|execute|deploy it|make it|run it|run this|go ahead|proceed|launch|lay (it|them|the nodes) out|do it|ship it)\b/i.test(text);
}

// A message that is ONLY a build/affirmative command (no real description in it).
function isPureBuild(text: string) {
  return /^\s*(build|build it|execute|execute it|deploy|deploy it|go|go ahead|do it|proceed|run it|make it|ship it|yes|yep|yeah|sure|ok|okay|let'?s go)[\s.!]*$/i.test(text);
}

const ORCH_GREETING =
  "Hey — I'm AgentOS. Tell me what you'd like your agent to do across Instagram or Messenger and I'll design the orchestration. When it looks right, just say “execute” or “build it” and I'll lay out the flow.";

const NODE_TYPES: { id: GraphNode["type"]; label: string }[] = [
  { id: "trigger", label: "Trigger" },
  { id: "decision", label: "Decision" },
  { id: "action", label: "Action" },
  { id: "schedule", label: "Schedule" },
];

const ICON_CHOICES = [
  "instagram", "messenger", "branch", "message", "messageCircle", "userplus",
  "shield", "tag", "search", "bell", "mail", "clock", "bot", "sparkles", "zap",
];

const ORCH_EXAMPLES = [
  "Watch my Instagram comments. DM the SUMMER20 code to anyone asking for a discount, and hide any scam or profanity comments.",
  "When someone DMs us on Messenger, qualify them and tag them as a lead if they're a fit.",
  "Auto-reply to Instagram DMs asking about shipping, and alert me when someone is angry.",
];

function exportCSV(data: Record<string, unknown>[], filename = "agentos-insights.csv") {
  if (!data?.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CommandCenter() {
  const [tab, setTab] = useState<Tab>("home");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const [recording, setRecording] = useState(false);

  // ── Orchestrator conversation state (persists across chat ↔ canvas) ──
  const [orchMode, setOrchMode] = useState<"chat" | "canvas">("chat");
  const [orchMsgs, setOrchMsgs] = useState<OrchMsg[]>([
    { role: "assistant", content: ORCH_GREETING },
  ]);
  const [orchBusy, setOrchBusy] = useState(false);
  const orchEndRef = useRef<HTMLDivElement>(null);
  const orchMsgsLengthRef = useRef(1); // tracks current orchMsgs.length for async callbacks

  // single-node editing
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [nodeEditInput, setNodeEditInput] = useState("");
  const [nodeEditBusy, setNodeEditBusy] = useState(false);
  const [nodeEditError, setNodeEditError] = useState<string | null>(null);

  function updateNode(id: string, patch: Partial<GraphNode>) {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }
  function deleteNode(id: string) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.from !== id && e.to !== id));
    setEditingNodeId(null);
  }

  // Change a single node's behaviour from a plain-language instruction.
  async function applyNodeEdit(node: GraphNode) {
    const instruction = nodeEditInput.trim();
    if (!instruction || nodeEditBusy) return;
    setNodeEditBusy(true);
    setNodeEditError(null);
    try {
      const res = await fetch("/api/edit-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node: {
            type: node.type,
            icon: node.icon,
            meta: node.meta,
            title: node.title,
            subtitle: node.subtitle,
          },
          instruction,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNodeEditError(data.error ?? "Couldn't apply that change.");
        return;
      }
      updateNode(node.id, data.patch);
      setNodeEditInput("");
    } catch {
      setNodeEditError("Network error. Please try again.");
    } finally {
      setNodeEditBusy(false);
    }
  }
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "I'm AgentOS Intelligence. Ask me anything about your logged events — leads, sentiment, top issues. Say “as a graph” or “as a table”." },
  ]);
  const [insightInput, setInsightInput] = useState("");
  const [insightBusy, setInsightBusy] = useState(false);
  const [kbText, setKbText] = useState("");
  const [kbSaving, setKbSaving] = useState(false);
  const [kbSaved, setKbSaved] = useState(false);
  const [kbFile, setKbFile] = useState<File | null>(null);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbUploadMsg, setKbUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [kbChunks, setKbChunks] = useState<{ id: string; content: string; source: string | null; created_at: string }[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; title: string; body: string; created_at: string }[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const kbFileRef = useRef<HTMLInputElement>(null);
  // ── Website crawl state ────────────────────────────────────────────────────
  const [crawlUrl,        setCrawlUrl]        = useState("");
  const [crawlExtraUrls,  setCrawlExtraUrls]  = useState("");   // newline-separated extra pages
  const [showExtraUrls,   setShowExtraUrls]   = useState(false);
  const [crawlBusy,       setCrawlBusy]       = useState(false);
  const [crawlMsg,        setCrawlMsg]        = useState<{ ok: boolean; text: string } | null>(null);
  const [crawledDomains,  setCrawledDomains]  = useState<string[]>([]);
  // ── Embed widget configurator ──────────────────────────────────────────
  const [widgetBotName, setWidgetBotName]   = useState("Assistant");
  const [widgetColor,   setWidgetColor]     = useState("#22d3ee");
  const [widgetGreeting, setWidgetGreeting] = useState("Hi! How can I help you today?");
  const [widgetCopied,  setWidgetCopied]   = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop(): void; start(): void } | null>(null);
  const voiceTargetRef = useRef<"architect" | "insights" | null>(null);
  const voiceStopRef = useRef(false); // true = user manually stopped, false = auto-restart on end

  // Preload the latest saved config on mount so the canvas isn't empty after a restart.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/build?accountId=demo")
      .then((r) => r.json())
      .then((data) => {
        // Abort if component unmounted or user already built a fresh flow while fetch was in flight.
        if (cancelled) return;
        if (data.nodes?.length > 0) {
          // If the user has already started chatting or built something, don't touch their session.
          if (orchMsgsLengthRef.current > 1) return;
          setNodes((current) => (current.length > 0 ? current : data.nodes));
          setEdges((current) => (current.length > 0 ? current : data.edges));
          setOrchMode((m) => (m === "canvas" ? m : "canvas"));
          setOrchMsgs((m) => [
            ...m,
            {
              role: "assistant" as const,
              content:
                "Welcome back — your previous flow has been restored. Click “View flow” to see the canvas, or keep describing to rebuild it.",
            },
          ]);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load already-crawled domains so they show in the UI on mount
  useEffect(() => {
    fetch("/api/crawl?accountId=demo")
      .then((r) => r.json())
      .then((d) => { if (d.domains?.length) setCrawledDomains(d.domains); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, insightBusy]);

  useEffect(() => {
    orchMsgsLengthRef.current = orchMsgs.length;
    orchEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [orchMsgs, orchBusy]);

  useEffect(() => {
    if (tab === "knowledge") fetchKbChunks();
  }, [tab]);

  // Load persisted read IDs from localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("notif_read") || "[]");
      setReadIds(new Set(stored));
    } catch {}
  }, []);

  // Poll notifications every 30s so badge updates without reload
  useEffect(() => {
    const load = () =>
      fetch("/api/notifications?accountId=demo")
        .then((r) => r.json())
        .then((d) => setNotifications(d.notifications ?? []));
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // Also refresh immediately when panel opens
  useEffect(() => {
    if (!notifOpen) return;
    fetch("/api/notifications?accountId=demo")
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications ?? []));
  }, [notifOpen]);

  function markAllRead() {
    const ids = notifications.map((n) => n.id);
    const next = new Set([...readIds, ...ids]);
    setReadIds(next);
    localStorage.setItem("notif_read", JSON.stringify([...next]));
  }

  // ── Orchestrator: build the actual flow from the accumulated description ───
  async function runOrchBuild(description: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOrchMsgs((m) => [
          ...m,
          { role: "assistant", content: data.error ?? "I couldn't build that. Try describing the platform and actions more specifically." },
        ]);
        return;
      }
      setNodes(data.nodes);
      setEdges(data.edges);
      setOrchMode("canvas");
      setOrchMsgs((m) => [
        ...m,
        { role: "assistant", content: "Done — your orchestration is on the canvas. Switch back to Chat anytime to refine it, then say “execute” to rebuild." },
      ]);
    } catch {
      setOrchMsgs((m) => [...m, { role: "assistant", content: "Network error while building. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  // ── Orchestrator: send a chat message (converse, or build on "execute") ───
  async function handleOrchSend(textArg?: string) {
    const text = (textArg ?? prompt).trim();
    if (!text || orchBusy || loading) return;
    setPrompt("");

    const nextMsgs: OrchMsg[] = [...orchMsgs, { role: "user", content: text }];
    setOrchMsgs(nextMsgs);

    // Everything the user has described so far (minus pure "execute" commands).
    const descParts = nextMsgs
      .filter((m) => m.role === "user" && !isPureBuild(m.content))
      .map((m) => m.content);

    const wantsBuild = buildIntent(text) && descParts.length > 0;

    if (wantsBuild) {
      setOrchBusy(true);
      setOrchMsgs((m) => [...m, { role: "assistant", content: "On it — forging the orchestration now…" }]);
      await runOrchBuild(descParts.join(". "));
      setOrchBusy(false);
      return;
    }

    // Otherwise: conversational reply from the chat model.
    setOrchBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMsgs }),
      });
      const data = await res.json();
      setOrchMsgs((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? data.error ?? "Sorry, I didn't catch that." },
      ]);
    } catch {
      setOrchMsgs((m) => [...m, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setOrchBusy(false);
    }
  }

  // Build directly from the inline "Build the flow" button.
  function handleOrchBuildButton() {
    if (orchBusy || loading) return;
    const descParts = orchMsgs
      .filter((m) => m.role === "user" && !isPureBuild(m.content))
      .map((m) => m.content);
    if (descParts.length === 0) return;
    setOrchBusy(true);
    setOrchMsgs((m) => [...m, { role: "assistant", content: "On it — forging the orchestration now…" }]);
    runOrchBuild(descParts.join(". ")).finally(() => setOrchBusy(false));
  }

  const orchHasDescription = orchMsgs.some((m) => m.role === "user" && !isPureBuild(m.content));

  // ── Voice input via Web Speech API ──────────────────────────────────────
  // Push-to-talk: click mic to start, click again to stop. Recognition stays
  // open through pauses (continuous + interim) so it doesn't auto-finish.
  function handleVoice(target: "architect" | "insights" | "node") {
    // Already recording? Stop and let the user send manually.
    if (recognitionRef.current) {
      voiceStopRef.current = true;
      try { recognitionRef.current.stop(); } catch {}
      return;
    }
    voiceStopRef.current = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SR();
    recognition.lang = "";  // browser default — handles English and Roman Urdu phonetically
    recognition.continuous = true;
    recognition.interimResults = true;

    voiceTargetRef.current = target === "node" ? null : target;
    const baseText =
      target === "architect" ? prompt : target === "insights" ? insightInput : nodeEditInput;
    const setter =
      target === "architect" ? setPrompt : target === "insights" ? setInsightInput : setNodeEditInput;
    let finalChunk = "";

    recognition.onstart = () => setRecording(true);

    recognition.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
        else interim += r[0].transcript;
      }
      const sep = baseText && !baseText.endsWith(" ") ? " " : "";
      const live = (baseText + sep + finalChunk + interim).trimStart();
      setter(live);
    };

    recognition.onerror = (e: any) => {
      // no-speech = just a pause, onend will auto-restart; aborted = we called stop()
      if (e.error === "no-speech" || e.error === "aborted") return;
      console.warn("Speech recognition error:", e.error);
      voiceStopRef.current = true; // stop restarting on unknown errors
    };

    recognition.onend = () => {
      // Auto-restart unless the user manually clicked stop or an unrecoverable error occurred
      if (!voiceStopRef.current && recognitionRef.current) {
        try { recognition.start(); return; } catch {}
      }
      setRecording(false);
      recognitionRef.current = null;
      voiceTargetRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  // ── Insight query ────────────────────────────────────────────────────────
  async function handleInsight(question?: string) {
    const q = (question ?? insightInput).trim();
    if (!q || insightBusy) return;
    setInsightBusy(true);
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInsightInput("");

    const isCron = /every|daily|weekly|at \d|each morning|each evening|remind|reminder|in \d+ min|in \d+ hour|after \d+ min|after \d+ hour|schedule|once a/i.test(q);
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
            content: `Scheduled: ${data.cronJob?.description ?? "report"}`,
            cron: data.cronJob?.cron_expression,
          },
        ]);
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: "Failed to schedule. Try again." }]);
      } finally {
        setInsightBusy(false);
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
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.answer ?? data.error ?? "—",
          data: data.data ?? [],
          render_as: data.render_as ?? "text",
        },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Failed to query. Check your connection." }]);
    } finally {
      setInsightBusy(false);
    }
  }

  async function fetchKbChunks() {
    setKbLoading(true);
    try {
      const res = await fetch("/api/knowledge?accountId=demo");
      const data = await res.json();
      setKbChunks(data.chunks ?? []);
    } finally {
      setKbLoading(false);
    }
  }

  async function handleSaveKb() {
    if (!kbText.trim() || kbSaving) return;
    setKbSaving(true);
    setKbSaved(false);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: kbText }),
      });
      const data = await res.json();
      if (data.success) { setKbSaved(true); setKbText(""); fetchKbChunks(); }
    } finally {
      setKbSaving(false);
    }
  }

  async function handleCrawl() {
    if (!crawlUrl.trim() || crawlBusy) return;
    setCrawlBusy(true);
    setCrawlMsg(null);

    // Parse extra URLs — one per line, ignore blanks
    const extraUrls = crawlExtraUrls
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: crawlUrl.trim(), extraUrls, accountId: "demo", replace: true }),
      });
      const data = await res.json();
      if (data.success) {
        const mode = data.searchMode === "vector+keyword" ? "vector + keyword search" : "keyword search (add OPENAI_API_KEY for vector search)";
        setCrawlMsg({ ok: true, text: `✓ Crawled ${data.pages} pages → ${data.chunks} chunks saved from ${data.domain} · ${mode}` });
        setCrawledDomains((d) => [...new Set([...d, data.domain])]);
        setCrawlUrl("");
      } else {
        setCrawlMsg({ ok: false, text: data.error ?? "Crawl failed." });
      }
    } catch {
      setCrawlMsg({ ok: false, text: "Network error. Please try again." });
    } finally {
      setCrawlBusy(false);
    }
  }

  async function handleKbUpload() {
    if (!kbFile || kbUploading) return;
    setKbUploading(true);
    setKbUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", kbFile);
      const res = await fetch("/api/knowledge", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setKbUploadMsg({ ok: true, text: `Parsed ${data.chunks} chunks from "${data.filename}"` });
        setKbFile(null);
        if (kbFileRef.current) kbFileRef.current.value = "";
        fetchKbChunks();
      } else {
        setKbUploadMsg({ ok: false, text: data.error ?? "Upload failed." });
      }
    } catch {
      setKbUploadMsg({ ok: false, text: "Network error. Please try again." });
    } finally {
      setKbUploading(false);
    }
  }

  async function handleDeleteKbChunk(id: string) {
    await fetch("/api/knowledge", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setKbChunks((c) => c.filter((x) => x.id !== id));
  }

  const status =
    nodes.length === 0
      ? { cls: "draft", label: "Draft" }
      : { cls: "ready", label: "Ready to deploy" };

  return (
    <>
      <div className="of-bg" />
      <div className="of-shell">
        {/* ── Sidebar ────────────────────────────────────────────── */}
        <nav className="of-rail">
          <div className="of-logo"><Icon name="zap" /></div>
          <div className="of-nav">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={`of-navbtn ${tab === n.id ? "active" : ""}`}
                onClick={() => setTab(n.id)}
              >
                <Icon name={n.icon} />
                <span className="tip">{n.label}</span>
              </button>
            ))}
          </div>
          <div className="of-rail-foot">
            {/* Bell */}
            <button
              className="of-navbtn"
              style={{ position: "relative" }}
              onClick={() => setNotifOpen((o) => !o)}
              title="Notifications"
            >
              <Icon name="bell" />
              {notifications.filter((n) => !readIds.has(n.id)).length > 0 && (
                <span style={{
                  position: "absolute", top: 6, right: 6,
                  width: 8, height: 8, borderRadius: "50%",
                  background: "var(--accent)", border: "2px solid var(--bg-0, #0a0a14)",
                }} />
              )}
            </button>
            <div className="of-avatar">AW</div>
          </div>
        </nav>

        {/* ── Notifications panel ──────────────────────────────────── */}
        {notifOpen && (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setNotifOpen(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 99,
                background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)",
              }}
            />
            {/* Panel */}
            <div style={{
              position: "fixed", left: 76, top: 0, bottom: 0,
              width: 360, zIndex: 100,
              background: "rgba(14,14,28,0.97)",
              borderRight: "1px solid rgba(255,255,255,0.08)",
              display: "flex", flexDirection: "column",
              boxShadow: "4px 0 32px rgba(0,0,0,0.5)",
            }}>
              {/* Header */}
              <div style={{
                padding: "20px 20px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>Notifications</div>
                  <div style={{ fontSize: 12, opacity: 0.4, marginTop: 2 }}>
                    {notifications.filter((n) => !readIds.has(n.id)).length} unread
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {notifications.some((n) => !readIds.has(n.id)) && (
                    <button
                      onClick={markAllRead}
                      style={{
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8, padding: "5px 10px", fontSize: 11,
                        color: "var(--ink-2)", cursor: "pointer",
                      }}
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setNotifOpen(false)}
                    style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.4, color: "inherit", padding: 4 }}
                  >
                    <Icon name="x" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
                {notifications.length === 0 && (
                  <div style={{ textAlign: "center", opacity: 0.35, paddingTop: 60 }}>
                    <Icon name="bell" />
                    <div style={{ marginTop: 12, fontSize: 13 }}>No reports yet</div>
                    <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                      Scheduled reports will appear here
                    </div>
                  </div>
                )}
                {notifications.map((n) => {
                  const unread = !readIds.has(n.id);
                  const date = new Date(n.created_at);
                  const timeStr = date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                  return (
                    <div
                      key={n.id}
                      onClick={() => {
                        const next = new Set([...readIds, n.id]);
                        setReadIds(next);
                        localStorage.setItem("notif_read", JSON.stringify([...next]));
                      }}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        marginBottom: 6,
                        background: unread ? "rgba(255,122,24,0.06)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${unread ? "rgba(255,122,24,0.18)" : "rgba(255,255,255,0.06)"}`,
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          {unread && (
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
                          )}
                          <span style={{ fontSize: 13, fontWeight: unread ? 600 : 400 }}>{n.title}</span>
                        </div>
                        <span style={{ fontSize: 11, opacity: 0.35, whiteSpace: "nowrap", flexShrink: 0 }}>{timeStr}</span>
                      </div>
                      <div style={{
                        fontSize: 12, opacity: 0.6, marginTop: 6, lineHeight: 1.55,
                        paddingLeft: unread ? 15 : 0,
                        whiteSpace: "pre-wrap",
                        fontFamily: n.body.includes("|") ? "var(--font-mono, monospace)" : "inherit",
                      }}>
                        {n.body}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Main column ────────────────────────────────────────── */}
        <div className="of-main">
          {tab === "home" && <Landing onNav={(t) => setTab(t)} />}

          {/* ── Orchestrator · CHAT mode ─────────────────────────────── */}
          {tab === "architect" && orchMode === "chat" && (
            <div className="of-canvaswrap insights">
              <div className="of-insights">
                <div className="of-insights-head">
                  <div className="of-iq-orb"><Icon name="sparkles" /></div>
                  <div>
                    <h3>AgentOS Orchestrator</h3>
                    <div className="sub">
                      Describe your agent in plain language — say “execute” when you&apos;re ready to build
                    </div>
                  </div>
                  <div className="of-spacer" />
                  {nodes.length > 0 ? (
                    <button className="of-ghost" onClick={() => setOrchMode("canvas")}>
                      <Icon name="workflow" />View flow
                    </button>
                  ) : (
                    <span className="of-pill draft"><span className="dot" />Draft</span>
                  )}
                </div>

                <div className="of-insights-body">
                  <div className="of-insights-conv">
                    {orchMsgs.length <= 1 ? (
                      <div className="of-chat-hero of-fade">
                        <div className="ring"><Icon name="sparkles" /></div>
                        <h2>What should your agent do?</h2>
                        <p>{ORCH_GREETING}</p>
                        <div className="of-chat-examples">
                          {ORCH_EXAMPLES.map((ex) => (
                            <button
                              key={ex}
                              className="of-example"
                              onClick={() => handleOrchSend(ex)}
                              disabled={orchBusy}
                            >
                              <Icon name="sparkles" /><span>{ex}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        {orchMsgs.map((m, i) => (
                          <div key={i} className={`of-chatmsg ${m.role} of-fade`}>
                            {m.role === "assistant" && (
                              <span className="of-chat-av"><Icon name="sparkles" /></span>
                            )}
                            <div className={`of-bub ${m.role === "assistant" ? "of-bub-ai" : ""}`}>
                              {m.content}
                            </div>
                          </div>
                        ))}
                        {orchBusy && (
                          <div className="of-chatmsg assistant">
                            <span className="of-chat-av"><Icon name="sparkles" /></span>
                            <div className="of-bub of-bub-ai" style={{ padding: 0 }}>
                              <div className="of-typing"><i /><i /><i /></div>
                            </div>
                          </div>
                        )}
                        {orchHasDescription && !orchBusy && nodes.length === 0 && (
                          <div className="of-buildcta of-fade">
                            <button className="of-buildbtn" onClick={handleOrchBuildButton} disabled={orchBusy || loading}>
                              <Icon name="zap" />Build the flow
                            </button>
                            <span className="of-buildcta-hint">or keep describing — say “execute” anytime</span>
                          </div>
                        )}
                      </>
                    )}
                    <div ref={orchEndRef} />
                  </div>
                </div>
              </div>

              <div className="of-cmdwrap">
                <div className="of-cmd">
                  <span className="lead"><Icon name="sparkles" /></span>
                  <input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleOrchSend();
                      }
                    }}
                    placeholder='Describe the agent — or say “execute” to build…'
                  />
                  <button
                    className={`of-mic ${recording ? "rec" : ""}`}
                    onClick={() => handleVoice("architect")}
                    aria-label="Voice command"
                  >
                    <Icon name="mic" />
                  </button>
                  <button
                    className="of-send"
                    onClick={() => handleOrchSend()}
                    disabled={recording || orchBusy || loading || !prompt.trim()}
                    aria-label="Send"
                  >
                    <Icon name="arrowUp" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Orchestrator · CANVAS mode ───────────────────────────── */}
          {tab === "architect" && orchMode === "canvas" && (
            <>
              <div className="of-canvaswrap">
                <div className="of-topbar">
                  <div className="of-crumb">AgentOS<b>/</b>Orchestrator</div>
                  <span className={`of-pill ${status.cls}`}>
                    <span className="dot" />
                    {status.label}
                  </span>
                  <div className="of-spacer" />
                  <button className="of-ghost" onClick={() => { setEditingNodeId(null); setOrchMode("chat"); }}>
                    <Icon name="message" />Chat
                  </button>
                  <button
                    className="of-ghost of-deploy"
                    disabled={nodes.length === 0}
                    data-state="ready"
                  >
                    <Icon name="play" />
                    Deploy
                  </button>
                </div>

                <NodeCanvas
                  nodes={nodes}
                  edges={edges}
                  selectedId={editingNodeId}
                  onNodeSelect={(id) => { setEditingNodeId(id); setNodeEditInput(""); setNodeEditError(null); }}
                  onBackgroundClick={() => setEditingNodeId(null)}
                />

                {/* command bar — keep chatting / say execute to rebuild */}
                <div className="of-cmdwrap">
                  <div className="of-cmd">
                    <span className="lead"><Icon name="sparkles" /></span>
                    <input
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleOrchSend();
                        }
                      }}
                      placeholder='Refine the agent, or say “execute” to rebuild…'
                    />
                    <button
                      className={`of-mic ${recording ? "rec" : ""}`}
                      onClick={() => handleVoice("architect")}
                      aria-label="Voice command"
                    >
                      <Icon name="mic" />
                    </button>
                    <button
                      className="of-send"
                      onClick={() => handleOrchSend()}
                      disabled={recording || orchBusy || loading || !prompt.trim()}
                      aria-label="Send"
                    >
                      {loading ? <Icon name="zap" /> : <Icon name="arrowUp" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right panel: node inspector when a node is selected, else monitor */}
              {(() => {
                const editingNode = nodes.find((n) => n.id === editingNodeId);
                if (editingNode) {
                  return (
                    <aside className="of-iq">
                      <div className="of-iq-head">
                        <div
                          className="of-iq-orb of-node-ico"
                          data-type={editingNode.type}
                          style={{ background: "rgba(255,255,255,.04)" }}
                        >
                          <Icon name={editingNode.icon} />
                        </div>
                        <div>
                          <h3>Edit node</h3>
                          <div className="sub">Changes apply to the canvas instantly</div>
                        </div>
                        <div className="of-spacer" />
                        <button
                          className="of-navbtn"
                          style={{ width: 32, height: 32, fontSize: 16 }}
                          onClick={() => setEditingNodeId(null)}
                          aria-label="Close"
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                      <div className="of-iq-body">
                        <div className="of-inspector">
                          {/* describe-the-change (regenerates just this node) */}
                          <div className="of-field">
                            <span className="of-field-lbl">Describe the change</span>
                            <textarea
                              className="of-textarea"
                              value={nodeEditInput}
                              onChange={(e) => setNodeEditInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  applyNodeEdit(editingNode);
                                }
                              }}
                              placeholder='e.g. "Send an email instead of a DM" or "Detect angry customers and alert me"'
                              disabled={nodeEditBusy}
                            />
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                className={`of-mic ${recording ? "rec" : ""}`}
                                style={{ width: 38, height: 38, fontSize: 17 }}
                                onClick={() => handleVoice("node")}
                                aria-label="Voice edit"
                              >
                                <Icon name="mic" />
                              </button>
                              <button
                                className="of-btn-solid"
                                onClick={() => applyNodeEdit(editingNode)}
                                disabled={nodeEditBusy || recording || !nodeEditInput.trim()}
                              >
                                <Icon name={nodeEditBusy ? "zap" : "sparkles"} />
                                {nodeEditBusy ? "Applying…" : "Apply change"}
                              </button>
                            </div>
                            {nodeEditError && (
                              <span style={{ fontSize: 11.5, color: "var(--bad)" }}>{nodeEditError}</span>
                            )}
                          </div>

                          <div className="of-section-lbl">Or edit fields manually</div>

                          <div className="of-field">
                            <span className="of-field-lbl">Node type</span>
                            <div className="of-typegrid">
                              {NODE_TYPES.map((t) => (
                                <button
                                  key={t.id}
                                  className={`of-typebtn${editingNode.type === t.id ? " on" : ""}`}
                                  data-type={t.id}
                                  onClick={() => updateNode(editingNode.id, { type: t.id })}
                                >
                                  <span className="sw" />
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="of-field">
                            <span className="of-field-lbl">Title</span>
                            <input
                              className="of-input"
                              value={editingNode.title}
                              onChange={(e) => updateNode(editingNode.id, { title: e.target.value })}
                              placeholder="Node title"
                            />
                          </div>

                          <div className="of-field">
                            <span className="of-field-lbl">Subtitle</span>
                            <textarea
                              className="of-textarea"
                              value={editingNode.subtitle}
                              onChange={(e) => updateNode(editingNode.id, { subtitle: e.target.value })}
                              placeholder="Short description"
                            />
                          </div>

                          <div className="of-field">
                            <span className="of-field-lbl">Meta label</span>
                            <input
                              className="of-input"
                              value={editingNode.meta}
                              onChange={(e) => updateNode(editingNode.id, { meta: e.target.value })}
                              placeholder="e.g. ACTION"
                            />
                          </div>

                          <div className="of-field">
                            <span className="of-field-lbl">Icon</span>
                            <select
                              className="of-select"
                              value={editingNode.icon}
                              onChange={(e) => updateNode(editingNode.id, { icon: e.target.value })}
                            >
                              {ICON_CHOICES.map((ic) => (
                                <option key={ic} value={ic}>{ic}</option>
                              ))}
                            </select>
                          </div>

                          <div className="of-inspector-actions">
                            <button className="of-btn-danger" onClick={() => deleteNode(editingNode.id)}>
                              <Icon name="x" />Delete node
                            </button>
                            <button className="of-btn-solid" onClick={() => setEditingNodeId(null)}>
                              <Icon name="check" />Done
                            </button>
                          </div>
                        </div>
                      </div>
                    </aside>
                  );
                }
                return (
                  <aside className="of-iq">
                    <div className="of-iq-head">
                      <div
                        className="of-iq-orb"
                        style={{ background: "linear-gradient(140deg,var(--c-trigger),#0ea5c4)" }}
                      >
                        <Icon name="activity" />
                      </div>
                      <div>
                        <h3>Execution Monitor</h3>
                        <div className="sub">
                          {nodes.length === 0
                            ? "Idle · build a flow to begin"
                            : "Ready · deploy to go live"}
                        </div>
                      </div>
                    </div>
                    <div className="of-iq-body">
                      <div className="of-placeholder" style={{ padding: "32px 8px" }}>
                        <div className="ring"><Icon name="play" /></div>
                        <h2 style={{ fontSize: 16 }}>
                          {nodes.length === 0 ? "No flow yet" : "Flow ready"}
                        </h2>
                        <p>
                          {nodes.length === 0
                            ? "Describe an agent in chat and AgentOS will draw the orchestration here."
                            : "Click any node to edit it, or hit Deploy to go live."}
                        </p>
                      </div>
                    </div>
                  </aside>
                );
              })()}
            </>
          )}

          {tab === "insights" && (
            <div className="of-canvaswrap insights">
              <div className="of-insights">
                <div className="of-insights-head">
                  <div className="of-iq-orb"><Icon name="sparkles" /></div>
                  <div>
                    <h3>AgentOS Intelligence</h3>
                    <div className="sub">
                      Database / Insights · ask in natural language — say “as a graph” or “as a table”
                    </div>
                  </div>
                  <div className="of-spacer" />
                  <span
                    className="of-pill"
                    style={{
                      color: "var(--c-decision)",
                      borderColor: "rgba(var(--c-decision-rgb),.35)",
                      background: "rgba(var(--c-decision-rgb),.1)",
                    }}
                  >
                    <Icon name="database" />
                    &nbsp;Postgres · supabase
                  </span>
                </div>

                <div className="of-insights-body">
                  <div className="of-insights-conv">
                    {messages.map((m, i) => (
                      <div key={i} className={`of-msg ${m.role === "user" ? "user" : "ai"} of-fade`}>
                        <div className="of-bub">
                          {m.content}
                          {m.cron && (
                            <div
                              style={{
                                marginTop: 8,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "5px 11px",
                                background: "rgba(52,226,155,0.1)",
                                border: "1px solid rgba(52,226,155,0.3)",
                                borderRadius: 999,
                                fontSize: 11.5,
                                color: "var(--good)",
                                fontFamily: "var(--font-m)",
                              }}
                            >
                              <Icon name="clock" /> {m.cron}
                            </div>
                          )}
                          {m.role === "assistant" && m.data && m.data.length > 0 && m.render_as && m.render_as !== "text" && (
                            <InsightRenderer data={m.data} render_as={m.render_as} />
                          )}
                          {m.role === "assistant" && m.data && m.data.length > 0 && (
                            <button
                              onClick={() => exportCSV(m.data!)}
                              className="of-card-btn"
                              style={{ marginTop: 10 }}
                            >
                              <Icon name="download" /> Export CSV ({m.data.length} rows)
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {insightBusy && (
                      <div className="of-msg ai">
                        <div className="of-bub" style={{ padding: 0 }}>
                          <div className="of-typing"><i /><i /><i /></div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </div>
              </div>

              <div className="of-cmd-chips">
                <div className="inner">
                  {["How many hot leads today?", "Show sentiment breakdown as a graph", "List recent interactions as a table"].map((s) => (
                    <button
                      key={s}
                      className="of-chip"
                      disabled={insightBusy}
                      onClick={() => handleInsight(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="of-cmdwrap">
                <div className="of-cmd">
                  <span className="lead"><Icon name="sparkles" /></span>
                  <input
                    value={insightInput}
                    onChange={(e) => setInsightInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleInsight();
                      }
                    }}
                    placeholder='Ask for insights — e.g. "How many hot leads today?" or "Email me a summary at 9 AM"'
                  />
                  <button
                    className={`of-mic ${recording ? "rec" : ""}`}
                    onClick={() => handleVoice("insights")}
                    aria-label="Voice command"
                  >
                    <Icon name="mic" />
                  </button>
                  <button
                    className="of-send"
                    onClick={() => handleInsight()}
                    disabled={recording || insightBusy || !insightInput.trim()}
                    aria-label="Send"
                  >
                    <Icon name="arrowUp" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "knowledge" && (
            <div className="of-canvaswrap insights">
              <div className="of-insights-head">
                <div
                  className="of-iq-orb"
                  style={{ background: "linear-gradient(140deg,var(--accent),#ff4d00)" }}
                >
                  <Icon name="book" />
                </div>
                <div>
                  <h3>Knowledge Base</h3>
                  <div className="sub">
                    Crawl your website, upload docs, or paste text — agents and the widget use all of it.
                  </div>
                </div>
              </div>
              <div className="of-kb-wrap">
                <div className="of-kb-panel">

                  {/* ── Crawl website ────────────────────────────────────── */}
                  <div className="of-kb-section-lbl" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="search" />Crawl website
                  </div>
                  <div className="of-kb-crawl-desc">
                    Enter your website URL — AgentOS will crawl up to 40 pages, extract all product info,
                    pricing, FAQs, and policies, then make them instantly searchable by the chat widget.
                  </div>
                  <div className="of-kb-crawl-row">
                    <input
                      className="of-input of-kb-crawl-input"
                      value={crawlUrl}
                      onChange={(e) => { setCrawlUrl(e.target.value); setCrawlMsg(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCrawl(); }}
                      placeholder="https://yourwebsite.com"
                      disabled={crawlBusy}
                    />
                    <button
                      className="of-send of-kb-crawl-btn"
                      onClick={handleCrawl}
                      disabled={crawlBusy || !crawlUrl.trim()}
                    >
                      {crawlBusy
                        ? <><span className="of-kb-spin" />Crawling…</>
                        : <><Icon name="search" />Crawl</>}
                    </button>
                  </div>

                  {/* Extra pages toggle */}
                  <button
                    className="of-kb-extra-toggle"
                    onClick={() => setShowExtraUrls((v) => !v)}
                    disabled={crawlBusy}
                  >
                    <Icon name={showExtraUrls ? "chevron" : "plus"} />
                    {showExtraUrls ? "Hide" : "Add specific pages"} — force-crawl URLs not linked in the site nav
                  </button>

                  {showExtraUrls && (
                    <div className="of-kb-extra-wrap">
                      <div className="of-kb-extra-hint">
                        One URL per line — same domain only. Use this for pages hidden behind JavaScript menus
                        (e.g. <code>/services/</code>, <code>/digital-connects/</code>, <code>/pricing/</code>).
                      </div>
                      <textarea
                        className="of-kb-extra-textarea"
                        value={crawlExtraUrls}
                        onChange={(e) => setCrawlExtraUrls(e.target.value)}
                        placeholder={"https://yourwebsite.com/services/\nhttps://yourwebsite.com/pricing/\nhttps://yourwebsite.com/about/"}
                        rows={4}
                        disabled={crawlBusy}
                      />
                    </div>
                  )}

                  {/* Crawl status */}
                  {crawlMsg && (
                    <div className="of-kb-crawl-msg" style={{ color: crawlMsg.ok ? "var(--good)" : "var(--bad)" }}>
                      {crawlMsg.text}
                    </div>
                  )}

                  {/* Previously crawled domains */}
                  {crawledDomains.length > 0 && (
                    <div className="of-kb-crawled-list">
                      {crawledDomains.map((d) => (
                        <div key={d} className="of-kb-crawled-chip">
                          <Icon name="check" />
                          <span>{d}</span>
                          <span className="of-kb-crawled-tag">crawled</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="of-kb-divider" />

                  {/* ── Upload document ─────────────────────────────────── */}
                  <div className="of-kb-section-lbl">Upload document</div>
                  <div
                    className="of-kb-dropzone"
                    onClick={() => kbFileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files[0];
                      if (f) { setKbFile(f); setKbUploadMsg(null); }
                    }}
                  >
                    <Icon name="upload" />
                    <span>
                      {kbFile
                        ? kbFile.name
                        : "Click or drag a file here — PDF, DOCX, or TXT"}
                    </span>
                    {kbFile && (
                      <span style={{ fontSize: 11, opacity: 0.5 }}>
                        {(kbFile.size / 1024).toFixed(1)} KB
                      </span>
                    )}
                    <input
                      ref={kbFileRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.md,.csv"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setKbFile(f);
                        setKbUploadMsg(null);
                      }}
                    />
                  </div>
                  <div className="of-kb-row">
                    <button
                      className="of-send"
                      style={{ width: "auto", padding: "0 22px", height: 42, borderRadius: 12 }}
                      onClick={handleKbUpload}
                      disabled={kbUploading || !kbFile}
                    >
                      {kbUploading ? "Parsing…" : "Upload & Parse"}
                    </button>
                    {kbUploadMsg && (
                      <span className="of-kb-saved" style={{ color: kbUploadMsg.ok ? "var(--good)" : "var(--bad)" }}>
                        <Icon name={kbUploadMsg.ok ? "check" : "x"} /> {kbUploadMsg.text}
                      </span>
                    )}
                  </div>

                  <div className="of-kb-divider" />

                  {/* ── Paste text ──────────────────────────────────────── */}
                  <div className="of-kb-section-lbl">Or paste text</div>
                  <textarea
                    className="of-kb-textarea"
                    placeholder={"Pricing:\n  Pro plan: $49/mo\n  Basic plan: $19/mo\n\nReturn policy: 30-day no-questions-asked refund.\n\nSupport email: support@yourbrand.com"}
                    value={kbText}
                    onChange={(e) => setKbText(e.target.value)}
                  />
                  <div className="of-kb-row">
                    <button
                      className="of-send"
                      style={{ width: "auto", padding: "0 22px", height: 42, borderRadius: 12 }}
                      onClick={handleSaveKb}
                      disabled={kbSaving || !kbText.trim()}
                    >
                      {kbSaving ? "Saving…" : "Save & Embed"}
                    </button>
                    {kbSaved && (
                      <span className="of-kb-saved">
                        <Icon name="check" /> Saved successfully
                      </span>
                    )}
                  </div>


                  {/* ── Saved chunks list — grouped by source ───────────── */}
                  <div className="of-kb-divider" />
                  <div className="of-kb-section-lbl">
                    Saved knowledge ({kbChunks.length} chunk{kbChunks.length !== 1 ? "s" : ""})
                  </div>
                {kbLoading && <div style={{ opacity: 0.5, fontSize: 13, padding: "8px 0" }}>Loading…</div>}
                {!kbLoading && kbChunks.length === 0 && (
                  <div style={{ opacity: 0.4, fontSize: 13, padding: "8px 0" }}>No knowledge saved yet.</div>
                )}
                {!kbLoading && (() => {
                  // Group by source, preserving insertion order (API returns newest-first,
                  // so reverse first so chunks within each group are in document order)
                  const groups = new Map<string, typeof kbChunks>();
                  [...kbChunks].reverse().forEach((c) => {
                    const key = c.source ?? "manual";
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(c);
                  });
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                      {[...groups.entries()].map(([source, chunks]) => (
                        <div key={source} style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 10,
                          overflow: "hidden",
                        }}>
                          {/* Source header */}
                          <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "8px 14px",
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                            background: "rgba(255,255,255,0.03)",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.6 }}>
                              <Icon name="file" /> {source} <span style={{ opacity: 0.5 }}>· {chunks.length} chunk{chunks.length !== 1 ? "s" : ""}</span>
                            </div>
                            <button
                              onClick={() => Promise.all(chunks.map((c) => handleDeleteKbChunk(c.id)))}
                              style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.4, color: "var(--bad, #f55)", padding: 4, fontSize: 11 }}
                              title="Delete all chunks from this source"
                            >
                              <Icon name="x" /> Remove
                            </button>
                          </div>
                          {/* Joined content */}
                          <div style={{ padding: "12px 14px", fontSize: 13, lineHeight: 1.6, opacity: 0.8, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflowY: "auto" }}>
                            {chunks.map((c) => c.content).join(" ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                </div>
              </div>
            </div>
          )}

          {tab === "crons" && <CronsPanel />}

          {tab === "embed" && (
            <EmbedPanel
              botName={widgetBotName}   onBotName={setWidgetBotName}
              color={widgetColor}       onColor={setWidgetColor}
              greeting={widgetGreeting} onGreeting={setWidgetGreeting}
              copied={widgetCopied}     onCopy={() => {
                // onCopy only fires on click — window is always defined here
                const params = new URLSearchParams({
                  accountId: "demo",
                  botName:   widgetBotName,
                  color:     widgetColor,
                  greeting:  widgetGreeting,
                });
                const src = `${window.location.origin}/widget?${params.toString()}`;
                const snippet = buildSnippet(src, widgetColor);
                navigator.clipboard.writeText(snippet).then(() => {
                  setWidgetCopied(true);
                  setTimeout(() => setWidgetCopied(false), 2200);
                });
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ── Snippet builder (pure function, used by EmbedPanel + copy handler) ────────
function buildSnippet(src: string, color: string) {
  return `<!-- AgentOS Chat Widget — paste before </body> -->
<script>
(function(d){
  var color="${color}";
  // ── Chat iframe ──────────────────────────────────────────────────────
  var frame=d.createElement("iframe");
  frame.src="${src}";
  frame.id="agentos-widget-frame";
  frame.allow="microphone";
  frame.style.cssText="position:fixed;bottom:96px;right:24px;width:390px;height:580px;border:none;border-radius:20px;z-index:2147483646;box-shadow:0 12px 56px rgba(0,0,0,.45);display:none;transition:opacity .2s,transform .2s;transform:scale(.97);opacity:0;";
  d.body.appendChild(frame);

  // ── Toggle button ────────────────────────────────────────────────────
  var btn=d.createElement("button");
  btn.id="agentos-widget-btn";
  btn.style.cssText="position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:"+color+";border:none;cursor:pointer;z-index:2147483647;box-shadow:0 4px 20px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;transition:transform .15s;";
  btn.setAttribute("aria-label","Open chat");
  btn.innerHTML='<svg width=\\"26\\" height=\\"26\\" viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"white\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><path d=\\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\\"/></svg>';
  d.body.appendChild(btn);

  var open=false;
  btn.addEventListener("click",function(){
    open=!open;
    if(open){
      frame.style.display="block";
      setTimeout(function(){frame.style.opacity="1";frame.style.transform="scale(1)";},10);
      btn.innerHTML='<svg width=\\"22\\" height=\\"22\\" viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"white\\" stroke-width=\\"2.5\\" stroke-linecap=\\"round\\"><path d=\\"M18 6 6 18\\"/><path d=\\"M6 6l12 12\\"/></svg>';
    } else {
      frame.style.opacity="0";frame.style.transform="scale(.97)";
      setTimeout(function(){frame.style.display="none";},200);
      btn.innerHTML='<svg width=\\"26\\" height=\\"26\\" viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"white\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><path d=\\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\\"/></svg>';
    }
    btn.style.transform=open?"scale(.9)":"scale(1)";
    setTimeout(function(){btn.style.transform="scale(1)";},150);
  });
})(document);
</script>`;
}

// ── Embed Panel Component ─────────────────────────────────────────────────────
type EmbedPanelProps = {
  botName: string;   onBotName: (v: string) => void;
  color: string;     onColor: (v: string) => void;
  greeting: string;  onGreeting: (v: string) => void;
  copied: boolean;   onCopy: () => void;
};
const PRESET_COLORS = ["#22d3ee", "#ff7a18", "#b06bff", "#34e29b", "#f59e0b", "#ef4444"];

function EmbedPanel({ botName, onBotName, color, onColor, greeting, onGreeting, copied, onCopy }: EmbedPanelProps) {
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const params = new URLSearchParams({ accountId: "demo", botName, color, greeting });
  const widgetSrc = origin ? `${origin}/widget?${params.toString()}` : "";
  const snippet = widgetSrc ? buildSnippet(widgetSrc, color) : "";

  return (
    <div className="of-embed-root">

      {/* ── Fixed header ─────────────────────────────────────────────────── */}
      <div className="of-embed-hdr">
        <div className="of-iq-orb" style={{ background: "linear-gradient(140deg,#b06bff,#22d3ee)" }}>
          <Icon name="code" />
        </div>
        <div>
          <h3>Website Widget</h3>
          <div className="sub">Configure, preview, and copy your embeddable chat widget.</div>
        </div>
        <div className="of-spacer" />
        {widgetSrc && (
          <a href={widgetSrc} target="_blank" rel="noopener noreferrer" className="of-ghost"
            style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none", fontSize: 13 }}>
            <Icon name="externalLink" />Open widget
          </a>
        )}
      </div>

      {/* ── Scrollable content — no overlap possible ─────────────────────── */}
      <div className="of-embed-scroll">

        {/* Body: config + preview side-by-side */}
        <div className="of-embed-body">

          {/* Left column */}
          <div className="of-embed-col">

            {/* Configure card */}
            <div className="of-embed-card">
              <div className="of-embed-card-title">Configure</div>

              <div className="of-field">
                <span className="of-field-lbl">Bot name</span>
                <input className="of-input" value={botName}
                  onChange={(e) => onBotName(e.target.value)}
                  placeholder="e.g. Support Bot" maxLength={32} />
              </div>

              <div className="of-field">
                <span className="of-field-lbl">Opening greeting</span>
                <textarea className="of-textarea" value={greeting}
                  onChange={(e) => onGreeting(e.target.value)}
                  placeholder="Hi! How can I help you today?" maxLength={160} />
              </div>

              <div className="of-field">
                <span className="of-field-lbl">Accent colour</span>
                <div className="of-embed-swatches">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} onClick={() => onColor(c)} title={c}
                      className={`of-embed-swatch${color === c ? " active" : ""}`}
                      style={{ background: c, ["--sw" as string]: c }} />
                  ))}
                  <label className="of-embed-custom-color" title="Custom colour">
                    <input type="color" value={color} onChange={(e) => onColor(e.target.value)} />
                    <span style={{ background: color }} />
                  </label>
                  <span className="of-embed-hex">{color}</span>
                </div>
              </div>
            </div>

            {/* Steps card */}
            <div className="of-embed-steps">
              {[
                { n: 1, text: <>Add FAQs/docs to <b>Knowledge Base</b></> },
                { n: 2, text: <>Configure the widget above</> },
                { n: 3, text: <>Copy the snippet and paste before <code>&lt;/body&gt;</code></> },
                { n: 4, text: <>Your bot goes live on your site</> },
              ].map(({ n, text }) => (
                <div key={n} className="of-embed-step">
                  <span className="of-embed-step-n">{n}</span>
                  <span className="of-embed-step-text">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column — live preview */}
          <div className="of-embed-col">
            <div className="of-embed-card of-embed-preview-card">
              <div className="of-embed-card-title">Live preview</div>
              <div className="of-embed-browser">
                <div className="of-embed-browser-bar">
                  {["#ef4444","#f59e0b","#34e29b"].map((c) => (
                    <span key={c} className="of-embed-browser-dot" style={{ background: c }} />
                  ))}
                  <span className="of-embed-browser-url">yourwebsite.com</span>
                </div>
                {widgetSrc ? (
                  <iframe key={widgetSrc} src={widgetSrc} title="Widget preview"
                    style={{ position: "absolute", top: 36, left: 0, right: 0, bottom: 0,
                      width: "100%", height: "calc(100% - 36px)", border: "none" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 36, display: "flex",
                    alignItems: "center", justifyContent: "center", color: "var(--ink-3)",
                    fontSize: 13 }}>Loading…</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Snippet block — always below the grid, never overlapping ────── */}
        <div className="of-embed-snippet-section">
          <div className="of-embed-snippet-header">
            <div>
              <div className="of-embed-card-title" style={{ marginBottom: 2 }}>Embed snippet</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Paste this before <code style={{ fontFamily: "var(--font-m)", fontSize: 11, background: "rgba(255,255,255,.06)", borderRadius: 4, padding: "1px 6px" }}>&lt;/body&gt;</code> on your website
              </div>
            </div>
            <button className="of-embed-copy-btn" onClick={onCopy}
              style={{ borderColor: copied ? "var(--good)" : "rgba(255,255,255,.12)",
                color: copied ? "var(--good)" : "var(--ink-1)" }}>
              <Icon name={copied ? "check" : "copy"} />
              {copied ? "Copied!" : "Copy snippet"}
            </button>
          </div>
          <pre className="of-snippet-pre">
            {snippet || "// Configure your widget above to generate the snippet."}
          </pre>
        </div>

      </div>{/* end .of-embed-scroll */}
    </div>
  );
}

// ── Crons Panel ───────────────────────────────────────────────────────────────
type CronJob = {
  id: string;
  key?: string;
  name?: string;
  cron_expression: string;
  delivery?: string;
  description?: string;
};

function CronsPanel() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [clearingAll, setClearingAll] = useState(false);

  useEffect(() => {
    fetch("/api/cron?accountId=demo")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []));
  }, []);

  async function deleteJob(id: string) {
    setDeleting((s) => new Set(s).add(id));
    try {
      await fetch("/api/cron", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id }),
      });
      setJobs((j) => j.filter((x) => x.id !== id));
    } finally {
      setDeleting((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function clearAll() {
    setClearingAll(true);
    try {
      await fetch("/api/cron", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, accountId: "demo" }),
      });
      setJobs([]);
    } finally {
      setClearingAll(false);
    }
  }

  return (
    <div className="of-canvaswrap insights">
      <div className="of-insights-head">
        <div className="of-iq-orb" style={{ background: "linear-gradient(140deg,var(--c-schedule),#0e9b66)" }}>
          <Icon name="clock" />
        </div>
        <div style={{ flex: 1 }}>
          <h3>Scheduled Reports</h3>
          <div className="sub">
            Cron-driven digests. Trigger one from the Insights tab — e.g. “email a hot-lead briefing at 9 AM daily.”
          </div>
        </div>
        {jobs.length > 0 && (
          <button
            className="of-card-btn"
            onClick={clearAll}
            disabled={clearingAll}
            style={{ whiteSpace: "nowrap" }}
          >
            <Icon name="x" /> {clearingAll ? "Clearing..." : "Clear all"}
          </button>
        )}
      </div>
      <div className="of-kb-wrap">
        <div className="of-kb-panel">
          {jobs.length === 0 && (
            <div className="of-placeholder" style={{ padding: "40px 8px" }}>
              <div className="ring"><Icon name="clock" /></div>
              <h2 style={{ fontSize: 17 }}>No scheduled reports yet</h2>
              <p>Go to <b>Insights</b> and say <i>“Email me a hot-lead briefing at 9 AM daily.”</i></p>
            </div>
          )}
          {jobs.map((job) => (
            <div key={job.id} className="of-cron">
              <div className="ico"><Icon name="clock" /></div>
              <div className="body">
                <div className="ct">{job.name ?? "Scheduled report"}</div>
                <div className="cs">
                  {job.cron_expression}
                  {job.delivery ? ` · ${job.delivery}` : ""}
                  {job.description ? ` · ${job.description}` : ""}
                </div>
              </div>
              <span className="stat"><span className="d" />Active</span>
              <button
                className="of-card-btn"
                style={{ marginLeft: 8 }}
                onClick={() => deleteJob(job.id)}
                disabled={deleting.has(job.id)}
              >
                <Icon name="x" /> {deleting.has(job.id) ? "Removing..." : "Remove"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
