"use client";

import type { GraphNode } from "@/lib/schema";

interface Props {
  node: GraphNode;
  index: number;
}

const TYPE_ACCENT: Record<string, string> = {
  trigger:  "var(--cyan)",
  decision: "var(--purple)",
  action:   "var(--orange)",
  schedule: "var(--green)",
};

export default function AgentNode({ node, index }: Props) {
  const accent = TYPE_ACCENT[node.type] ?? "var(--cyan)";

  return (
    <div
      className="of-node appear"
      data-type={node.type}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        animationDelay: `${index * 0.12}s`,
        "--accent": accent,
      } as React.CSSProperties}
    >
      <span className="of-port in" />
      <div className="of-node-inner">
        <span className="of-node-meta">{node.meta}</span>
        <span className="of-node-icon">{node.icon}</span>
        <p className="of-node-title">{node.title}</p>
        <p className="of-node-subtitle">{node.subtitle}</p>
      </div>
      <span className="of-port out" />
    </div>
  );
}
