import { expect, afterEach, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";

// Cleanup after each test
afterEach(() => {
  cleanup();
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

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as any;

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
