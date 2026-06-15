import type { AutomationConfig, GraphNode, GraphEdge, Graph } from "./schema";

const NODE_W = 240;
const NODE_H = 100;
const COL_GAP = 120;
const ROW_GAP = 30;

const PLATFORM_ICON: Record<string, string> = {
  instagram_comment: "instagram",
  instagram_dm:      "instagram",
  messenger_dm:      "messenger",
};

export function configToGraph(config: AutomationConfig): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Column x positions
  const col1 = 40;
  const col2 = col1 + NODE_W + COL_GAP;
  const col3 = col2 + NODE_W + COL_GAP;

  // ── Trigger node ──────────────────────────────────────────────────────────
  const triggerId = "n_trigger";
  const triggerY = 40;
  nodes.push({
    id: triggerId,
    type: "trigger",
    icon: PLATFORM_ICON[config.trigger.platform] ?? "instagram",
    title: platformLabel(config.trigger.platform),
    subtitle: config.trigger.description,
    meta: "TRIGGER",
    x: col1,
    y: triggerY,
  });

  // ── Decision nodes ────────────────────────────────────────────────────────
  const evalIds: string[] = [];
  config.evaluations.forEach((ev, i) => {
    const id = `n_eval_${ev.id}`;
    evalIds.push(id);
    nodes.push({
      id,
      type: "decision",
      icon: "branch",
      title: ev.intent_tag,
      subtitle: ev.condition,
      meta: "GPT-4o · DECISION",
      x: col2,
      y: 40 + i * (NODE_H + ROW_GAP),
    });
    edges.push({ from: triggerId, to: id });
  });

  // If no evaluations, draw a direct edge from trigger to first action
  if (config.evaluations.length === 0) {
    // will be linked below
  }

  // ── Action nodes ──────────────────────────────────────────────────────────
  config.actions.forEach((action, i) => {
    const id = `n_action_${action.id}`;
    nodes.push({
      id,
      type: "action",
      icon: actionIcon(action.type),
      title: actionLabel(action.type),
      subtitle: action.description,
      meta: "ACTION",
      x: col3,
      y: 40 + i * (NODE_H + ROW_GAP),
    });

    if (action.linked_evaluation_id) {
      const sourceId = `n_eval_${action.linked_evaluation_id}`;
      const isBad =
        action.type === "hide_comment" ? "bad" : null;
      edges.push({ from: sourceId, to: id, label: action.description.slice(0, 20), tone: isBad as "bad" | null });
    } else if (evalIds.length === 0) {
      edges.push({ from: triggerId, to: id });
    } else {
      edges.push({ from: evalIds[0], to: id });
    }
  });

  return { nodes, edges, config };
}

function platformLabel(p: string) {
  const map: Record<string, string> = {
    instagram_comment: "Instagram Comment",
    instagram_dm:      "Instagram DM",
    messenger_dm:      "Messenger DM",
  };
  return map[p] ?? "Meta Event";
}

function actionIcon(t: string) {
  const map: Record<string, string> = {
    send_dm:        "message",
    hide_comment:   "shield",
    tag_lead:       "tag",
    rag_query:      "search",
    alert_webhook:  "bell",
    send_email:     "mail",
    no_action:      "slash",
  };
  return map[t] ?? "zap";
}

function actionLabel(t: string) {
  const map: Record<string, string> = {
    send_dm:        "Send DM",
    hide_comment:   "Hide Comment",
    tag_lead:       "Tag as Lead",
    rag_query:      "RAG Query → DM",
    alert_webhook:  "Alert Webhook",
    send_email:     "Send Email",
    no_action:      "No Action",
  };
  return map[t] ?? t;
}
