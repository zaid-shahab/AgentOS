"use client";

import { useRef, useState, useEffect } from "react";
import type { GraphNode, GraphEdge } from "@/lib/schema";
import AgentNode from "./AgentNode";

const NODE_W = 240;
const NODE_H = 100;

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface Pan { x: number; y: number }

function edgePath(a: GraphNode, b: GraphNode) {
  const x1 = a.x + NODE_W;    const y1 = a.y + NODE_H / 2;
  const x2 = b.x;              const y2 = b.y + NODE_H / 2;
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}

export default function NodeCanvas({ nodes, edges }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState<Pan>({ x: 40, y: 40 });
  const dragging = useRef(false);
  const last = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Auto-fit on first load
  useEffect(() => {
    if (!nodes.length) return;
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_W));
    const maxY = Math.max(...nodes.map((n) => n.y + NODE_H));
    const cw = canvasRef.current?.clientWidth ?? 800;
    const ch = canvasRef.current?.clientHeight ?? 500;
    setPan({
      x: Math.max(40, (cw - maxX) / 2),
      y: Math.max(40, (ch - maxY) / 2),
    });
  }, [nodes]);

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan((p) => ({ x: p.x + e.clientX - last.current.x, y: p.y + e.clientY - last.current.y }));
    last.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { dragging.current = false; };

  return (
    <div
      ref={canvasRef}
      className="of-canvas"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* SVG layer for edges */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
      >
        <g transform={`translate(${pan.x},${pan.y})`}>
          {edges.map((edge, i) => {
            const a = nodeMap[edge.from];
            const b = nodeMap[edge.to];
            if (!a || !b) return null;
            return (
              <g key={i}>
                <path
                  d={edgePath(a, b)}
                  fill="none"
                  stroke={edge.tone === "bad" ? "#ef4444" : "rgba(255,255,255,0.15)"}
                  strokeWidth="2"
                  strokeDasharray={edge.tone === "bad" ? "6 3" : undefined}
                />
                {edge.label && (
                  <text
                    x={(a.x + NODE_W + b.x) / 2}
                    y={(a.y + b.y) / 2 + NODE_H / 2 - 6}
                    fill="rgba(255,255,255,0.4)"
                    fontSize="11"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Node layer */}
      <div style={{ position: "absolute", transform: `translate(${pan.x}px,${pan.y}px)` }}>
        {nodes.map((node, i) => (
          <AgentNode key={node.id} node={node} index={i} />
        ))}
      </div>

      {!nodes.length && (
        <div className="of-canvas-empty">
          <p>Issue a voice or text command to build your first agent architecture.</p>
        </div>
      )}
    </div>
  );
}
