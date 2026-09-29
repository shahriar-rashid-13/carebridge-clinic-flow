import * as React from "react";
import { Bell, CalendarClock, CalendarX2, Sparkles, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth/store";
import { useNotifications, type NotificationKind } from "@/lib/clinic/automations";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  reminder_24h: CalendarClock,
  no_show: UserX,
  waitlist_offer: Sparkles,
  offer_expired: CalendarX2,
};

const timeAgo = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
};

const NotificationsContext = React.createContext<ReturnType<typeof useNotifications> | null>(null);

// One subscription per session; the desktop and mobile bells share it.
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const notifications = useNotifications(user?.id);
  const { latest } = notifications;

  React.useEffect(() => {
    if (latest) toast(latest.title, { description: latest.body });
  }, [latest]);

  return <NotificationsContext.Provider value={notifications}>{children}</NotificationsContext.Provider>;
}

export function NotificationBell() {
  const notifications = React.useContext(NotificationsContext);
  const [open, setOpen] = React.useState(false);
  if (!notifications) return null;
  const { items, unread, markAllRead } = notifications;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void markAllRead();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative shrink-0 border-[rgba(23,42,37,0.15)]"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#c2185b] px-1 text-[10px] font-semibold leading-5 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-[rgba(23,42,37,0.08)] px-4 py-3">
          <p className="text-sm font-medium">Notifications</p>
          <p className="text-xs text-muted-foreground">Reminders, waitlist offers and follow-ups</p>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind] ?? Bell;
              return (
                <li key={item.id} className={cn("flex gap-3 px-4 py-3", !item.read_at && "bg-[#f7f2e9]")}>
                  <Icon className="mt-0.5 size-4 shrink-0 text-[#2d5a3d]" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-5">{item.title}</p>
                    <p className="text-xs leading-5 text-muted-foreground">{item.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(item.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
