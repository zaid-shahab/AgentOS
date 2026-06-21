import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AgentOS Chat Widget",
  robots: "noindex,nofollow",
};

/**
 * Standalone layout for the embeddable chat widget.
 * Intentionally minimal — no app shell, no root layout imports.
 */
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
