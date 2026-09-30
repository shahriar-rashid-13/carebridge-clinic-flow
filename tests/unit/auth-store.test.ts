import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => import("../helpers/supabase"));

vi.mock("@/lib/supabase/client", () => ({ supabase: fake.client }));

const session = (id: string, email: string) => ({ user: { id, email }, access_token: "token" });

// The auth store keeps module-level state, so each test loads a fresh copy.
const loadStore = async () => {
  vi.resetModules();
  return import("@/lib/auth/store");
};

beforeEach(() => {
  fake.reset();
});

describe("auth store", () => {
  it("starts signed out and loading", async () => {
    const { useAuth } = await loadStore();
    expect(useAuth.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: true,
    });
  });

  it("logs in and loads the clinic role from profiles", async () => {
    fake.client.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: session("u1", "sarah@example.com") },
      error: null,
    } as never);
    fake.onQuery((query) =>
      query.table === "profiles"
        ? { data: { id: "u1", full_name: "Sarah Jenkins", role: "patient" } }
        : undefined,
    );
    const { useAuth } = await loadStore();

    await useAuth.getState().login("  sarah@example.com ", "123456");

    expect(fake.client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "sarah@example.com",
      password: "123456",
    });
    expect(useAuth.getState()).toMatchObject({
      isAuthenticated: true,
      isLoading: false,
      user: { id: "u1", name: "Sarah Jenkins", email: "sarah@example.com", role: "patient" },
    });
    expect(fake.queries[0]).toMatchObject({
      table: "profiles",
      filters: [{ method: "eq", args: ["id", "u1"] }],
      single: true,
    });
  });

  it("rethrows sign-in errors and stops loading", async () => {
    fake.client.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: new Error("Invalid login credentials"),
    } as never);
    const { useAuth } = await loadStore();

    await expect(useAuth.getState().login("sarah@example.com", "wrong")).rejects.toThrow(
      "Invalid login credentials",
    );
    expect(useAuth.getState()).toMatchObject({ isAuthenticated: false, isLoading: false });
  });

  it("rejects a profile without a valid clinic role", async () => {
    fake.client.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: session("u2", "x@example.com") },
      error: null,
    } as never);
    fake.onQuery(() => ({ data: { id: "u2", full_name: "X", role: "admin" } }));
    const { useAuth } = await loadStore();

    await expect(useAuth.getState().login("x@example.com", "pw")).rejects.toThrow(
      "Your account profile is missing a valid clinic role.",
    );
    expect(useAuth.getState()).toMatchObject({
      isAuthenticated: false,
      profileError: "Your account profile is missing a valid clinic role.",
    });
  });

  it("signs up with the trimmed full name in metadata", async () => {
    const { useAuth } = await loadStore();

    const result = await useAuth.getState().signup(" new@example.com ", " New Person ", "secret1");

    expect(result).toBeNull();
    expect(fake.client.auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "secret1",
      options: { data: { full_name: "New Person" } },
    });
    expect(useAuth.getState().isLoading).toBe(false);
  });

  it("logs out and clears the user", async () => {
    fake.client.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: session("u3", "clara@example.com") },
      error: null,
    } as never);
    fake.onQuery(() => ({ data: { id: "u3", full_name: "Clara Morgan", role: "receptionist" } }));
    const { useAuth } = await loadStore();
    await useAuth.getState().login("clara@example.com", "123456");

    await useAuth.getState().logout();

    expect(fake.client.auth.signOut).toHaveBeenCalled();
    expect(useAuth.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isSigningOut: true,
    });
    useAuth.getState().completeSignOut();
    expect(useAuth.getState().isSigningOut).toBe(false);
  });

  it("initializeAuth restores an existing session once", async () => {
    fake.client.auth.getSession.mockResolvedValueOnce({
      data: { session: session("u4", "marcus@example.com") },
      error: null,
    } as never);
    fake.onQuery(() => ({ data: { id: "u4", full_name: "Dr. Marcus Vance", role: "doctor" } }));
    const { initializeAuth, useAuth } = await loadStore();

    await Promise.all([initializeAuth(), initializeAuth()]);

    expect(fake.client.auth.getSession).toHaveBeenCalledTimes(1);
    expect(fake.client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().user?.role).toBe("doctor");
  });
});
