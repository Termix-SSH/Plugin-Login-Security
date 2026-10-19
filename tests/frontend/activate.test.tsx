import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import * as plugin from "../../src/frontend/index";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const ui = vi.hoisted(() => ({
  restriction: null as string | null,
  logoutUser: vi.fn(async () => ({})),
}));

vi.mock("@termix-ssh/plugin-sdk/ui", () => ({
  AuthEnrollmentSections: () => <div>enrollment sections</div>,
  Button: (props: { children: unknown; onClick?: () => void }) => (
    <button onClick={props.onClick}>{props.children as never}</button>
  ),
  getUserInfo: async () => ({ username: "alice", restriction: ui.restriction }),
  logoutUser: ui.logoutUser,
}));

const manifest = manifestJson as unknown as PluginManifest;
let rendered: RenderedPluginApp | null = null;
const reload = vi.fn();

beforeEach(() => {
  ui.restriction = null;
  ui.logoutUser.mockClear();
  reload.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
  localStorage.clear();
});

afterEach(async () => {
  vi.useRealTimers();
  await rendered?.deactivate();
  rendered = null;
});

function api(idleTimeoutMinutes: number) {
  return {
    get: vi.fn(async (path: string) =>
      path === "/policy"
        ? { data: { idleTimeoutMinutes } }
        : { data: { factors: [] } },
    ),
    post: vi.fn(async () => ({ data: null })),
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("login security frontend", () => {
  it("adds an overlay and the factors setting", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    expect(rendered.registered.slot("shell.overlay")).toEqual([
      "login-security.overlay",
    ]);
    expect(rendered.registered.settingsComponents()).toEqual(["factors"]);
  });

  it("signs out after the idle time and not before", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const calls = api(1);
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      api: calls as never,
    });
    rendered.renderSlot("shell.overlay");
    await flush();

    await act(async () => {
      vi.advanceTimersByTime(45_000);
    });
    window.dispatchEvent(new Event("keydown"));
    await act(async () => {
      vi.advanceTimersByTime(45_000);
    });
    expect(ui.logoutUser).not.toHaveBeenCalled();
    expect(calls.post).toHaveBeenCalledWith("/activity");

    await act(async () => {
      vi.advanceTimersByTime(75_000);
    });
    await flush();
    expect(ui.logoutUser).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it("does nothing when the idle timeout is off", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      api: api(0) as never,
    });
    rendered.renderSlot("shell.overlay");
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(24 * 60 * 60_000);
    });
    expect(ui.logoutUser).not.toHaveBeenCalled();
  });

  it("asks a restricted session to set up a second factor", async () => {
    ui.restriction = "second-factor-setup";
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      api: api(0) as never,
    });
    rendered.renderSlot("shell.overlay");
    expect(await screen.findByText(locales.setup.title)).toBeTruthy();
    expect(screen.getByText("enrollment sections")).toBeTruthy();
  });

  it("warns when a factor is required but none is installed", async () => {
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      api: api(0) as never,
    });
    rendered.renderSettingsComponent("factors", {
      values: { secondFactor: "always" },
    });
    expect(await screen.findByText(locales.status.noFactors)).toBeTruthy();
  });
});
