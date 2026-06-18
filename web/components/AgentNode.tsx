"use client";

import type { GraphNode } from "@/lib/schema";
import Icon from "./Icon";

interface Props {
  node: GraphNode;
  index: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export default function AgentNode({ node, index, selected, onSelect }: Props) {
  const isSchedule = node.type === "schedule";
  return (
    <div
      className={`of-node appear${selected ? " selected" : ""}`}
      data-type={node.type}
      style={{ left: node.x, top: node.y, animationDelay: `${index * 0.12}s` }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(node.id);
      }}
    >
      <span className="of-port in" />
      <span className="of-port out" />
      <div className="of-node-head">
        <div className="of-node-ico"><Icon name={node.icon} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="of-node-meta">{node.meta}</div>
          <div className="of-node-title">{node.title}</div>
        </div>
      </div>
      <div className="of-node-sub">{node.subtitle}</div>
      <div className="of-node-foot">
        <span className="of-node-status">
          <span className="d" />
          {isSchedule ? "Scheduled" : "Live"}
        </span>
      </div>
    </div>
  );
}
