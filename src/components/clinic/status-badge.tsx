import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/lib/clinic/types";

const map: Record<string, string> = {
  Requested: "bg-sand text-sand-foreground border-sand-foreground/20",
  Confirmed: "bg-sage text-sage-foreground border-sage-foreground/20",
  Completed: "bg-mist text-mist-foreground border-mist-foreground/20",
  Cancelled: "bg-rose text-rose-foreground border-rose-foreground/20",
  Paid: "bg-sage text-sage-foreground border-sage-foreground/20",
  Unpaid: "bg-terracotta text-terracotta-foreground border-terracotta-foreground/20",
  Active: "bg-sage text-sage-foreground border-sage-foreground/20",
  Inactive: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide",
        map[status] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {status}
    </span>
  );
}
