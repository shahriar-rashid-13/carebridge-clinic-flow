import * as React from "react";
import { CalendarCheck2, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = { from: "user" | "bot"; text: string } | { from: "card"; confirmed: boolean };

const SCRIPT: { message: Message; wait: number }[] = [
  { message: { from: "user", text: "I need to see a GP next Tuesday morning." }, wait: 900 },
  {
    message: {
      from: "bot",
      text: "Dr. Marcus Vance (General Medicine) is free on Tue 13 Oct at 09:30, 10:30 and 11:00.",
    },
    wait: 1600,
  },
  { message: { from: "user", text: "10:30 please." }, wait: 1300 },
  { message: { from: "card", confirmed: false }, wait: 1500 },
  { message: { from: "card", confirmed: true }, wait: 1400 },
  {
    message: { from: "bot", text: "Done. Reception will confirm and you'll get an email." },
    wait: 1200,
  },
];

export function ChatDemo() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);
  const [shown, setShown] = React.useState(SCRIPT.length);
  const [typing, setTyping] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      {
        threshold: 0.35,
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!inView || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    const timers: number[] = [];
    const sleep = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms)));

    const run = async () => {
      while (!cancelled) {
        setShown(0);
        setTyping(false);
        await sleep(600);
        for (let i = 0; i < SCRIPT.length && !cancelled; i++) {
          const step = SCRIPT[i]!;
          if (step.message.from === "bot") {
            setTyping(true);
            await sleep(1100);
            setTyping(false);
          }
          setShown(i + 1);
          await sleep(step.wait);
        }
        await sleep(3500);
      }
    };
    void run();
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [inView]);

  const visible = SCRIPT.slice(0, shown)
    .map((s) => s.message)
    .filter((m, i, all) => !(m.from === "card" && !m.confirmed && all[i + 1]?.from === "card"));

  return (
    <div
      ref={ref}
      className="card-3d mx-auto w-full max-w-xl overflow-hidden rounded-[24px] bg-white"
    >
      <div className="flex items-center gap-3 border-b border-[rgba(26,26,46,0.1)] bg-[#a8d8ea]/40 px-5 py-4">
        <span className="grid size-9 place-items-center rounded-full border border-[#1a1a2e] bg-[#ffb6c1]">
          <Sparkles className="size-4 text-[#1a1a2e]" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[#1a1a2e]">CareBridge assistant</p>
          <p className="flex items-center gap-1.5 text-xs text-[#1e5e4e]">
            <span className="cb-live-dot size-1.5 rounded-full bg-[#1e5e4e]" /> Online
          </p>
        </div>
      </div>

      <div
        className="flex h-[420px] flex-col justify-end gap-3 overflow-hidden bg-[#faf6f0] p-5"
        aria-live="polite"
      >
        {visible.map((m, i) =>
          m.from === "card" ? (
            <div
              key={i}
              className="cb-bubble-in self-start rounded-[16px] border border-[#1a1a2e] bg-white p-4 shadow-[3px_3px_0_0_#1a1a2e]"
            >
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#666666]">
                <CalendarCheck2 className="size-4 text-[#2d5a3d]" /> Booking proposal
              </p>
              <p className="mt-2 text-sm font-medium text-[#1a1a2e]">
                Dr. Marcus Vance · Tue 13 Oct, 10:30
              </p>
              <span
                className={cn(
                  "mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#1a1a2e] px-4 py-1.5 text-xs font-semibold transition-colors duration-300",
                  m.confirmed ? "bg-[#a8e6cf] text-[#1e5e4e]" : "cb-press bg-[#2d5a3d] text-white",
                )}
              >
                {m.confirmed ? (
                  <>
                    <Check className="size-3.5" /> Confirmed
                  </>
                ) : (
                  "Confirm"
                )}
              </span>
            </div>
          ) : (
            <p
              key={i}
              className={cn(
                "cb-bubble-in max-w-[80%] rounded-[16px] px-4 py-2.5 text-sm leading-6",
                m.from === "user"
                  ? "self-end rounded-br-[4px] bg-[#2d5a3d] text-white"
                  : "self-start rounded-bl-[4px] border border-[rgba(26,26,46,0.12)] bg-white text-[#1a1a2e]",
              )}
            >
              {m.text}
            </p>
          ),
        )}
        {typing && (
          <span className="cb-bubble-in flex gap-1 self-start rounded-[16px] border border-[rgba(26,26,46,0.12)] bg-white px-4 py-3">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="cb-typing size-1.5 rounded-full bg-[#666666]"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
