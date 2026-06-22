import type { Metadata } from "next";
import "./widget.css";

export const metadata: Metadata = {
  title: "AgentOS Chat Widget",
  robots: "noindex,nofollow",
};

/**
 * Standalone layout for the embeddable chat widget.
 * No app shell, no root layout. widget.css provides all base styles
 * so no inline style attributes are needed (avoids SSR/client mismatches).
 */
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body>{children}</body>
    </html>
  );
}
