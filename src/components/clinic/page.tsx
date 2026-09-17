import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b border-[#d7ddd8] pb-6 sm:flex sm:flex-wrap sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#5f6b66]">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl leading-none tracking-[-0.04em] text-[#16231f] sm:text-[2.7rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f6b66]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "sage" | "sand" | "mist" | "terracotta";
}) {
  const tones: Record<string, string> = {
    default: "bg-card",
    sage: "bg-sage/60",
    sand: "bg-sand/60",
    mist: "bg-mist/60",
    terracotta: "bg-terracotta/50",
  };
  return (
    <div className={cn("rounded-[12px] border border-[#d7ddd8] p-5 shadow-[0_10px_24px_rgba(22,58,50,0.03)]", tones[tone])}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#5f6b66]">
        {label}
      </p>
      <p className="font-display mt-3 text-3xl leading-none text-[#16231f]">{value}</p>
      {hint && <p className="mt-2 text-xs leading-5 text-[#5f6b66]">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-dashed border-[#d7ddd8] bg-[#f3efe7] px-6 py-14 text-center">
      <p className="font-display text-[1.35rem] leading-none text-[#16231f]">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#5f6b66]">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[14px] border border-[#d7ddd8] bg-white/70 shadow-[0_12px_30px_rgba(22,58,50,0.04)] backdrop-blur-sm", className)}>
      {(title || actions) && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#d7ddd8] px-5 py-4 sm:flex sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="truncate text-base font-medium text-[#16231f]">{title}</h2>}
            {description && <p className="mt-1 text-xs leading-5 text-[#5f6b66]">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
