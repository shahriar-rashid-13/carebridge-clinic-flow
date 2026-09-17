import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/lib/clinic/types";

const map: Record<string, string> = {
  Requested: "bg-[#f5e9d2] text-[#8d6738] border-[#e9d7b7]",
  Confirmed: "bg-[#dce8e1] text-[#234d43] border-[#bfd1c9]",
  Completed: "bg-[#ddebe5] text-[#315e52] border-[#bfd4cb]",
  Cancelled: "bg-[#f4dddd] text-[#7b3d44] border-[#e7c6c6]",
  Paid: "bg-[#dce8e1] text-[#234d43] border-[#bfd1c9]",
  Unpaid: "bg-[#f1ddd4] text-[#8c4d3a] border-[#e7c0b0]",
  Active: "bg-[#dce8e1] text-[#234d43] border-[#bfd1c9]",
  Inactive: "bg-[#edf1ee] text-[#5f6b66] border-[#d7ddd8]",
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
