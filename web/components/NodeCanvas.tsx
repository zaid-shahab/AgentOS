"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { GraphNode, GraphEdge } from "@/lib/schema";
import AgentNode from "./AgentNode";
import Icon from "./Icon";

const NODE_W = 218;
const NODE_H = 124;

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId?: string | null;
  onNodeSelect?: (id: string) => void;
  onBackgroundClick?: () => void;
}

function edgePath(a: GraphNode, b: GraphNode) {
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}

function midpoint(a: GraphNode, b: GraphNode) {
  return {
    x: (a.x + NODE_W + b.x) / 2,
    y: (a.y + b.y) / 2 + NODE_H / 2,
  };
}

export default function NodeCanvas({ nodes, edges, selectedId, onNodeSelect, onBackgroundClick }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [view, setView] = useState({ x: 70, y: 40, k: 1 });

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // auto-fit on graph change
  useEffect(() => {
    if (nodes.length === 0) return;
    const id = setTimeout(() => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const minX = Math.min(...nodes.map((n) => n.x));
      const maxX = Math.max(...nodes.map((n) => n.x + NODE_W));
      const minY = Math.min(...nodes.map((n) => n.y));
      const maxY = Math.max(...nodes.map((n) => n.y + NODE_H));
      const cw = maxX - minX;
      const ch = maxY - minY;
      const padX = 90;
      const padTop = 86;
      const padBot = 150;
      const availW = r.width - padX * 2;
      const availH = r.height - padTop - padBot;
      const k = Math.max(0.45, Math.min(1, availW / cw, availH / ch));
      const x = (r.width - cw * k) / 2 - minX * k;
      const y = padTop + (availH - ch * k) / 2 - minY * k;
      setView({ x, y, k });
    }, 320);
    return () => clearTimeout(id);
  }, [nodes.length]);

  const onDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest(".of-node")) return;
      dragRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
      e.currentTarget.classList.add("grabbing");
    },
    [view]
  );

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
  }, []);

  const onUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.classList.remove("grabbing");
  }, []);

  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!(e.target as HTMLElement).closest(".of-node")) onBackgroundClick?.();
    },
    [onBackgroundClick]
  );

  const hasGraph = nodes.length > 0;

  return (
    <div
      className="of-canvas"
      ref={wrapRef}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      onClick={onCanvasClick}
    >
      {!hasGraph && (
        <div className="of-empty">
          <div className="ring"><Icon name="sparkles" /></div>
          <h2>The canvas is empty</h2>
          <p>Describe the agent you want — AgentOS will draw the orchestration for you.</p>
        </div>
      )}

      <div
        className="of-world"
        style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.k})` }}
      >
        <svg className="of-edges" width="2400" height="1400">
          {edges.map((ed, i) => {
            const a = byId[ed.from];
            const b = byId[ed.to];
            if (!a || !b) return null;
            const d = edgePath(a, b);
            const m = midpoint(a, b);
            const tone =
              ed.tone === "bad"
                ? "var(--bad)"
                : (ed as { tone?: string }).tone === "good"
                ? "var(--good)"
                : "var(--accent)";
            return (
              <g key={i} className="of-fade" style={{ animationDelay: `${0.3 + i * 0.12}s` }}>
                <path className="of-edge" d={d} />
                <path className="of-edge-dash" d={d} style={{ stroke: tone }} />
                {ed.label && (
                  <g>
                    <rect
                      className="of-edge-lblbg"
                      x={m.x - ed.label.length * 3.4 - 8}
                      y={m.y - 11}
                      width={ed.label.length * 6.8 + 16}
                      height={22}
                      rx={11}
                    />
                    <text
                      className="of-edge-label"
                      x={m.x}
                      y={m.y + 4}
                      textAnchor="middle"
                      style={{ fill: tone }}
                    >
                      {ed.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        {nodes.map((n, i) => (
          <AgentNode
            key={n.id}
            node={n}
            index={i}
            selected={selectedId === n.id}
            onSelect={onNodeSelect}
          />
        ))}
      </div>
    </div>
  );
}
