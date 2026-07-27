import { setupServer } from "msw/node";

// Individual tests add their own handlers via `server.use(...)`; this starts empty so an
// un-mocked request fails loudly (via the "warn" onUnhandledRequest setting in setup.ts) rather
// than silently hitting a real network.
export const server = setupServer();
