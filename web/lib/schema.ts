import { z } from "zod";

// ─── Automation Config ────────────────────────────────────────────────────────
// The JSON state machine the LLM compiles user intent into.

export const TriggerSchema = z.object({
  platform: z.enum([
    "instagram_comment",
    "instagram_dm",
    "messenger_dm",
    "facebook_comment",
    "facebook_post",
    "instagram_post",
  ]),
  description: z.string(),
});

export const EvaluationSchema = z.object({
  id: z.string(),
  condition: z.string(),       // e.g. "sentiment == 'hostile'"
  intent_tag: z.string(),      // e.g. "Pricing", "Troll", "Support"
  description: z.string(),
});

export const ActionSchema = z.object({
  id: z.string(),
  type: z.enum([
    "send_dm",
    "reply_comment",
    "hide_comment",
    "tag_lead",
    "rag_query",
    "alert_webhook",
    "send_email",
    "no_action",
  ]),
  payload: z.record(z.string(), z.unknown()).optional(),
  description: z.string(),
  linked_evaluation_id: z.string().optional(),
});

export const AutomationConfigSchema = z.object({
  name: z.string(),
  trigger: TriggerSchema,
  evaluations: z.array(EvaluationSchema),
  actions: z.array(ActionSchema),
});

export type AutomationConfig = z.infer<typeof AutomationConfigSchema>;

// ─── Node Graph ───────────────────────────────────────────────────────────────
// The visual representation the frontend NodeCanvas renders.

export const NodeTypeEnum = z.enum(["trigger", "decision", "action", "schedule"]);

export const GraphNodeSchema = z.object({
  id: z.string(),
  type: NodeTypeEnum,
  icon: z.string(),
  title: z.string(),
  subtitle: z.string(),
  meta: z.string(),
  x: z.number(),
  y: z.number(),
});

export const GraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  tone: z.enum(["bad"]).nullable().optional(),
});

export const GraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  config: AutomationConfigSchema,
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type Graph = z.infer<typeof GraphSchema>;

// ─── Cron Job ─────────────────────────────────────────────────────────────────

export const CronJobSchema = z.object({
  name: z.string(),
  cron_expression: z.string(),   // standard cron: "0 9 * * *"
  report_type: z.enum(["hot_leads", "sentiment_summary", "interaction_count", "custom"]),
  delivery: z.enum(["email", "webhook", "in_app"]),
  delivery_target: z.string().optional(),
  sql_query: z.string().optional(),
  description: z.string(),
  run_once: z.boolean().default(false),  // if true, job auto-deletes after first successful run
});

export type CronJob = z.infer<typeof CronJobSchema>;

// ─── Insight Query ────────────────────────────────────────────────────────────

export const InsightQuerySchema = z.object({
  sql: z.string(),
  explanation: z.string(),
  render_as: z.enum(["text", "table", "bar_chart", "line_chart"]),
});

export type InsightQuery = z.infer<typeof InsightQuerySchema>;
