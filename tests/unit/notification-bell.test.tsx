import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell, NotificationsProvider } from "@/components/clinic/notification-bell";

const { fake } = await vi.hoisted(async () => import("../helpers/supabase"));
const toast = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({ supabase: fake.client }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/auth/store", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

const notification = (id: string, readAt: string | null = null) => ({
  id,
  kind: "waitlist_offer",
  title: `Offer ${id}`,
  body: "A slot opened up",
  appointment_id: null,
  offer_id: "o1",
  read_at: readAt,
  created_at: new Date().toISOString(),
});

const renderBell = () =>
  render(
    <NotificationsProvider>
      <NotificationBell />
    </NotificationsProvider>,
  );

beforeEach(() => {
  fake.reset();
  toast.mockClear();
});

it("renders nothing outside NotificationsProvider", () => {
  const { container } = render(<NotificationBell />);
  expect(container).toBeEmptyDOMElement();
});

describe("NotificationBell", () => {
  it("shows the unread count", async () => {
    fake.onQuery(() => ({
      data: [notification("n1"), notification("n2"), notification("n3", "2026-09-29T10:00:00Z")],
    }));
    renderBell();
    expect(
      await screen.findByRole("button", { name: "Notifications, 2 unread" }),
    ).toHaveTextContent("2");
  });

  it("caps the badge at 9+", async () => {
    fake.onQuery(() => ({
      data: Array.from({ length: 12 }, (_, index) => notification(`n${index}`)),
    }));
    renderBell();
    expect(
      await screen.findByRole("button", { name: "Notifications, 12 unread" }),
    ).toHaveTextContent("9+");
  });

  it("shows an empty state", async () => {
    fake.onQuery(() => ({ data: [] }));
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Nothing yet.")).toBeInTheDocument();
  });

  it("marks everything read when opened", async () => {
    fake.onQuery((query) => (query.op === "select" ? { data: [notification("n1")] } : undefined));
    renderBell();

    await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));

    expect(await screen.findByText("Offer n1")).toBeInTheDocument();
    expect(screen.getByText("just now")).toBeInTheDocument();
    await waitFor(() => expect(fake.queries.some((query) => query.op === "update")).toBe(true));
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("toasts a realtime notification", async () => {
    fake.onQuery(() => ({ data: [] }));
    renderBell();
    await waitFor(() => expect(fake.listeners).toHaveLength(1));

    act(() => fake.emit("notifications", notification("live")));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("Offer live", { description: "A slot opened up" }),
    );
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
  });
});
