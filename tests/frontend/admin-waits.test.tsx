import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const ui = vi.hoisted(() => ({
  isAdmin: true,
  settings: {
    minutes: 0,
    forcedByEnv: false,
    adminCount: 2,
    active: false,
    envName: "TERMIX_ADMIN_HOLD_MINUTES",
  },
  holds: [] as Array<Record<string, unknown>>,
  setMinutes: vi.fn(async (minutes: number) => ({ held: false, minutes })),
  cancel: vi.fn(async () => ({ cancelled: true })),
}));

type Props = Record<string, unknown> & { children?: unknown };
const pass = vi.hoisted(
  () => (props: { children?: unknown }) => props.children as never,
);

vi.mock("@termix-ssh/plugin-sdk/frontend", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@termix-ssh/plugin-sdk/ui", () => ({
  Button: (props: Props & { onClick?: () => void; disabled?: boolean }) => (
    <button onClick={props.onClick} disabled={props.disabled}>
      {props.children as never}
    </button>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  ListRow: (props: Props) => (
    <div>
      {props.title as never}
      {props.trailing as never}
    </div>
  ),
  LoadingState: () => <div>loading</div>,
  NoticePanel: (props: Props) => <div>{props.title as never}</div>,
  PANEL: { body: "" },
  PanelFrame: pass,
  PanelList: pass,
  PanelShell: pass,
  RefreshButton: () => null,
  StatusBadge: pass,
  useConfirm: () => async () => true,
  usePermissions: () => ({ isAdmin: ui.isAdmin, loaded: true }),
  getAdminHoldSettings: async () => ui.settings,
  getAdminHolds: async () => ({ holds: ui.holds }),
  setAdminHoldMinutes: ui.setMinutes,
  cancelAdminHold: ui.cancel,
}));

import { AdminWaitsTab } from "../../src/frontend/AdminWaitsTab";

beforeEach(() => {
  ui.isAdmin = true;
  ui.settings = {
    ...ui.settings,
    minutes: 0,
    forcedByEnv: false,
    active: false,
  };
  ui.holds = [];
  ui.setMinutes.mockClear();
  ui.cancel.mockClear();
});

describe("AdminWaitsTab", () => {
  it("is for admins only", () => {
    ui.isAdmin = false;
    render(<AdminWaitsTab />);
    expect(screen.getByText("waits.adminOnly")).toBeTruthy();
  });

  it("turns the wait on with the default time", async () => {
    render(<AdminWaitsTab />);
    fireEvent.click(await screen.findByText("waits.turnOn"));
    await waitFor(() => expect(ui.setMinutes).toHaveBeenCalledWith(60));
  });

  it("turns it off and cancels a waiting change", async () => {
    ui.settings = { ...ui.settings, minutes: 30, active: true };
    ui.holds = [
      {
        id: "h1",
        kind: "make_admin",
        summary: "make bob an admin",
        requestedByName: "alice",
        runsAt: new Date().toISOString(),
        status: "pending",
      },
    ];
    render(<AdminWaitsTab />);
    expect(await screen.findByText("make bob an admin")).toBeTruthy();
    fireEvent.click(screen.getByText("waits.cancel"));
    await waitFor(() => expect(ui.cancel).toHaveBeenCalledWith("h1"));
    fireEvent.click(screen.getByText("waits.turnOff"));
    await waitFor(() => expect(ui.setMinutes).toHaveBeenCalledWith(0));
  });

  it("shows a server set wait as read only", async () => {
    ui.settings = {
      ...ui.settings,
      minutes: 15,
      forcedByEnv: true,
      active: true,
    };
    render(<AdminWaitsTab />);
    expect(await screen.findByText("waits.forced")).toBeTruthy();
    expect(screen.queryByText("waits.turnOff")).toBeNull();
  });
});
