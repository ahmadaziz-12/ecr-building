import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./msw/server";

// Node 25 ships an experimental global localStorage that (without --localstorage-file) lacks the full
// Storage API and shadows jsdom's. Replace it with a plain in-memory implementation so browser code
// under test (e.g. the Module 10 offline queue) behaves like it does in a real browser.
function inMemoryStorage(): Storage {
  let store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => { store = new Map(); },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
  };
}
Object.defineProperty(globalThis, "localStorage", { value: inMemoryStorage(), configurable: true });

// Starts the mock API server once for the whole run; each test's handlers are added/reset per test
// so one test's mocked response can never leak into the next.
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
