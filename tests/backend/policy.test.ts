import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
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
    });
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
