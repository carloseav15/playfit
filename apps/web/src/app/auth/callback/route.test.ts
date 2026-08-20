import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("Supabase auth callback", () => {
  afterEach(() => vi.clearAllMocks());

  it("exchanges the code and keeps a safe relative destination", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    });
    const { GET } = await loadRoute();

    const response = await GET(
      new Request("https://playfit.example/auth/callback?code=abc&next=/profile"),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://playfit.example/profile");
    expect(response.headers.get("set-cookie")).toContain("pf_returning=1");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
  ])("rejects an unsafe next path: %s", async (next) => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
    });
    const { GET } = await loadRoute();

    const response = await GET(
      new Request(
        `https://playfit.example/auth/callback?code=abc&next=${encodeURIComponent(next)}`,
      ),
    );

    expect(response.headers.get("location")).toBe("https://playfit.example/");
  });

  it("redirects with an error when the provider exchange fails", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: new Error("invalid code") }),
      },
    });
    const { GET } = await loadRoute();

    const response = await GET(new Request("https://playfit.example/auth/callback?code=expired"));

    expect(response.headers.get("location")).toBe("https://playfit.example/?error=auth_failed");
  });

  it("sends a brand-new user with no profile yet straight into onboarding", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "new-user-id" } } },
          error: null,
        }),
      },
      rpc,
    });
    const { GET } = await loadRoute();

    const response = await GET(new Request("https://playfit.example/auth/callback?code=abc"));

    expect(rpc).toHaveBeenCalledWith("get_profile", { p_user_id: "new-user-id" });
    expect(response.headers.get("location")).toBe("https://playfit.example/?onboarding=1");
    expect(response.headers.get("set-cookie")).toContain("pf_returning=1");
  });

  it("sends a returning user with an existing profile to the default destination", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { state_version: 3 } });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "existing-user-id" } } },
          error: null,
        }),
      },
      rpc,
    });
    const { GET } = await loadRoute();

    const response = await GET(new Request("https://playfit.example/auth/callback?code=abc"));

    expect(response.headers.get("location")).toBe("https://playfit.example/");
  });

  it("does not check for a profile when an explicit next path was requested", async () => {
    const rpc = vi.fn();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "new-user-id" } } },
          error: null,
        }),
      },
      rpc,
    });
    const { GET } = await loadRoute();

    const response = await GET(
      new Request("https://playfit.example/auth/callback?code=abc&next=/auth/reset-password"),
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://playfit.example/auth/reset-password");
  });
});
