const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
]

/** ISO timestamp → localized relative string, e.g. "5 minutes ago". */
export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  for (const [unit, secs] of UNITS) {
    if (diff >= secs || unit === 'second') return RELATIVE.format(-Math.floor(diff / secs), unit)
  }
  return ''
}
