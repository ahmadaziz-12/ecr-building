# Running tests

## Backend (.NET)

```
cd backend
dotnet test
```

Integration tests boot the real Api pipeline (`EcrBuilding.Tests/Infrastructure/CustomWebApplicationFactory`)
against a private in-memory SQLite database instead of the production MySQL connection — this is
required (not just convenient) because several controllers use raw SQL for atomic updates
(e.g. the stock-deduction UPDATE in `OrdersController`) that EF Core's InMemory provider can't execute.

Pattern for a new integration test:

```csharp
public class MyFeatureTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();
    public Task DisposeAsync() { _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Some_behavior()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: ModuleArea.Pos);
        var user = TestDataSeeder.AddUser(db, role, "cashier@test.local", branchId: branch.Id);

        var client = _factory.CreateAuthenticatedClient(user); // real JWT, real auth pipeline

        var response = await client.GetAsync("/api/whatever");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
```

Add whatever new `TestDataSeeder` helper methods a module needs (products, customers, orders, etc.) —
keep them minimal and additive, not a re-run of the full `DbSeeder.cs` production dataset.

Note: `dotnet build`/`dotnet test` will fail with file-lock errors if the backend dev server
(`EcrBuilding.Api.exe`) is running at the same time, since both write to the same `bin/` output.
Stop the dev server before running tests, then restart it with `dotnet run` afterward.

## Frontend (React)

```
npm test          # single run
npm run test:watch
npm run test:ui   # Vitest's browser UI
```

Vitest has its own config (`vitest.config.ts`, separate from `vite.config.ts`, which is owned by
`@lovable.dev/vite-tanstack-config` for the SSR/Nitro build) — plain jsdom + React, `@` path alias
matching `tsconfig.json`.

Pattern for a new component test, mocking the backend via msw:

```tsx
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { API_BASE } from "@/lib/api/client";

it("does the thing", async () => {
  server.use(
    http.get(`${API_BASE}/api/whatever`, () => HttpResponse.json({ ok: true })),
  );

  render(<MyComponent />);

  expect(await screen.findByText("...")).toBeInTheDocument();
});
```

## End-to-end (Playwright)

Not yet installed — add it (`npm install -D @playwright/test`) only when a module's plan brief
specifically calls for an e2e test (Module 6's damaged/surplus return flows, Module 10's offline
sync). Most modules don't need it; backend integration tests + frontend component tests cover them.
