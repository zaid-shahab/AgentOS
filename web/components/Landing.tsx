"use client";

import Icon from "./Icon";

type NavTarget = "architect" | "insights" | "knowledge" | "crons";

interface Props {
  onNav: (tab: NavTarget) => void;
}

/* ---- visuals for each step ---- */

function VizDescribe() {
  return (
    <div className="lp-viz lp-viz-describe">
      <div className="lp-mic"><Icon name="mic" /></div>
      <div className="lp-wave">
        {[10, 20, 32, 18, 26, 14, 30, 22, 12, 28, 16].map((h, i) => (
          <i key={i} style={{ height: h, animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <div className="lp-speech">
        “DM the SUMMER20 code to anyone asking for a discount, and hide any scam comments.”
      </div>
    </div>
  );
}

function MiniNode({ type, icon, label }: { type: string; icon: string; label: string }) {
  return (
    <div className="lp-node" data-type={type}>
      <span className="lp-node-ico"><Icon name={icon} /></span>
      <span className="lp-node-lbl">{label}</span>
    </div>
  );
}

function VizOrchestrate() {
  return (
    <div className="lp-viz lp-viz-graph">
      <svg className="lp-graph-edges" viewBox="0 0 260 150" preserveAspectRatio="none">
        <path d="M70 40 C110 40 110 40 130 40" className="lp-edge" />
        <path d="M70 40 C110 40 110 110 130 110" className="lp-edge" />
      </svg>
      <div className="lp-node-col left">
        <MiniNode type="trigger" icon="instagram" label="IG Comment" />
      </div>
      <div className="lp-node-col mid">
        <MiniNode type="decision" icon="branch" label="Sentiment" />
      </div>
      <div className="lp-node-col right">
        <MiniNode type="action" icon="message" label="Send DM" />
        <MiniNode type="action" icon="shield" label="Hide" />
      </div>
    </div>
  );
}

function VizExecute() {
  return (
    <div className="lp-viz lp-viz-phone">
      <div className="lp-phone">
        <div className="lp-phone-notch" />
        <div className="lp-phone-screen">
          <div className="lp-ig-bar"><Icon name="instagram" /><span>aurawear</span></div>
          <div className="lp-ig-comment">
            <span className="lp-ig-av" style={{ background: "linear-gradient(140deg,#b06bff,#5b8cff)" }}>M</span>
            <div><b>maya_styles</b> any promo codes active?? 🔥</div>
          </div>
          <div className="lp-ig-dm">
            <span className="lp-ig-tag">AUTO-DM</span>
            Hey! Here&apos;s your 20% off code: <b>SUMMER20</b> 💛
          </div>
          <div className="lp-ig-hidden">
            <Icon name="shield" /> Comment from @troll_account123 hidden
          </div>
        </div>
      </div>
    </div>
  );
}

function VizInsights() {
  const bars = [{ v: 68, t: "good" }, { v: 19, t: "neutral" }, { v: 13, t: "bad" }];
  return (
    <div className="lp-viz lp-viz-insights">
      <div className="lp-chart">
        {bars.map((b, i) => (
          <div className="lp-chart-bar" key={i}>
            <div
              className={`lp-chart-fill ${b.t}`}
              style={{ height: `${b.v}%`, animationDelay: `${i * 0.12}s` }}
            />
          </div>
        ))}
      </div>
      <div className="lp-cron">
        <span className="lp-cron-dot" /><Icon name="clock" /> 9:00 AM · Daily report
      </div>
    </div>
  );
}

const STEPS: { n: string; tag: string; title: string; body: string; Viz: () => JSX.Element }[] = [
  {
    n: "01", tag: "DESCRIBE", title: "Speak it into existence", Viz: VizDescribe,
    body: "Hit the mic and describe the agent in plain language — the trigger, the logic, the actions. No flow-builder, no code.",
  },
  {
    n: "02", tag: "ORCHESTRATE", title: "Watch the flow assemble", Viz: VizOrchestrate,
    body: "AgentOS designs the orchestration with you, then draws it as a live node graph: triggers, an AI sentiment switch, and branched actions.",
  },
  {
    n: "03", tag: "EXECUTE", title: "Deploy to Meta platforms", Viz: VizExecute,
    body: "One click deploys the agent live on Instagram and Messenger. It DMs hot leads, captures them, and hides toxic comments in real time.",
  },
  {
    n: "04", tag: "INTERROGATE", title: "Ask your data anything", Viz: VizInsights,
    body: "Every event is logged to Postgres. Ask in natural language — get a graph, a table, or a report — and schedule it to run daily on a cron.",
  },
];

const CAPS = [
  { icon: "mic",       title: "Voice-first authoring",      body: "Build and edit agents by talking. Speech becomes a deployable orchestration in seconds." },
  { icon: "branch",    title: "AI sentiment routing",        body: "Claude-grade intent + tone classification branches every message to the right action." },
  { icon: "instagram", title: "Native Meta channels",        body: "Instagram and Messenger — comments, DMs and replies, all automated by the webhook engine." },
  { icon: "database",  title: "Conversational insights",     body: "Text-to-SQL over your event log. Answers as graphs, tables or mini-reports." },
  { icon: "shield",    title: "Brand-safety guardrails",     body: "Auto-hide scam, spam and profanity to protect ad spend and reputation." },
  { icon: "clock",     title: "Scheduled automation",        body: "Register Redis-backed cron jobs by voice — daily digests, emailed summaries." },
];

export default function Landing({ onNav }: Props) {
  return (
    <div className="lp-scroll">
      <div className="lp">
        {/* hero */}
        <header className="lp-hero">
          <div className="lp-hero-copy">
            <div className="lp-eyebrow">
              <span className="lp-eyebrow-dot" />Generative agent platform
            </div>
            <h1 className="lp-h1">
              Deploy AI agents to Meta&nbsp;platforms <span className="lp-grad">by voice.</span>
            </h1>
            <p className="lp-lead">
              AgentOS turns a spoken sentence into a live, deployable conversational agent —
              drawn as a node graph, executing on Instagram and Messenger, and queryable in
              plain language. Describe what you want; we orchestrate, deploy and measure it.
            </p>
            <div className="lp-cta-row">
              <button className="lp-btn primary" onClick={() => onNav("architect")}>
                <Icon name="mic" />Build an agent
              </button>
              <button className="lp-btn ghost" onClick={() => onNav("insights")}>
                <Icon name="database" />Explore insights
              </button>
            </div>
            <div className="lp-stats">
              <div><b>3s</b><span>voice → deployed</span></div>
              <div><b>2</b><span>Meta channels</span></div>
              <div><b>0</b><span>lines of code</span></div>
            </div>
          </div>

          <div className="lp-hero-viz">
            <div className="lp-hero-glow" />
            <div className="lp-hero-logo"><Icon name="zap" /></div>
            <div className="lp-hero-card a">
              <span className="lp-hc-ico" data-type="trigger"><Icon name="instagram" /></span>
              <div><b>Trigger</b><i>IG Comment</i></div>
            </div>
            <div className="lp-hero-card b">
              <span className="lp-hc-ico" data-type="decision"><Icon name="branch" /></span>
              <div><b>Decision</b><i>Sentiment</i></div>
            </div>
            <div className="lp-hero-card c">
              <span className="lp-hc-ico" data-type="action"><Icon name="message" /></span>
              <div><b>Action</b><i>Send DM</i></div>
            </div>
          </div>
        </header>

        {/* how it works */}
        <section className="lp-section">
          <div className="lp-section-head">
            <div className="lp-eyebrow">
              <span className="lp-eyebrow-dot" />How it works
            </div>
            <h2 className="lp-h2">From a sentence to a shipped agent</h2>
            <p className="lp-sub">
              Four steps. The whole loop runs from one screen — describe, build, deploy,
              and interrogate without leaving AgentOS.
            </p>
          </div>

          <div className="lp-steps">
            {STEPS.map((s, i) => {
              const { Viz } = s;
              return (
                <div className={`lp-step ${i % 2 ? "rev" : ""}`} key={s.n}>
                  <div className="lp-step-copy">
                    <div className="lp-step-tag">
                      <span className="lp-step-n">{s.n}</span>{s.tag}
                    </div>
                    <h3 className="lp-step-title">{s.title}</h3>
                    <p className="lp-step-body">{s.body}</p>
                  </div>
                  <div className="lp-step-viz"><Viz /></div>
                </div>
              );
            })}
          </div>
        </section>

        {/* capabilities */}
        <section className="lp-section">
          <div className="lp-section-head">
            <div className="lp-eyebrow">
              <span className="lp-eyebrow-dot" />Capabilities
            </div>
            <h2 className="lp-h2">Everything an agent needs, built in</h2>
          </div>
          <div className="lp-caps">
            {CAPS.map((c) => (
              <div className="lp-cap" key={c.title}>
                <span className="lp-cap-ico"><Icon name={c.icon} /></span>
                <h4>{c.title}</h4>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* closing CTA */}
        <section className="lp-closer">
          <div className="lp-closer-glow" />
          <h2 className="lp-h2">Ready to forge your first agent?</h2>
          <p className="lp-sub">Open the Orchestrator and just start talking.</p>
          <button className="lp-btn primary lg" onClick={() => onNav("architect")}>
            <Icon name="mic" />Open the Orchestrator
          </button>
          <div className="lp-foot">AgentOS · generative agents for Meta platforms</div>
        </section>
      </div>
    </div>
  );
}
