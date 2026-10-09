import * as React from "react";
import { cn } from "@/lib/utils";

const STATS = [
  {
    value: 96,
    suffix: "%",
    label: "AI task success",
    detail: "Multi-agent assistant, scripted evals",
    tone: "bg-[#a8e6cf]",
  },
  {
    value: 100,
    suffix: "%",
    label: "Policy answers correct",
    detail: "Clinic policy questions in evals",
    tone: "bg-[#a8d8ea]",
  },
  {
    value: 12,
    suffix: "",
    label: "Specialties",
    detail: "From General Medicine to ENT",
    tone: "bg-[#ffd93d]",
  },
  {
    value: 464,
    suffix: "",
    label: "Automated tests",
    detail: "Run in CI on every push",
    tone: "bg-[#ffb6c1]",
  },
];

function CountUp({ to, suffix, start }: { to: number; suffix: string; start: boolean }) {
  const [value, setValue] = React.useState(to);

  React.useEffect(() => {
    if (!start) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const duration = 1400;
    const begin = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - begin) / duration, 1);
      setValue(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setValue(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, to]);

  return (
    <span className="tabular-nums">
      {value}
      {suffix}
    </span>
  );
}

export function StatsStrip() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="border-t border-[rgba(26,26,46,0.1)] px-4 py-16 sm:px-6 lg:px-8">
      <div ref={ref} className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            data-reveal="scale"
            style={{ "--delay": `${i * 120}ms` } as React.CSSProperties}
          >
            <div className={cn("card-3d cb-lift h-full rounded-[20px] p-6", stat.tone)}>
              <p className="font-display text-5xl tracking-[-0.04em] text-[#1a1a2e]">
                <CountUp to={stat.value} suffix={stat.suffix} start={inView} />
              </p>
              <p className="mt-3 text-sm font-semibold text-[#1a1a2e]">{stat.label}</p>
              <p className="mt-1 text-xs text-[#1a1a2e]/70">{stat.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
