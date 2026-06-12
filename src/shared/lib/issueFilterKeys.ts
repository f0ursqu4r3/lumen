/**
 * URL query keys that define the issues-list view (filters, sort, grouping). This is
 * the unit a "saved view" snapshots and what the filter auto-save mirrors.
 *
 * Lives in shared/lib with zero imports so the Bun host bundle — which does not resolve
 * the "@/" alias and must not pull in Vue — can import it via a relative path. The
 * lumen:// deep-link parser whitelists list-view params against this list.
 */
export const FILTER_KEYS = [
  'state',
  'label',
  'assignee',
  'author',
  'q',
  'sort',
  'group',
  'view',
  'scope',
] as const
