// Lucide-style stroked SVG icon set for AgentOS, ported from omniforge/icons.jsx.
import type { SVGProps } from "react";

type IconName =
  | "home" | "workflow" | "database" | "settings" | "mic" | "arrowUp"
  | "instagram" | "messenger" | "branch" | "message" | "messageCircle" | "userplus" | "shield"
  | "clock" | "mail" | "sparkles" | "search" | "activity" | "check"
  | "x" | "play" | "bot" | "chevron" | "zap" | "download" | "image"
  | "tag" | "bell" | "slash" | "book" | "upload" | "file" | "code" | "copy" | "externalLink" | "plus";

type SvgProps = SVGProps<SVGSVGElement>;
const baseProps = (extra: SvgProps = {}): SvgProps => ({
  viewBox: "0 0 24 24",
  width: "1em",
  height: "1em",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  ...extra,
});

const ICONS: Record<IconName, (p: SvgProps) => JSX.Element> = {
  home: (p) => (
    <svg {...baseProps(p)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
  ),
  workflow: (p) => (
    <svg {...baseProps(p)}>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="15" y="15" width="6" height="6" rx="1.5" />
      <path d="M9 6h4a3 3 0 0 1 3 3v6" />
    </svg>
  ),
  database: (p) => (
    <svg {...baseProps(p)}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  ),
  settings: (p) => (
    <svg {...baseProps(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1z" />
    </svg>
  ),
  mic: (p) => (
    <svg {...baseProps(p)}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
    </svg>
  ),
  arrowUp: (p) => (
    <svg {...baseProps(p)}><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
  ),
  instagram: (p) => (
    <svg {...baseProps(p)}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  messenger: (p) => (
    <svg {...baseProps(p)}>
      <path d="M12 2C6.5 2 2 6.2 2 11.4c0 2.8 1.3 5.3 3.4 7v3.6l3.2-1.8c1.1.3 2.2.5 3.4.5 5.5 0 10-4.2 10-9.3S17.5 2 12 2z" />
      <path d="M6.5 13.5l3-3 2.5 2 4.5-4-3 3-2.5-2z" />
    </svg>
  ),
  branch: (p) => (
    <svg {...baseProps(p)}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <path d="M8.4 6H13a3 3 0 0 1 3 3v.5" />
      <path d="M8.4 18H13a3 3 0 0 0 3-3v-.5" />
    </svg>
  ),
  message: (p) => (
    <svg {...baseProps(p)}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.6-.7L3 21l1.4-4.1A8.4 8.4 0 1 1 21 11.5z" /></svg>
  ),
  messageCircle: (p) => (
    <svg {...baseProps(p)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  userplus: (p) => (
    <svg {...baseProps(p)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" /><path d="M18 8v6" /><path d="M21 11h-6" />
    </svg>
  ),
  shield: (p) => (
    <svg {...baseProps(p)}>
      <path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
      <path d="M9.5 9.5l5 5" /><path d="M14.5 9.5l-5 5" />
    </svg>
  ),
  clock: (p) => (
    <svg {...baseProps(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  mail: (p) => (
    <svg {...baseProps(p)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </svg>
  ),
  sparkles: (p) => (
    <svg {...baseProps(p)}>
      <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
    </svg>
  ),
  search: (p) => (
    <svg {...baseProps(p)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
  ),
  activity: (p) => (
    <svg {...baseProps(p)}><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
  ),
  check: (p) => (
    <svg {...baseProps(p)}><path d="M4 12.5 9 17.5 20 6.5" /></svg>
  ),
  x: (p) => (
    <svg {...baseProps(p)}><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
  ),
  play: (p) => (
    <svg {...baseProps(p)}><path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" /></svg>
  ),
  bot: (p) => (
    <svg {...baseProps(p)}>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4" />
      <circle cx="12" cy="4" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  chevron: (p) => (
    <svg {...baseProps(p)}><path d="M9 6l6 6-6 6" /></svg>
  ),
  zap: (p) => (
    <svg {...baseProps(p)}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
  ),
  download: (p) => (
    <svg {...baseProps(p)}><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></svg>
  ),
  upload: (p) => (
    <svg {...baseProps(p)}><path d="M12 21V9" /><path d="M7 13l5-5 5 5" /><path d="M5 4h14" /></svg>
  ),
  file: (p) => (
    <svg {...baseProps(p)}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
  ),
  image: (p) => (
    <svg {...baseProps(p)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M21 16l-5-5L6 20" />
    </svg>
  ),
  tag: (p) => (
    <svg {...baseProps(p)}>
      <path d="M3 12V4h8l10 10-8 8L3 12z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  bell: (p) => (
    <svg {...baseProps(p)}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z" />
      <path d="M10 21h4" />
    </svg>
  ),
  slash: (p) => (
    <svg {...baseProps(p)}><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg>
  ),
  book: (p) => (
    <svg {...baseProps(p)}>
      <path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" />
      <path d="M4 17a3 3 0 0 1 3-3h12" />
    </svg>
  ),
  code: (p) => (
    <svg {...baseProps(p)}>
      <path d="M8 3 3 12l5 9" /><path d="M16 3l5 9-5 9" />
    </svg>
  ),
  copy: (p) => (
    <svg {...baseProps(p)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  externalLink: (p) => (
    <svg {...baseProps(p)}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" /><path d="M10 14 21 3" />
    </svg>
  ),
  plus: (p) => (
    <svg {...baseProps(p)}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
  ),
};

export default function Icon({ name, ...rest }: { name: string } & SvgProps) {
  const C = ICONS[name as IconName] ?? ICONS.zap;
  return C(rest);
}
