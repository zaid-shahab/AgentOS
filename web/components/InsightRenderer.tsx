"use client";

import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

type RenderAs = "text" | "table" | "bar_chart" | "line_chart";

interface Props {
  data: Record<string, unknown>[];
  render_as: RenderAs;
}

export default function InsightRenderer({ data, render_as }: Props) {
  if (!data?.length) return null;

  if (render_as === "table") {
    const headers = Object.keys(data[0]);
    return (
      <div className="of-tablewrap" style={{ marginTop: 12 }}>
        <table className="of-itable">
          <thead>
            <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                {headers.map((h) => (
                  <td key={h}>{String(row[h] ?? "—")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const keys = Object.keys(data[0]);
  const xKey = keys.find((k) => typeof data[0][k] === "string") ?? keys[0];
  const yKey = keys.find((k) => typeof data[0][k] === "number") ?? keys[1];

  if (render_as === "bar_chart") {
    return (
      <div style={{ marginTop: 14, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: "#0e0e18",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 10,
                fontSize: 12,
                color: "#f4f5fb",
              }}
              cursor={{ fill: "rgba(255,122,24,0.08)" }}
            />
            <Bar dataKey={yKey} fill="var(--accent)" radius={[6, 6, 2, 2]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (render_as === "line_chart") {
    return (
      <div style={{ marginTop: 14, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: "#0e0e18",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 10,
                fontSize: 12,
                color: "#f4f5fb",
              }}
            />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke="var(--c-trigger)"
              strokeWidth={2.2}
              dot={{ fill: "var(--c-trigger)", r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
