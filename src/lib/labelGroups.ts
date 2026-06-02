// Group labels by their `scope::` for the nested label menus, and toggle a
// selection with scoped-label exclusivity. Pure + framework-free.
import { parseLabel } from "./labels";

export interface LabelLike {
  id: string;
  title: string;
  color: string;
}

export interface ScopeOption extends LabelLike {
  /** Text after the final `::`, or the whole title for an unscoped label. */
  value: string;
}

export interface ScopeGroup {
  /** Scope lowercased, or "__none" for the unscoped group. */
  key: string;
  /** Display name: the scope text (original case), or "Other". */
  label: string;
  scope: string | null;
  options: ScopeOption[];
}

// Well-known scopes sort to the front, in this order; everything else alpha,
// and the unscoped "Other" group always last.
const PREFERRED = ["priority", "type", "workflow", "status", "assigned", "team"];

export function groupLabelsByScope(labels: readonly LabelLike[]): ScopeGroup[] {
  const map = new Map<string, ScopeGroup>();
  for (const l of labels) {
    const p = parseLabel(l.title, l.color);
    const scope = p.scope?.toLowerCase() ?? null;
    const key = scope ?? "__none";
    if (!map.has(key))
      map.set(key, {
        key,
        label: p.scope ?? "Other",
        scope,
        options: [],
      });
    map.get(key)!.options.push({
      id: l.id,
      title: l.title,
      color: l.color,
      value: p.value,
    });
  }
  const rank = (g: ScopeGroup) => {
    if (g.scope === null) return Number.MAX_SAFE_INTEGER;
    const i = PREFERRED.indexOf(g.scope);
    return i === -1 ? 1000 : i;
  };
  return [...map.values()].sort(
    (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label),
  );
}

const scopeOf = (title: string) =>
  parseLabel(title, "").scope?.toLowerCase() ?? null;

/**
 * Toggle `title` in `selected` with scoped-label exclusivity: selecting a scoped
 * value removes any other selected title in the same scope; unscoped labels and
 * de-selection are plain toggles.
 */
export function toggleScoped(selected: string[], title: string): string[] {
  if (selected.includes(title)) return selected.filter((t) => t !== title);
  const scope = scopeOf(title);
  if (scope === null) return [...selected, title];
  return [...selected.filter((t) => scopeOf(t) !== scope), title];
}
