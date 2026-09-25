import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme/theme-context";

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
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b border-[rgba(23,42,37,0.08)] pb-6 sm:flex sm:flex-wrap sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#5f6b66]">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl leading-none tracking-[-0.04em] text-[#172a25] sm:text-[2.7rem]">
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
  tone?: "default" | "sage" | "sand" | "mist" | "terracotta" | "rose" | "lavender";
}) {
  const { theme } = useTheme();
  const isVibrant = theme === "vibrant";

  const tones: Record<string, string> = {
    default: "bg-white",
    sage: isVibrant ? "stat-card-sage" : "bg-[#dce8e1]",
    sand: isVibrant ? "stat-card-sand" : "bg-[#e9d6c7]",
    mist: isVibrant ? "stat-card-mist" : "bg-[#a9e5f4]",
    terracotta: isVibrant ? "stat-card-terracotta" : "bg-[#ff9670]/20",
    rose: isVibrant ? "stat-card-rose" : "bg-[#dfa3da]/20",
    lavender: isVibrant ? "stat-card-lavender" : "bg-[#c4b5fd]/20",
  };

  return (
    <div
      className={cn(
        "rounded-[12px] border border-[rgba(23,42,37,0.08)] p-5",
        isVibrant ? "card-3d" : "editorial-shadow-sm",
        tones[tone],
      )}
    >
      <p
        className={cn(
          "text-[11px] font-medium uppercase tracking-[0.16em]",
          isVibrant ? "text-[#1a1c1e]/70" : "text-[#5f6b66]",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "font-display mt-3 text-3xl leading-none",
          isVibrant ? "text-[#1a1c1e]" : "text-[#172a25]",
        )}
      >
        {value}
      </p>
      {hint && (
        <p
          className={cn(
            "mt-2 text-xs leading-5",
            isVibrant ? "text-[#1a1c1e]/70" : "text-[#5f6b66]",
          )}
        >
          {hint}
        </p>
      )}
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
    <div className="rounded-[12px] border border-dashed border-[rgba(23,42,37,0.15)] bg-[#f7f2e9] px-6 py-14 text-center">
      <p className="font-display text-[1.35rem] leading-none text-[#172a25]">{title}</p>
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
  const { theme } = useTheme();
  const isVibrant = theme === "vibrant";

  return (
    <section
      className={cn(
        "rounded-[14px] border border-[rgba(23,42,37,0.08)] bg-white",
        isVibrant ? "card-3d" : "editorial-shadow",
        className,
      )}
    >
      {(title || actions) && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[rgba(23,42,37,0.08)] px-5 py-4 sm:flex sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="truncate text-base font-medium text-[#172a25]">{title}</h2>}
            {description && <p className="mt-1 text-xs leading-5 text-[#5f6b66]">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
