// Node 22+ ships a built-in `localStorage` that is incomplete (no `.clear()`
// and warns about a missing `--localstorage-file` flag). When vitest runs
// under jsdom the jsdom window has the real Storage implementation, but
// `populateGlobal` does not copy `localStorage`/`sessionStorage` because they
// are not in its allow-list of keys. We patch the globals here so tests see
// jsdom's fully-functional Storage objects instead of Node's stub.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = (globalThis as any).jsdom?.window ?? (global as any).window
if (w?.localStorage && w?.sessionStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: w.localStorage,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: w.sessionStorage,
    writable: true,
    configurable: true,
  })
} else {
  // Fail loud: this file exists solely to provide a working Storage. A silent
  // no-op here would surface later as a cryptic "localStorage.clear is not a
  // function" in whatever test ran first, hiding the real cause.
  throw new Error(
    "test setup: could not locate jsdom's localStorage/sessionStorage to patch onto globalThis",
  )
}
