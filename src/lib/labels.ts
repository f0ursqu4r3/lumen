// GitLab labels carry meaning in their text. A label like `priority::High` is a
// "scoped" label: everything before the final `::` is the scope (key), the rest
// is the value. We render these as two-tone pills and lift a few well-known
// scopes (priority, type, workflow status) into dedicated row signals.

export interface ParsedLabel {
  /** Text before the final `::`, or null for a plain label. */
  scope: string | null;
  /** Text after the final `::`, or the whole title for a plain label. */
  value: string;
  /** Original, unparsed label title. */
  raw: string;
  /** GitLab-supplied hex color. */
  color: string;
}

export function parseLabel(title: string, color: string): ParsedLabel {
  const idx = title.lastIndexOf("::");
  if (idx === -1) return { scope: null, value: title, raw: title, color };
  return {
    scope: title.slice(0, idx),
    value: title.slice(idx + 2),
    raw: title,
    color,
  };
}

// --- color math -------------------------------------------------------------

/** Expand `#abc` / `abc` / `#aabbcc` to `[r, g, b]` (0-255). Falls back to grey. */
function toRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return [128, 128, 128];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
function luminance(hex: string): number {
  const lin = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Near-black or near-white text, whichever reads better on `bg`. */
export function readableText(bg: string): string {
  return luminance(bg) > 0.45 ? "#1f2328" : "#ffffff";
}

/** Mix `hex` toward `target` by `amount` (0..1). */
export function mix(hex: string, target: string, amount: number): string {
  const a = toRgb(hex);
  const b = toRgb(target);
  return toHex([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}

/** Mix `hex` toward black by `amount` (0..1). Used for the scope segment. */
export function darken(hex: string, amount = 0.32): string {
  const rgb = toRgb(hex).map((v) => v * (1 - amount)) as [
    number,
    number,
    number,
  ];
  return toHex(rgb);
}

/** Translucent fill of a label color — for soft backgrounds. */
export function tint(hex: string, alpha = 0.14): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- semantic scopes --------------------------------------------------------

export type Priority = "high" | "medium" | "low";

export interface PriorityMeta {
  level: Priority;
  /** Semantic color, independent of the label's hex, for consistent scanning. */
  color: string;
  /** lucide icon name. */
  icon: "arrow-up" | "equal" | "minus";
  label: string;
  /** Sort weight, higher = more urgent. */
  weight: number;
}

const PRIORITY: Record<Priority, PriorityMeta> = {
  high: {
    level: "high",
    color: "#ef4444",
    icon: "arrow-up",
    label: "High priority",
    weight: 3,
  },
  medium: {
    level: "medium",
    color: "#f59e0b",
    icon: "equal",
    label: "Medium priority",
    weight: 2,
  },
  low: {
    level: "low",
    color: "#94a3b8",
    icon: "minus",
    label: "Low priority",
    weight: 1,
  },
};

export interface TypeMeta {
  code: string;
  icon: "bug" | "sparkles" | "recycle" | "plug" | "flask-conical" | "tag";
  color: string;
  label: string;
}

// Maps the short `type::` codes this project uses to an icon + tint.
const TYPE: Record<string, TypeMeta> = {
  BUG: { code: "BUG", icon: "bug", color: "#ef4444", label: "Bug" },
  ENH: {
    code: "ENH",
    icon: "sparkles",
    color: "#8b5cf6",
    label: "Enhancement",
  },
  REF: { code: "REF", icon: "recycle", color: "#d97706", label: "Refactor" },
  INT: { code: "INT", icon: "plug", color: "#7c3aed", label: "Integration" },
  TEST: {
    code: "TEST",
    icon: "flask-conical",
    color: "#14b8a6",
    label: "Test",
  },
};

interface LabelLike {
  title: string;
  color: string;
}

const scopeIs = (l: ParsedLabel, name: string) =>
  l.scope?.toLowerCase() === name;

/** First `priority::` label, mapped to consistent semantics (or null). */
export function priorityOf(labels: readonly LabelLike[]): PriorityMeta | null {
  for (const l of labels) {
    const p = parseLabel(l.title, l.color);
    if (scopeIs(p, "priority")) {
      const k = p.value.toLowerCase() as Priority;
      if (k in PRIORITY) return PRIORITY[k];
    }
  }
  return null;
}

/** First `type::` label, mapped to an icon + tint (generic Tag for unknown). */
export function typeOf(labels: readonly LabelLike[]): TypeMeta | null {
  for (const l of labels) {
    const p = parseLabel(l.title, l.color);
    if (scopeIs(p, "type")) {
      const code = p.value.toUpperCase();
      return (
        TYPE[code] ?? { code, icon: "tag", color: p.color, label: p.value }
      );
    }
  }
  return null;
}

/** First workflow-status label (`assigned::` / `workflow::`/ `status::`). */
export function statusOf(labels: readonly LabelLike[]): ParsedLabel | null {
  for (const l of labels) {
    const p = parseLabel(l.title, l.color);
    if (
      scopeIs(p, "assigned") ||
      scopeIs(p, "workflow") ||
      scopeIs(p, "status")
    )
      return p;
  }
  return null;
}

/**
 * Labels left after priority/type/status are lifted into signals — these still
 * render as pills (team, milestone-ish scopes, plain labels, etc.).
 */
export function remainingLabels<T extends LabelLike>(
  labels: readonly T[],
): T[] {
  return labels.filter((l) => {
    const p = parseLabel(l.title, l.color);
    return !(
      scopeIs(p, "priority") ||
      scopeIs(p, "type") ||
      scopeIs(p, "assigned") ||
      scopeIs(p, "workflow") ||
      scopeIs(p, "status")
    );
  });
}
