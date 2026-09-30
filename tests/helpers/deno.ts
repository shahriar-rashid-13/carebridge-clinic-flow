import { vi } from "vitest";

/** Values returned by `Deno.env.get` inside Edge Function code under test. */
export const denoEnv: Record<string, string | undefined> = {};

export const denoServe = vi.fn();

(globalThis as unknown as { Deno: unknown }).Deno = {
  env: { get: (name: string) => denoEnv[name] },
  serve: denoServe,
};
