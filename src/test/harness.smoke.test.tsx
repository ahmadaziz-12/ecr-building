import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { apiGet, API_BASE } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

// Proves the Module 0 frontend harness works end-to-end: Vitest + jsdom, React Testing Library
// rendering, and msw intercepting a real apiFetch call. Later modules' component/hook tests follow
// this same shape — see docs/BRD-GAP-IMPLEMENTATION-PLAN.md Module 0 for the pattern this establishes.
describe("test harness smoke test", () => {
  it("renders a component with React Testing Library", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("intercepts an apiFetch call via msw", async () => {
    server.use(
      http.get(`${API_BASE}/api/catalog/categories`, () =>
        HttpResponse.json([{ id: 1, nameEn: "Cement & Binders" }]),
      ),
    );

    const result = await apiGet<Array<{ id: number; nameEn: string }>>("/api/catalog/categories");

    expect(result).toEqual([{ id: 1, nameEn: "Cement & Binders" }]);
  });
});
