// Mirrors web/lib/schema.ts — keep in sync
export interface AutomationConfig {
  name: string;
  trigger: {
    platform: "instagram_comment" | "instagram_dm" | "messenger_dm";
    description: string;
  };
  evaluations: {
    id: string;
    condition: string;
    intent_tag: string;
    description: string;
  }[];
  actions: {
    id: string;
    type: "send_dm" | "hide_comment" | "tag_lead" | "rag_query" | "alert_webhook" | "send_email" | "no_action";
    payload?: Record<string, unknown>;
    description: string;
    linked_evaluation_id?: string;
  }[];
}
