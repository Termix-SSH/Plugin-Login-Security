import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const ui = vi.hoisted(() => ({
  factors: [] as { id: string }[],
  verify: vi.fn(async () => {}),
}));

function Factor(props: { verify: (body: Record<string, unknown>) => void }) {
  return <button onClick={() => props.verify({ code: "1" })}>send code</button>;
}

vi.mock("@termix-ssh/plugin-sdk/frontend", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@termix-ssh/plugin-sdk/ui", () => ({
  LoadingState: () => <div>loading</div>,
  NoticePanel: (props: { title: string; children: unknown }) => (
    <div>
      {props.title}
      {props.children as never}
    </div>
  ),
  PANEL: { body: "" },
  PanelFrame: (props: { children: unknown }) => <>{props.children as never}</>,
  PanelShell: (props: { children: unknown }) => <>{props.children as never}</>,
  Segmented: () => null,
  challengeStepUp: vi.fn(),
  listStepUpFactors: async () => ui.factors,
  useSecondFactors: () => [{ id: "totp", titleKey: "totp", component: Factor }],
  verifyStepUp: ui.verify,
}));

import { ConnectVerifyTab } from "../../src/frontend/ConnectVerifyTab";

beforeEach(() => {
  ui.factors = [];
  ui.verify.mockClear();
});

describe("ConnectVerifyTab", () => {
  it("points at Settings when no factor is set up", async () => {
    render(<ConnectVerifyTab />);
    expect(await screen.findByText(/verify.noFactor/)).toBeTruthy();
  });

  it("verifies through the user's factor, then says to connect again", async () => {
    ui.factors = [{ id: "totp" }];
    render(<ConnectVerifyTab />);
    fireEvent.click(await screen.findByText("send code"));
    expect(await screen.findByText(/verify.done/)).toBeTruthy();
    expect(ui.verify).toHaveBeenCalledWith("totp", { code: "1" });
  });
});
