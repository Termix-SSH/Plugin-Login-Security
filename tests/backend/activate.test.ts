import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import express, { type Router } from "express";
import {
  createFakeContext,
  createMockCtx,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import manifestJson from "../../manifest.json";
import { activate } from "../../src/backend/index";

const manifest = manifestJson as unknown as PluginManifest;
const input = {
  userId: "u1",
  methodId: "password",
  external: false,
  deviceType: "web" as const,
  trustedDevice: false,
  mfaSatisfied: false,
  secondFactors: [],
};

let server: http.Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  );
  server = null;
});

async function serve(router: Router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  server = app.listen(0);
  await new Promise((resolve) => server!.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return (path: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${port}${path}`, init);
}

describe("login security", () => {
  it("gives core its policy and follows settings changes", async () => {
    const fake = createFakeContext({
      pluginId: manifest.id,
      settings: { idleTimeoutMinutes: 10, rememberDevice: false },
      router: () => express.Router(),
    });
    await activate(fake.ctx);
    expect(fake.auth.policies).toHaveLength(1);
    const [policy] = fake.auth.policies;
    expect(await policy.evaluate(input)).toEqual({
      allowRememberDevice: false,
      idleTimeoutSeconds: 600,
    });
    expect(policy.allowRememberDevice?.()).toBe(false);

    await fake.ctx.settings.set("secondFactor", "new-device");
    await fake.ctx.settings.set("rememberDevice", true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await policy.evaluate(input)).toEqual({
      idleTimeoutSeconds: 600,
      secondFactor: "new-device",
    });
    expect(policy.allowRememberDevice?.()).toBe(true);
  });

  it("needs auth:policy", async () => {
    const mock = createMockCtx({
      pluginId: manifest.id,
      manifest,
      capabilities: ["network:serve", "ui:surface"],
      router: () => express.Router(),
    });
    await expect(activate(mock.ctx)).rejects.toThrow(/auth:policy/);
  });

  it("serves the idle timeout, takes heartbeats and lists factors for admins", async () => {
    let router: Router | null = null;
    const fake = createFakeContext({
      pluginId: manifest.id,
      settings: { idleTimeoutMinutes: 30, secondFactor: "always" },
      router: () => (router = express.Router()),
      secondFactors: [{ id: "totp", pluginId: "totp" }],
    });
    await activate(fake.ctx);
    const call = await serve(router!);

    expect(await (await call("/policy")).json()).toEqual({
      idleTimeoutMinutes: 30,
    });
    expect((await call("/activity", { method: "POST" })).status).toBe(204);
    expect(await (await call("/status")).json()).toEqual({
      factors: [{ id: "totp", pluginId: "totp" }],
      secondFactor: "always",
    });
  });

  it("keeps the factor list from people who are not admins", async () => {
    let router: Router | null = null;
    const fake = createFakeContext({
      pluginId: manifest.id,
      router: () => (router = express.Router()),
      permissions: [],
    });
    await activate(fake.ctx);
    const call = await serve(router!);
    expect((await call("/status")).status).toBe(403);
    expect((await call("/policy")).status).toBe(200);
  });
});
