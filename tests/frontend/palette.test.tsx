import { describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({ admin: false }));
vi.mock("@termix-ssh/plugin-sdk/ui", () => ({
  getUserInfo: async () => ({ is_admin: ui.admin }),
}));
vi.mock("../../src/frontend/SecurityOverlay", () => ({
  createSecurityOverlay: () => () => null,
}));
vi.mock("../../src/frontend/FactorsStatus", () => ({
  createFactorsStatus: () => () => null,
}));

import { activate } from "../../src/frontend/index";

type Entry = {
  id: string;
  when?: () => boolean;
  run: (shell: unknown) => void;
};

function boot() {
  const entries: Entry[] = [];
  activate({
    guest: false,
    registerSlotContribution: vi.fn(),
    registerSettingsComponent: vi.fn(),
    registerTab: vi.fn(),
    registerPaletteEntry: (entry: Entry) => entries.push(entry),
  } as never);
  return entries;
}

describe("palette", () => {
  it("opens sessions and keys for everyone", () => {
    const entries = boot();
    const shell = { openSingletonTab: vi.fn() };
    entries.find((e) => e.id === "sessions")!.run(shell);
    expect(shell.openSingletonTab).toHaveBeenCalledWith("sessions");
  });

  it("shows the admin wait only to admins", async () => {
    ui.admin = false;
    const forUser = boot().find((e) => e.id === "admin-waits")!;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(forUser.when?.()).toBe(false);

    ui.admin = true;
    const forAdmin = boot().find((e) => e.id === "admin-waits")!;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(forAdmin.when?.()).toBe(true);
  });
});
