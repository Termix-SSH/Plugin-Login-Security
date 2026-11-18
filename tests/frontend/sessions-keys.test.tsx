import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const ui = vi.hoisted(() => ({
  admin: false,
  confirm: vi.fn(async () => true),
  revokeSession: vi.fn(async () => ({})),
  revokeMyApiKey: vi.fn(async () => ({})),
  revokeAllMyApiKeys: vi.fn(async () => ({ count: 1 })),
  revokeEveryoneSessions: vi.fn(async () => ({ sessions: 2, apiKeys: 0 })),
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
  LoadingState: () => <div>loading</div>,
  ListRow: (props: Props) => (
    <div>
      <span>{props.title as never}</span>
      <span>{props.meta as never}</span>
      {props.trailing as never}
    </div>
  ),
  NoticePanel: (props: Props) => <div>{props.title as never}</div>,
  PanelFrame: pass,
  PanelList: pass,
  PanelShell: (props: Props) => (
    <div>
      {props.actions as never}
      {props.tabs as never}
      {props.children as never}
    </div>
  ),
  RefreshButton: () => null,
  StatusBadge: pass,
  TabStrip: (props: {
    tabs: { id: string; label: string }[];
    onTabChange: (id: string) => void;
  }) => (
    <div>
      {props.tabs.map((tab) => (
        <button key={tab.id} onClick={() => props.onTabChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  ),
  useConfirm: () => ui.confirm,
  getUserInfo: async () => ({ userId: "me", is_admin: ui.admin }),
  getSessions: async () => ({
    sessions: [
      {
        id: "s1",
        userId: "me",
        deviceType: "web",
        deviceInfo: "Firefox",
        createdAt: "",
        expiresAt: "",
        lastActiveAt: "",
        isCurrentSession: true,
      },
      {
        id: "s2",
        userId: "me",
        deviceType: "mobile",
        deviceInfo: "Phone",
        createdAt: "",
        expiresAt: "",
        lastActiveAt: "",
      },
      {
        id: "s3",
        userId: "bob",
        deviceType: "web",
        deviceInfo: "Bob laptop",
        createdAt: "",
        expiresAt: "",
        lastActiveAt: "",
      },
    ],
  }),
  getMyApiKeys: async () => ({
    apiKeys: [
      {
        id: "k1",
        name: "ci key",
        userId: "me",
        username: "me",
        tokenPrefix: "tmx_ab",
        createdAt: "",
        expiresAt: null,
        lastUsedAt: null,
        isActive: true,
        scopes: ["read"],
      },
    ],
  }),
  revokeSession: ui.revokeSession,
  revokeMyApiKey: ui.revokeMyApiKey,
  revokeAllMyApiKeys: ui.revokeAllMyApiKeys,
  revokeEveryoneSessions: ui.revokeEveryoneSessions,
}));

import { SessionsKeysTab } from "../../src/frontend/SessionsKeysTab";

beforeEach(() => {
  ui.admin = false;
  for (const fn of [
    ui.revokeSession,
    ui.revokeMyApiKey,
    ui.revokeAllMyApiKeys,
    ui.revokeEveryoneSessions,
  ]) {
    fn.mockClear();
  }
});

describe("SessionsKeysTab", () => {
  it("shows only your own sessions and signs out the others", async () => {
    render(<SessionsKeysTab />);
    await screen.findByText("Firefox");
    expect(screen.getByText("Phone")).toBeTruthy();
    expect(screen.queryByText("Bob laptop")).toBeNull();
    expect(screen.queryByText("sessions.everyone")).toBeNull();

    fireEvent.click(screen.getByText("sessions.endOthers"));
    await waitFor(() => expect(ui.revokeSession).toHaveBeenCalledTimes(1));
    expect(ui.revokeSession).toHaveBeenCalledWith("s2");
  });

  it("lets an admin sign everyone out", async () => {
    ui.admin = true;
    render(<SessionsKeysTab />);
    fireEvent.click(await screen.findByText("sessions.everyone"));
    await waitFor(() =>
      expect(ui.revokeEveryoneSessions).toHaveBeenCalledWith({ apiKeys: true }),
    );
  });

  it("lists your keys and revokes them", async () => {
    render(<SessionsKeysTab />);
    fireEvent.click(await screen.findByText("keys.tab"));
    expect(await screen.findByText("ci key")).toBeTruthy();
    fireEvent.click(screen.getByText("keys.revoke"));
    await waitFor(() => expect(ui.revokeMyApiKey).toHaveBeenCalledWith("k1"));
    fireEvent.click(screen.getByText("keys.revokeAll"));
    await waitFor(() => expect(ui.revokeAllMyApiKeys).toHaveBeenCalled());
  });
});
