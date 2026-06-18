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
      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                {headers.map((h) => (
                  <td key={h} style={{ padding: "7px 10px", color: "var(--text)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {String(row[h] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // For charts, detect x-axis (first string key) and y-axis (first numeric key)
  const keys = Object.keys(data[0]);
  const xKey = keys.find((k) => typeof data[0][k] === "string") ?? keys[0];
  const yKey = keys.find((k) => typeof data[0][k] === "number") ?? keys[1];

  if (render_as === "bar_chart") {
    return (
      <div style={{ marginTop: 14, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#0f0f18", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey={yKey} fill="#fb923c" radius={[4, 4, 0, 0]} />
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
            <XAxis dataKey={xKey} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#0f0f18", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey={yKey} stroke="#22d3ee" strokeWidth={2} dot={{ fill: "#22d3ee", r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
