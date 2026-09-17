import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DoctorNote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-[#214E46] bg-[#163A32] p-4 text-[#F7F4ED] shadow-[0_10px_30px_rgba(22,58,50,0.12)]",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[#DCE8E1]">
        <span className="inline-block h-2 w-2 rounded-full bg-[#F1DDD4]" />
        Important clinical information
      </div>
      <div className="text-sm leading-6 text-[#F7F4ED]/90">{children}</div>
    </div>
  );
}
