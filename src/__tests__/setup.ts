import { expect, afterEach, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";

// Cleanup after each test
afterEach(() => {
  cleanup();
  // localStorageStore is declared further down this file but this
  // closure only runs after the whole module has loaded -- clears the
  // now-real in-memory store (see the comment below) so no test's
  // localStorage writes leak into a later test, in this file or any
  // other sharing the same worker process.
  localStorageStore.clear();
});

// Mock IndexedDB
class MockIndexedDB {
  databases: Record<string, any> = {};

  open(name: string, version?: number) {
    if (!this.databases[name]) {
      this.databases[name] = { version, stores: {} };
    }
    return {
      onsuccess: () => {},
      onerror: () => {},
      onupgradeneeded: () => {},
    };
  }

  deleteDatabase(name: string) {
    delete this.databases[name];
  }
}

global.indexedDB = new MockIndexedDB() as any;

// Mock localStorage -- a REAL in-memory store, not bare no-op vi.fn()
// stubs. The bare-stub version previously here made getItem() always
// return undefined regardless of any prior setItem() call, silently
// breaking persistence for every test in the suite that round-trips a
// value through localStorage (deviceId caching, OAuth PKCE verifier
// storage, etc.) -- found while adding googleDriveSyncProvider.test.ts's
// registerDevice() rename test, which genuinely needs getDeviceId() to
// return the same id across two calls in one test. Calls are still
// spied via vi.fn() wrappers so existing `.mock`-based assertions (if
// any) keep working.
const localStorageStore = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => (localStorageStore.has(key) ? localStorageStore.get(key)! : null)),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore.set(key, String(value));
  }),
  removeItem: vi.fn((key: string) => {
    localStorageStore.delete(key);
  }),
  clear: vi.fn(() => {
    localStorageStore.clear();
  }),
};
global.localStorage = localStorageMock as any;

// Mock ResizeObserver -- jsdom has no real implementation. Needed by
// Chart.js (DashboardPage.tsx / AnalyticsPage.tsx's Pie/Bar charts), which
// binds a ResizeObserver on mount to auto-resize the canvas; without this,
// mounting either page throws an uncaught "Cannot read properties of null
// (reading 'ownerDocument')" during Chart.js's own resize/cleanup path.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as any;

// Mock matchMedia for responsive hooks/layouts.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Suppress console errors in tests (optional - can be removed for debugging)
const originalError = console.error;
beforeEach(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === "string" &&
      (args[0].includes("Warning: ReactDOM.render") ||
        args[0].includes("Not implemented: HTMLFormElement.prototype.submit"))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterEach(() => {
  console.error = originalError;
});
