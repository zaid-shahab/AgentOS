"use client";

import { useState, useRef, useEffect } from "react";
import NodeCanvas from "@/components/NodeCanvas";
import InsightRenderer from "@/components/InsightRenderer";
import Icon from "@/components/Icon";
import Landing from "@/components/Landing";
import type { GraphNode, GraphEdge } from "@/lib/schema";

type Tab = "home" | "architect" | "insights" | "knowledge" | "crons";
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
  "instagram", "messenger", "branch", "message", "userplus", "shield",
  "tag", "search", "bell", "mail", "clock", "bot", "sparkles", "zap",
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
  const [buildError, setBuildError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  // ── Orchestrator conversation state (persists across chat ↔ canvas) ──
  const [orchMode, setOrchMode] = useState<"chat" | "canvas">("chat");
  const [orchMsgs, setOrchMsgs] = useState<OrchMsg[]>([
    { role: "assistant", content: ORCH_GREETING },
  ]);
  const [orchBusy, setOrchBusy] = useState(false);
  const orchEndRef = useRef<HTMLDivElement>(null);

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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const voiceTargetRef = useRef<"architect" | "insights" | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, insightBusy]);

  useEffect(() => {
    orchEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [orchMsgs, orchBusy]);

  // ── Orchestrator: build the actual flow from the accumulated description ───
  async function runOrchBuild(description: string) {
    setBuildError(null);
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
      try { recognitionRef.current.stop(); } catch {}
      return;
    }

    const SR =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    voiceTargetRef.current = target === "node" ? null : target;
    const baseText =
      target === "architect" ? prompt : target === "insights" ? insightInput : nodeEditInput;
    const setter =
      target === "architect" ? setPrompt : target === "insights" ? setInsightInput : setNodeEditInput;
    let finalChunk = "";

    recognition.onstart = () => setRecording(true);

    recognition.onresult = (e: SpeechRecognitionEvent) => {
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

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      // Ignore "no-speech" so a pause doesn't kill the session — just keep listening.
      if (e.error === "no-speech" || e.error === "aborted") return;
      console.warn("Speech recognition error:", e.error);
    };

    recognition.onend = () => {
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
      if (data.success) setKbSaved(true);
    } finally {
      setKbSaving(false);
    }
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
            <div className="of-avatar">AW</div>
          </div>
        </nav>

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
                    Drop in product info, pricing, FAQs — agents reference this when crafting DM replies.
                  </div>
                </div>
              </div>
              <div className="of-kb-wrap">
                <div className="of-kb-panel">
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
                </div>
              </div>
            </div>
          )}

          {tab === "crons" && <CronsPanel />}
        </div>
      </div>
    </>
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

  useEffect(() => {
    fetch("/api/cron?accountId=demo")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []));
  }, []);

  async function deleteJob(id: string) {
    await fetch("/api/cron", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: id }),
    });
    setJobs((j) => j.filter((x) => x.id !== id));
  }

  return (
    <div className="of-canvaswrap insights">
      <div className="of-insights-head">
        <div className="of-iq-orb" style={{ background: "linear-gradient(140deg,var(--c-schedule),#0e9b66)" }}>
          <Icon name="clock" />
        </div>
        <div>
          <h3>Scheduled Reports</h3>
          <div className="sub">
            Cron-driven digests. Trigger one from the Insights tab — e.g. “email a hot-lead briefing at 9 AM daily.”
          </div>
        </div>
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
              >
                <Icon name="x" /> Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
