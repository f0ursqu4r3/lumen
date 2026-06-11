// Node 22+ ships a built-in `localStorage` that is incomplete (no `.clear()`
// and warns about a missing `--localstorage-file` flag). When vitest runs
// under jsdom the jsdom window has the real Storage implementation, but
// `populateGlobal` does not copy `localStorage`/`sessionStorage` because they
// are not in its allow-list of keys. We patch the globals here so tests see
// jsdom's fully-functional Storage objects instead of Node's stub.
// jsdom has no IntersectionObserver; components that observe scroll position
// (e.g. IssueDetail's condensed-title signal) need a no-op stand-in under tests.
if (!('IntersectionObserver' in globalThis)) {
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): [] {
      return []
    }
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    value: IntersectionObserverStub,
    writable: true,
    configurable: true,
  })
}

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
} else if (typeof document !== 'undefined') {
  // We are in a jsdom-like environment but couldn't find the Storage objects —
  // fail loud so this doesn't silently corrupt browser-component tests.
  throw new Error(
    "test setup: could not locate jsdom's localStorage/sessionStorage to patch onto globalThis",
  )
}
// Non-browser environments (e.g. @vitest-environment node tests for Bun host
// code) have no window at all; Storage is irrelevant there, so we skip silently.
