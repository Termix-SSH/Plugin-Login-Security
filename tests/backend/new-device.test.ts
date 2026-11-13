import { describe, expect, it } from "vitest";
import express from "express";
import { createFakeContext } from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import manifestJson from "../../manifest.json";
import { activate } from "../../src/backend/index";
import { deviceKey, noteLogin } from "../../src/backend/new-device";

const manifest = manifestJson as unknown as PluginManifest;
const laptop = {
  username: "alice",
  ipAddress: "10.0.0.1",
  deviceType: "web",
  deviceInfo: "Firefox 120 on Linux",
};
const phone = { ...laptop, deviceType: "mobile", deviceInfo: "Termix iOS" };

function fake(settings: Record<string, unknown> = {}) {
  return createFakeContext({
    pluginId: manifest.id,
    settings,
    router: () => express.Router(),
  });
}

describe("new device notices", () => {
  it("keys a device by its type and software, not its address", () => {
    expect(deviceKey(laptop)).toBe(
      deviceKey({ ...laptop, ipAddress: "192.0.2.1" }),
    );
    expect(deviceKey(laptop)).not.toBe(deviceKey(phone));
  });

  it("only records the first device, then alerts on a new one", async () => {
    const { ctx, notifications } = fake();
    expect(await noteLogin(ctx, "u1", laptop, { enabled: true })).toBe("first");
    expect(await noteLogin(ctx, "u1", laptop, { enabled: true })).toBe("known");
    expect(notifications).toHaveLength(0);

    expect(await noteLogin(ctx, "u1", phone, { enabled: true })).toBe("new");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].notification).toMatchObject({
      audience: { userId: "u1" },
      category: "login-security.new_device",
    });
    expect(notifications[0].notification.body).toContain("Termix iOS");
    expect(notifications[0].notification.body).toContain("10.0.0.1");
  });

  it("keeps each user's devices apart", async () => {
    const { ctx, notifications } = fake();
    await noteLogin(ctx, "u1", laptop, { enabled: true });
    expect(await noteLogin(ctx, "u2", phone, { enabled: true })).toBe("first");
    expect(notifications).toHaveLength(0);
  });

  it("stays quiet when the admin or the user turned it off", async () => {
    const off = fake();
    await noteLogin(off.ctx, "u1", laptop, { enabled: false });
    await noteLogin(off.ctx, "u1", phone, { enabled: false });
    expect(off.notifications).toHaveLength(0);

    const optedOut = fake();
    await optedOut.ctx.settings.setUser("u1", "newDeviceNotice", false);
    await noteLogin(optedOut.ctx, "u1", laptop, { enabled: true });
    await noteLogin(optedOut.ctx, "u1", phone, { enabled: true });
    expect(optedOut.notifications).toHaveLength(0);
  });

  it("listens for sign ins once active", async () => {
    const { ctx, notifications } = fake();
    await activate(ctx);
    const login = (details: Record<string, unknown>) =>
      ctx.events.emit("internal.event", {
        event: "user_login",
        userId: "u1",
        details,
      });
    login(laptop);
    await new Promise((resolve) => setTimeout(resolve, 10));
    login(phone);
    await new Promise((resolve) => setTimeout(resolve, 10));
    ctx.events.emit("internal.event", { event: "host_deleted", userId: "u1" });
    expect(notifications).toHaveLength(1);
  });

  it("follows the admin switch", async () => {
    const { ctx, notifications } = fake({ newDeviceNotice: false });
    await activate(ctx);
    for (const details of [laptop, phone]) {
      ctx.events.emit("internal.event", {
        event: "user_login",
        userId: "u1",
        details,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(notifications).toHaveLength(0);
  });
});
