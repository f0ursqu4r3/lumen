// Boundary-anchored import-path remapper for the feature-sliced reorg.
// Usage: bun scripts/reorg-remap.mjs "@/old/path=@/new/path" ["@/a=@/b" ...]
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const pairs = process.argv.slice(2).map((arg) => {
  const eq = arg.indexOf('=')
  if (eq < 0) throw new Error(`bad pair (need from=to): ${arg}`)
  return { from: arg.slice(0, eq), to: arg.slice(eq + 1) }
})
// Apply longest 'from' first so specific paths win over shorter prefixes.
pairs.sort((a, b) => b.from.length - a.from.length)

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      if (entry !== 'generated' && entry !== 'node_modules') walk(p)
    } else if (/\.(ts|vue)$/.test(entry)) {
      files.push(p)
    }
  }
})('src')

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
let changed = 0
for (const file of files) {
  const before = readFileSync(file, 'utf8')
  let after = before
  for (const { from, to } of pairs) {
    // Only match when the next char ends the module path: quote, dot (extension), or slash (subpath).
    after = after.replace(new RegExp(esc(from) + `(?=['"./])`, 'g'), to)
  }
  if (after !== before) {
    writeFileSync(file, after)
    changed++
  }
}
console.log(`reorg-remap: rewrote ${changed} file(s) from ${pairs.length} pair(s)`)
