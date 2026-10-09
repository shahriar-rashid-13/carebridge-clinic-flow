import * as React from "react";
import {
  CalendarCheck2,
  CheckCircle2,
  CreditCard,
  FileText,
  Mail,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_HEIGHT = 73;

function BookPanel() {
  const days = ["Mon 12", "Tue 13", "Wed 14", "Thu 15"];
  const slots = ["09:00", "09:30", "10:30", "11:00", "14:00", "15:30"];
  return (
    <>
      <p className="eyebrow">Book a visit</p>
      <p className="mt-2 font-display text-2xl text-[#1a1a2e]">Dr. Marcus Vance</p>
      <p className="text-sm text-[#666666]">General Medicine · Room 204</p>
      <div className="mt-5 grid grid-cols-4 gap-2">
        {days.map((d, i) => (
          <span
            key={d}
            className={cn(
              "rounded-[10px] border py-2 text-center text-xs font-medium",
              i === 1 ? "border-[#1a1a2e] bg-[#a8d8ea]" : "border-[rgba(26,26,46,0.12)] bg-white",
            )}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {slots.map((s) => (
          <span
            key={s}
            className={cn(
              "rounded-full border py-2 text-center text-sm",
              s === "10:30"
                ? "border-[#1a1a2e] bg-[#2d5a3d] font-semibold text-white shadow-[2px_2px_0_0_#1a1a2e]"
                : "border-[rgba(26,26,46,0.12)] bg-white text-[#1a1a2e]",
            )}
          >
            {s}
          </span>
        ))}
      </div>
    </>
  );
}

function ConfirmPanel() {
  return (
    <>
      <p className="eyebrow">Reception queue</p>
      <div className="mt-4 rounded-[14px] border border-[rgba(26,26,46,0.12)] bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-[#1a1a2e]">Sarah Jenkins</p>
            <p className="text-sm text-[#666666]">Tue 13 · 10:30 · Dr. Vance</p>
          </div>
          <span className="cb-badge-flip rounded-full bg-[#a8e6cf] px-3 py-1 text-xs font-semibold text-[#1e5e4e]">
            Confirmed
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-[14px] bg-[#faf6f0] p-4 text-sm text-[#1a1a2e]">
        <Mail className="size-4 text-[#2c5aa0]" />
        Confirmation email sent to patient
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-[14px] bg-[#faf6f0] p-4 text-sm text-[#1a1a2e]">
        <CalendarCheck2 className="size-4 text-[#1e5e4e]" />
        Added to Google Calendar
      </div>
    </>
  );
}

function ConsultPanel() {
  return (
    <>
      <p className="eyebrow">Consultation</p>
      <p className="mt-2 font-display text-2xl text-[#1a1a2e]">Sarah Jenkins</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["Heart rate", "72 bpm"],
          ["BP", "118/76"],
          ["Temp", "36.8°C"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[12px] bg-[#faf6f0] p-3">
            <p className="text-[11px] uppercase tracking-wider text-[#666666]">{k}</p>
            <p className="mt-1 font-semibold text-[#1a1a2e]">{v}</p>
          </div>
        ))}
      </div>
      <svg
        aria-hidden
        viewBox="0 0 300 60"
        className="cb-ecg mt-4 h-14 w-full text-[#c73e1d]"
        fill="none"
      >
        <path
          d="M0 35 H90 l8 -5 l8 5 H130 l8 -26 l12 48 l10 -32 l8 10 H200 l10 -6 l10 6 H300"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="mt-2 rounded-[12px] border border-dashed border-[rgba(26,26,46,0.2)] p-3 text-sm text-[#666666]">
        Notes: mild seasonal allergy, follow-up in 4 weeks.
      </p>
    </>
  );
}

function PrescribePanel() {
  return (
    <>
      <p className="eyebrow">Prescription</p>
      <ul className="mt-4 space-y-3">
        {[
          ["Cetirizine 10 mg", "Once daily · 14 days", "bg-[#ffd93d]"],
          ["Saline nasal spray", "Twice daily · as needed", "bg-[#a8d8ea]"],
          ["Vitamin D3 1000 IU", "Once daily · 30 days", "bg-[#a8e6cf]"],
        ].map(([name, dose, tone]) => (
          <li
            key={name}
            className="flex items-center gap-3 rounded-[14px] border border-[rgba(26,26,46,0.12)] bg-white p-3"
          >
            <span className={cn("h-8 w-3 rounded-full", tone)} />
            <div>
              <p className="text-sm font-medium text-[#1a1a2e]">{name}</p>
              <p className="text-xs text-[#666666]">{dose}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-[#666666]">
        Signed by Dr. Marcus Vance · visible in patient portal
      </p>
    </>
  );
}

function PayPanel() {
  return (
    <>
      <p className="eyebrow">Invoice #1042</p>
      <div className="mt-4 space-y-2 text-sm">
        {[
          ["Consultation", "$80.00"],
          ["Follow-up booking", "$0.00"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between rounded-[12px] bg-[#faf6f0] p-3">
            <span className="text-[#666666]">{k}</span>
            <span className="font-medium text-[#1a1a2e]">{v}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-[rgba(26,26,46,0.12)] px-3 pt-3 font-semibold text-[#1a1a2e]">
          <span>Total</span>
          <span>$80.00</span>
        </div>
      </div>
      <div className="mt-6 flex justify-center">
        <span className="cb-stamp inline-flex items-center gap-2 rounded-[10px] border-2 border-[#1e5e4e] px-5 py-2 font-display text-2xl uppercase tracking-widest text-[#1e5e4e]">
          <CheckCircle2 className="size-6" /> Paid
        </span>
      </div>
    </>
  );
}

const STEPS = [
  {
    title: "Patient books",
    body: "Pick a doctor and a free slot, or ask the AI assistant to find one.",
    icon: CalendarCheck2,
    tone: "bg-[#ffd93d]",
    panel: BookPanel,
  },
  {
    title: "Reception confirms",
    body: "Staff confirm in one click. Email and calendar invites go out automatically.",
    icon: ShieldCheck,
    tone: "bg-[#a8e6cf]",
    panel: ConfirmPanel,
  },
  {
    title: "Doctor consults",
    body: "The doctor sees history, vitals and notes on one screen.",
    icon: Stethoscope,
    tone: "bg-[#a8d8ea]",
    panel: ConsultPanel,
  },
  {
    title: "Prescription issued",
    body: "Medicines and dosage land in the patient portal right away.",
    icon: FileText,
    tone: "bg-[#ffb6c1]",
    panel: PrescribePanel,
  },
  {
    title: "Billing settles",
    body: "The invoice is created from the visit and marked paid at the desk.",
    icon: CreditCard,
    tone: "bg-[#ff8b94]",
    panel: PayPanel,
  },
];

export function PatientJourney() {
  const sectionRef = React.useRef<HTMLElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const travel = rect.height - (window.innerHeight - NAV_HEIGHT);
      setProgress(Math.min(Math.max((NAV_HEIGHT - rect.top) / travel, 0), 1));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const active = Math.min(Math.floor(progress * STEPS.length), STEPS.length - 1);

  const goTo = (index: number) => {
    const el = sectionRef.current;
    if (!el) return;
    const travel = el.offsetHeight - (window.innerHeight - NAV_HEIGHT);
    const top = el.getBoundingClientRect().top + window.scrollY - NAV_HEIGHT;
    window.scrollTo({ top: top + ((index + 0.5) / STEPS.length) * travel, behavior: "smooth" });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    stage.style.setProperty("--tilt-x", `${(-y * 10).toFixed(2)}deg`);
    stage.style.setProperty("--tilt-y", `${(x * 14).toFixed(2)}deg`);
  };

  const onPointerLeave = () => {
    stageRef.current?.style.setProperty("--tilt-x", "0deg");
    stageRef.current?.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Patient journey"
      className="relative border-t border-[rgba(26,26,46,0.1)] bg-[#1a1a2e]"
      style={{ height: `${STEPS.length * 70 + 100}vh` }}
    >
      <div className="sticky top-[73px] flex h-[calc(100vh-73px)] items-center overflow-hidden px-4 sm:px-6 lg:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="cb-float absolute -left-24 top-10 size-96 rounded-full bg-[#2d5a3d]/50 blur-3xl" />
          <div className="cb-float absolute -right-20 bottom-0 size-96 rounded-full bg-[#2c5aa0]/30 blur-3xl [animation-delay:-6s]" />
        </div>

        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="eyebrow text-[#a8e6cf]">One visit, start to finish</p>
            <h2 className="mt-4 font-display text-[2.5rem] leading-[1.05] tracking-[-0.04em] text-white sm:text-[3.25rem]">
              Follow a patient through CareBridge
            </h2>
            <ol className="relative mt-10 space-y-2">
              <span
                aria-hidden
                className="absolute bottom-6 left-[1.35rem] top-6 w-px bg-white/15"
              />
              <span
                aria-hidden
                className="absolute left-[1.35rem] top-6 w-px bg-gradient-to-b from-[#a8e6cf] to-[#ffd93d] transition-[height] duration-300"
                style={{ height: `calc((100% - 3rem) * ${progress})` }}
              />
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    className={cn(
                      "relative flex w-full items-start gap-4 rounded-[14px] p-2 text-left transition-all duration-500",
                      i === active ? "bg-white/10" : "opacity-55 hover:opacity-80",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-11 shrink-0 place-items-center rounded-full border border-[#1a1a2e] text-[#1a1a2e] transition-transform duration-500",
                        step.tone,
                        i === active && "scale-110 shadow-[3px_3px_0_0_#000]",
                      )}
                    >
                      <step.icon className="size-5" />
                    </span>
                    <span className="pt-1">
                      <span className="block font-display text-lg text-white">{step.title}</span>
                      <span
                        className={cn(
                          "grid text-sm text-white/70 transition-all duration-500",
                          i === active
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <span className="overflow-hidden">{step.body}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div
            ref={stageRef}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            className="cb-stage relative mx-auto hidden h-[400px] w-full max-w-md sm:block"
          >
            {STEPS.map((step, i) => {
              const Panel = step.panel;
              const offset = i - active;
              return (
                <div
                  key={step.title}
                  aria-hidden={offset !== 0}
                  className="cb-panel absolute inset-0 rounded-[24px] border border-[#1a1a2e] bg-[#f7f2e9] p-7 shadow-[8px_8px_0_0_#000]"
                  data-offset={Math.max(-1, Math.min(1, offset))}
                >
                  <div
                    className={cn(
                      "absolute -top-4 left-7 rounded-full border border-[#1a1a2e] px-3 py-1 text-xs font-semibold text-[#1a1a2e]",
                      step.tone,
                    )}
                  >
                    Step {i + 1} of {STEPS.length}
                  </div>
                  <Panel />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
