import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  connectFactorApplies,
  decide,
  readSettings,
} from "../../src/backend/policy";

describe("readSettings", () => {
  it("falls back to everything off", () => {
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("turns odd values into off", () => {
    expect(
      readSettings({
        idleTimeoutMinutes: -3,
        maxSessionHours: "abc",
        secondFactor: "sometimes",
        rememberDevice: "no",
      }),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps whole numbers and known rules", () => {
    expect(
      readSettings({
        idleTimeoutMinutes: 15.7,
        maxSessionHours: "8",
        rememberDevice: false,
        secondFactor: "new-device",
        applyToExternal: true,
      }),
    ).toEqual({
      idleTimeoutMinutes: 15,
      maxSessionHours: 8,
      rememberDevice: false,
      secondFactor: "new-device",
      applyToExternal: true,
      connectFactor: "off",
      connectFactorMinutes: 60,
      newDeviceNotice: true,
    });
  });

  it("keeps the connect rule and falls back on odd values", () => {
    expect(
      readSettings({ connectFactor: "marked", connectFactorMinutes: 5 }),
    ).toMatchObject({ connectFactor: "marked", connectFactorMinutes: 5 });
    expect(
      readSettings({ connectFactor: "nope", connectFactorMinutes: -1 }),
    ).toMatchObject({ connectFactor: "off", connectFactorMinutes: 60 });
  });
});

describe("connectFactorApplies", () => {
  const on = { ...DEFAULT_SETTINGS, connectFactor: "all" as const };
  const now = 10_000_000;

  it("stays out of the way while off", () => {
    expect(
      connectFactorApplies(DEFAULT_SETTINGS, { interactive: true }, now),
    ).toBe(false);
  });

  it("never stops background work", () => {
    expect(connectFactorApplies(on, { interactive: false }, now)).toBe(false);
  });

  it("asks when the person has not verified, or it ran out", () => {
    expect(connectFactorApplies(on, { interactive: true }, now)).toBe(true);
    expect(
      connectFactorApplies(
        on,
        { interactive: true, stepUpAt: now - 60 * 60_000 },
        now,
      ),
    ).toBe(true);
  });

  it("lets a recent check through", () => {
    expect(
      connectFactorApplies(
        on,
        { interactive: true, stepUpAt: now - 59 * 60_000 },
        now,
      ),
    ).toBe(false);
  });
});

describe("decide", () => {
  it("asks for nothing by default", () => {
    expect(decide(DEFAULT_SETTINGS, { external: false })).toEqual({});
  });

  it("turns the settings into a login policy", () => {
    expect(
      decide(
        {
          ...DEFAULT_SETTINGS,
          idleTimeoutMinutes: 15,
          maxSessionHours: 8,
          rememberDevice: false,
          secondFactor: "always",
          applyToExternal: false,
        },
        { external: false },
      ),
    ).toEqual({
      allowRememberDevice: false,
      maxSessionSeconds: 8 * 3600,
      idleTimeoutSeconds: 15 * 60,
      secondFactor: "always",
    });
  });

  it("leaves SSO logins to the identity provider unless told otherwise", () => {
    const settings = { ...DEFAULT_SETTINGS, secondFactor: "always" as const };
    expect(decide(settings, { external: true })).toEqual({});
    expect(
      decide({ ...settings, applyToExternal: true }, { external: true }),
    ).toEqual({ secondFactor: "always" });
  });
});
