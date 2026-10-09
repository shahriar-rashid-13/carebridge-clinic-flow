import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck2, ShieldCheck, Activity, Clock, Users, FileText, CreditCard, HeartPulse, Sparkles, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCycle, useScrollReveal, useScrollVars } from "@/hooks/use-scroll-motion";
import { FeatureMarquee } from "@/components/landing/marquee";
import { StatsStrip } from "@/components/landing/stats";
import { PatientJourney } from "@/components/landing/journey";
import { ChatDemo } from "@/components/landing/chat-demo";
import { LandingFaq } from "@/components/landing/faq";
import { SkyBackdrop } from "@/components/sky-backdrop";

function HeroChips() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      <div className="cb-rise absolute right-[18%] top-[11%]" style={delay(900)}>
        <div className="cb-float flex items-center gap-3 rounded-[16px] border border-white/70 bg-white/70 px-4 py-3 shadow-[0_20px_40px_rgba(18,63,53,0.12)] backdrop-blur-md">
          <span className="grid size-9 place-items-center rounded-full bg-[#a8d8ea] text-[#2c5aa0]">
            <CalendarCheck2 className="size-4" />
          </span>
          <div>
            <p className="text-xs text-[#666666]">Next free slot</p>
            <p className="text-sm font-semibold text-[#1a1a2e]">Tue 10:30 · Dr. Vance</p>
          </div>
        </div>
      </div>
      <div className="cb-rise absolute bottom-[20%] right-[26%]" style={delay(1150)}>
        <div className="cb-float flex items-center gap-3 rounded-[16px] border border-white/70 bg-white/70 px-4 py-3 shadow-[0_20px_40px_rgba(18,63,53,0.12)] backdrop-blur-md [animation-delay:-3s]">
          <span className="grid size-9 place-items-center rounded-full bg-[#ffb6c1] text-[#c2185b]">
            <Sparkles className="size-4" />
          </span>
          <div>
            <p className="text-xs text-[#666666]">AI assistant</p>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-[#1a1a2e]">
              Booking confirmed <ShieldCheck className="size-4 text-[#1e5e4e]" />
            </p>
          </div>
        </div>
      </div>
      <div className="cb-rise absolute bottom-[42%] right-[3%]" style={delay(1400)}>
        <div className="cb-float rounded-[16px] border border-white/70 bg-white/70 px-4 py-3 shadow-[0_20px_40px_rgba(18,63,53,0.12)] backdrop-blur-md [animation-delay:-6s]">
          <p className="flex items-center gap-1.5 text-xs text-[#666666]">
            <HeartPulse className="size-3.5 text-[#c73e1d]" /> Heart rate
          </p>
          <p className="text-sm font-semibold text-[#1a1a2e]">72 bpm</p>
          <EcgLine beats={1} width={200} className="mt-1 h-5 w-28 text-[#c73e1d]" style={{ "--ecg-duration": "1.3s" } as React.CSSProperties} />
        </div>
      </div>
    </div>
  );
}

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as React.CSSProperties;

function ecgPath(beats: number, width: number) {
  const segment = width / beats;
  let d = "M0 60";
  for (let i = 0; i < beats; i++) {
    const mid = i * segment + segment / 2;
    d += ` H${mid - 70} l10 -6 l10 6 H${mid - 20} l10 -44 l16 84 l14 -56 l10 16 H${mid + 50} l12 -10 l12 10`;
  }
  return `${d} H${width}`;
}

function EcgLine({
  beats = 3,
  width = 1200,
  className,
  style,
}: {
  beats?: number;
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      className={cn("cb-ecg w-full", className)}
      style={style}
      viewBox={`0 0 ${width} 100`}
      preserveAspectRatio="none"
      fill="none"
    >
      <path
        d={ecgPath(beats, width)}
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const NAV_SECTIONS = [
  { id: "how-it-works", label: "How it works" },
  { id: "patients", label: "For patients" },
  { id: "doctors", label: "For doctors" },
  { id: "clinics", label: "For clinics" },
] as const;

const HERO_FLOW = [
  { label: "Patient books", status: "Requested", icon: CalendarCheck2, color: "text-[#b8860b]" },
  { label: "Reception confirms", status: "Confirmed", icon: ShieldCheck, color: "text-[#1e5e4e]" },
  { label: "Doctor consults", status: "Completed", icon: Activity, color: "text-[#2c5aa0]" },
  { label: "Billing settles", status: "Paid", icon: CreditCard, color: "text-[#c73e1d]" },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CareBridge — Healthcare that feels more human" },
      {
        name: "description",
        content:
          "CareBridge helps patients, doctors and reception staff coordinate clinic visits in one calm workspace.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const theme = "vibrant" as "calm" | "vibrant";
  const rootRef = React.useRef<HTMLDivElement>(null);
  useScrollReveal(rootRef);
  useScrollVars(rootRef);
  const activeStep = useCycle(HERO_FLOW.length, 1800);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    setMenuOpen(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <div ref={rootRef} className="min-h-screen overflow-x-clip bg-[#faf6f0] text-[#1a1a2e]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-[rgba(26,26,46,0.1)] bg-[#faf6f0]/95 backdrop-blur-sm transition-shadow duration-300 [[data-scrolled=true]_&]:shadow-[0_10px_30px_rgba(18,63,53,0.08)]">
        <div
          aria-hidden
          className="cb-scroll-bar absolute inset-x-0 bottom-[-1px] h-[3px] bg-gradient-to-r from-[#2d5a3d] via-[#a8e6cf] to-[#ffd93d]"
        />
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#2d5a3d] text-white">
              <Activity className="size-4" />
            </span>
            <span className="font-display text-lg leading-none">CareBridge</span>
          </Link>

          <div className="hidden items-center gap-8 lg:flex">
            {NAV_SECTIONS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => scrollToSection(e, item.id)}
                className="whitespace-nowrap text-sm text-[#666666] transition-colors hover:text-[#1a1a2e]"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" className="hidden h-10 border border-[rgba(26,26,46,0.15)] bg-transparent text-[#1a1a2e] hover:bg-[#f5f0e8] sm:inline-flex" asChild>
              <Link to="/login" search={{ redirect: "/dashboard" }}>Log in</Link>
            </Button>
            <Button className={cn(
              "h-10 text-sm text-white",
              theme === "calm" 
                ? "bg-[#123f35] hover:bg-[#0b2e27]" 
                : "bg-[#2d5a3d] hover:bg-[#1e3d2a]"
            )} asChild>
              <Link to="/signup">
                Get started <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="grid size-10 place-items-center rounded-md border border-[rgba(26,26,46,0.15)] text-[#1a1a2e] transition-colors hover:bg-[#f5f0e8] lg:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div id="landing-mobile-menu" className="border-t border-[rgba(26,26,46,0.1)] bg-[#faf6f0] px-4 pb-4 pt-2 sm:px-6 lg:hidden">
            <div className="mx-auto flex max-w-7xl flex-col">
              {NAV_SECTIONS.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => scrollToSection(e, item.id)}
                  className="rounded-md px-2 py-3 text-base text-[#1a1a2e] transition-colors hover:bg-[#f5f0e8]"
                >
                  {item.label}
                </a>
              ))}
              <Link
                to="/login"
                search={{ redirect: "/dashboard" }}
                className="rounded-md px-2 py-3 text-base text-[#1a1a2e] transition-colors hover:bg-[#f5f0e8] sm:hidden"
              >
                Log in
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative flex min-h-[calc(100svh-73px)] items-center overflow-hidden px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <SkyBackdrop />
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <EcgLine beats={3} className="absolute inset-x-0 bottom-10 h-24 text-[#2d5a3d]/25" />
        </div>
        <HeroChips />
        <div className="relative mx-auto w-full max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <p className={cn(
                "eyebrow cb-rise",
                "text-[#666666]"
              )}>
                Carebridge / clinic care
              </p>
              <h1 className={cn(
                "cb-rise mt-6 max-w-[16ch] font-display text-[3.5rem] leading-[0.95] tracking-[-0.05em] sm:text-[4.5rem] lg:text-[5.5rem]",
                "text-[#1a1a2e]"
              )} style={delay(120)}>
                Healthcare that feels{" "}
                <span className="relative inline-block">
                  more human.
                  <svg aria-hidden className="cb-draw absolute -bottom-3 left-0 h-4 w-full text-[#ff8b94]" viewBox="0 0 200 16" preserveAspectRatio="none" fill="none">
                    <path stroke="currentColor" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" d="M2 10 C 50 4, 110 4, 198 9" />
                  </svg>
                </span>
              </h1>
              <p className={cn(
                "cb-rise mt-8 max-w-xl text-lg leading-8",
                "text-[#666666]"
              )} style={delay(240)}>
                A calmer way to manage appointments, care plans, prescriptions and billing across the clinic. Built for patients, doctors and reception staff.
              </p>
              <div className="cb-rise mt-10 flex flex-wrap gap-4" style={delay(360)}>
                <Button
                  size="lg"
                  variant={"3d-primary"}
                  className={cn(
                    "h-12 px-8 text-base text-white",
                    theme === "calm" && "bg-[#123f35] hover:bg-[#0b2e27]"
                  )}
                  asChild
                >
                  <Link to="/login" search={{ redirect: "/dashboard" }}>
                    Book an appointment <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className={cn(
                    "h-12 border px-8 text-base",
                    theme === "calm" 
                      ? "border-[rgba(23,42,37,0.15)] bg-transparent text-[#172a25] hover:bg-[#f1eee6]" 
                      : "border-[rgba(26,26,46,0.15)] bg-transparent text-[#1a1a2e] hover:bg-[#f5f0e8]"
                  )}
                  asChild
                >
                  <Link to="/signup">Create account</Link>
                </Button>
              </div>
            </div>

            {/* Hero Visual - Workflow Card (small screens; large screens show the 3D scene) */}
            <div className="cb-rise relative lg:hidden" style={delay(300)}>
              <div className={cn(
                "cb-float absolute -inset-4 -z-10 rounded-[24px] blur-2xl",
                "bg-[#ff8b94]/20"
              )} />
              <div className={cn(
                "relative overflow-hidden rounded-[20px] border p-6 editorial-shadow-lg backdrop-blur-sm",
                theme === "calm" 
                  ? "border-[rgba(23,42,37,0.08)] bg-white/80" 
                  : "border-[rgba(26,26,46,0.1)] bg-white/85"
              )}>
                <div className={cn(
                  "flex items-center justify-between border-b pb-4",
                  "border-[rgba(26,26,46,0.1)]"
                )}>
                  <p className={cn(
                    "eyebrow",
                    "text-[#666666]"
                  )}>
                    Today's flow
                  </p>
                  <span className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
                    theme === "calm" 
                      ? "bg-[#dce8e1] text-[#234d43]" 
                      : "bg-[#a8e6cf] text-[#1e5e4e]"
                  )}>
                    <span className="cb-live-dot size-2 rounded-full bg-[#1e5e4e]" />
                    Live
                  </span>
                </div>
                <ul className="mt-6 space-y-4">
                  {HERO_FLOW.map((item, i) => (
                    <li key={item.label} className={cn(
                      "cb-rise flex items-center gap-4 rounded-[12px] border p-4 transition-all duration-500",
                      i === activeStep
                        ? "border-[#2d5a3d]/40 bg-white shadow-[0_10px_24px_rgba(18,63,53,0.10)]"
                        : theme === "calm"
                          ? "border-[rgba(23,42,37,0.08)] bg-[#f7f2e9]/50"
                          : "border-[rgba(26,26,46,0.1)] bg-[#faf6f0]/50"
                    )} style={delay(520 + i * 110)}>
                      <span className={cn(
                        "grid size-10 place-items-center rounded-full bg-white transition-transform duration-500",
                        i === activeStep && "scale-110 ring-2 ring-[#a8e6cf]",
                        item.color
                      )}>
                        <item.icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-sm font-medium",
                          "text-[#1a1a2e]"
                        )}>
                          {item.label}
                        </p>
                        <p className={cn(
                          "text-xs",
                          "text-[#666666]"
                        )}>
                          {item.status}
                        </p>
                      </div>
                      <ArrowRight className={cn(
                        "size-4 transition-all duration-500",
                        i === activeStep ? "translate-x-1 text-[#2d5a3d]" : "text-[#666666]"
                      )} />
                    </li>
                  ))}
                </ul>
                <div className="mt-5 h-1 overflow-hidden rounded-full bg-[#f5f0e8]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#2d5a3d] to-[#a8e6cf] transition-[width] duration-700 ease-out"
                    style={{ width: `${((activeStep + 1) / HERO_FLOW.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeatureMarquee />
      <StatsStrip />

      {/* How It Works Section */}
      <section id="how-it-works" className={cn(
        "scroll-mt-[73px] border-t px-4 py-20 sm:px-6 sm:py-32 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)] bg-[#f1eee6]" 
          : "border-[rgba(26,26,46,0.1)] bg-[#f5f0e8]"
      )}>
        <div className="mx-auto max-w-7xl">
          <div className="text-center" data-reveal>
            <p className={cn(
              "eyebrow",
              "text-[#666666]"
            )}>
              How CareBridge works
            </p>
            <h2 className={cn(
              "mt-4 font-display text-[2.5rem] leading-[1.1] tracking-[-0.04em] sm:text-[3rem]",
              "text-[#1a1a2e]"
            )}>
              Three roles, one calm workspace
            </h2>
            <p className={cn(
              "mx-auto mt-4 max-w-2xl text-lg leading-8",
              "text-[#666666]"
            )}>
              Patients book, doctors consult, reception confirms. Everyone stays in sync without the chaos.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                role: "Patient",
                description: "Book appointments, view prescriptions, manage your health profile.",
                icon: Users,
                color: "bg-[#a8e6cf] text-[#1e5e4e]",
                buttonVariant: "3d-sage",
              },
              {
                role: "Doctor",
                description: "See your schedule, consult patients, write prescriptions.",
                icon: Activity,
                color: "bg-[#a8d8ea] text-[#2c5aa0]",
                buttonVariant: "3d-mist",
              },
              {
                role: "Receptionist",
                description: "Manage appointments, doctors, billing and clinic operations.",
                icon: ShieldCheck,
                color: "bg-[#ffd93d] text-[#b8860b]",
                buttonVariant: "3d-sand",
              },
            ].map((item, i) => (
              <div key={item.role} data-reveal="scale" style={delay(i * 140)}>
              <div className={cn(
                "cb-lift group relative h-full overflow-hidden rounded-[20px] border p-8",
                theme === "calm" 
                  ? "border-[rgba(23,42,37,0.08)] bg-white editorial-shadow transition-all hover:editorial-shadow-lg" 
                  : "card-3d bg-white"
              )}>
                <span className={cn(
                  "cb-icon inline-grid size-12 place-items-center rounded-full",
                  item.color
                )}>
                  <item.icon className="size-6" />
                </span>
                <h3 className={cn(
                  "mt-6 font-display text-xl",
                  "text-[#1a1a2e]"
                )}>
                  {item.role}
                </h3>
                <p className={cn(
                  "mt-3 text-sm leading-6",
                  "text-[#666666]"
                )}>
                  {item.description}
                </p>
                <Button 
                  variant={item.buttonVariant as any}
                  className={cn(
                    "mt-6 text-sm font-medium",
                    theme === "calm" && "text-[#123f35] hover:bg-[#f1eee6]"
                  )}
                >
                  Learn more <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PatientJourney />

      {/* Patient Experience Section */}
      <section id="patients" className={cn(
        "scroll-mt-[73px] border-t px-4 py-20 sm:px-6 sm:py-32 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)]" 
          : "border-[rgba(26,26,46,0.1)]"
      )}>
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <div data-reveal="left">
              <p className={cn(
                "eyebrow",
                "text-[#666666]"
              )}>
                For patients
              </p>
              <h2 className={cn(
                "mt-4 font-display text-[2.5rem] leading-[1.1] tracking-[-0.04em] sm:text-[3rem]",
                "text-[#1a1a2e]"
              )}>
                Your health, organized
              </h2>
              <p className={cn(
                "mt-6 text-lg leading-8",
                "text-[#666666]"
              )}>
                Book appointments in seconds, view your prescriptions, and keep track of your health history—all in one place.
              </p>
              </div>
              <ul className="mt-8 space-y-4">
                {[
                  "Book appointments with your preferred doctor",
                  "View upcoming and past appointments",
                  "Access prescriptions and medical notes",
                  "Update your health profile anytime",
                ].map((item, i) => (
                  <li key={item} className="flex items-start gap-3" data-reveal="left" style={delay(150 + i * 100)}>
                    <span className={cn(
                      "cb-check mt-1 grid size-5 shrink-0 place-items-center rounded-full",
                      "bg-[#a8e6cf]"
                    )}>
                      <svg className={cn(
                        "size-3",
                        "text-[#1e5e4e]"
                      )} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span className={cn(
                      "text-sm leading-6",
                      "text-[#666666]"
                    )}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative" data-reveal="right" style={delay(100)}>
              <div className={cn(
                "cb-float absolute -inset-4 -z-10 rounded-[24px] blur-2xl",
                "bg-[#a8d8ea]/20"
              )} />
              <div className={cn(
                "cb-lift overflow-hidden rounded-[20px] border p-6 editorial-shadow-lg",
                theme === "calm" 
                  ? "border-[rgba(23,42,37,0.08)] bg-white" 
                  : "border-[rgba(26,26,46,0.1)] bg-white"
              )}>
                <div className={cn(
                  "flex items-center justify-between border-b pb-4",
                  "border-[rgba(26,26,46,0.1)]"
                )}>
                  <p className={cn(
                    "eyebrow",
                    "text-[#666666]"
                  )}>
                    Next appointment
                  </p>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    theme === "calm" 
                      ? "bg-[#dce8e1] text-[#234d43]" 
                      : "bg-[#a8e6cf] text-[#1e5e4e]"
                  )}>
                    Confirmed
                  </span>
                </div>
                <div className="mt-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className={cn(
                      "grid size-12 place-items-center rounded-full",
                      "bg-[#f5f0e8]"
                    )}>
                      <Activity className={cn(
                        "size-6",
                        "text-[#2d5a3d]"
                      )} />
                    </span>
                    <div>
                      <p className={cn(
                        "font-medium",
                        "text-[#1a1a2e]"
                      )}>
                        Dr. Marcus Vance
                      </p>
                      <p className={cn(
                        "text-sm",
                        "text-[#666666]"
                      )}>
                        General Medicine · Room 204
                      </p>
                    </div>
                  </div>
                  <div className={cn(
                    "grid grid-cols-2 gap-4 rounded-[12px] p-4",
                    "bg-[#faf6f0]"
                  )}>
                    <div>
                      <p className={cn(
                        "text-xs",
                        "text-[#666666]"
                      )}>
                        Date
                      </p>
                      <p className={cn(
                        "mt-1 font-medium",
                        "text-[#1a1a2e]"
                      )}>
                        Sep 28, 2026
                      </p>
                    </div>
                    <div>
                      <p className={cn(
                        "text-xs",
                        "text-[#666666]"
                      )}>
                        Time
                      </p>
                      <p className={cn(
                        "mt-1 font-medium",
                        "text-[#1a1a2e]"
                      )}>
                        10:00 AM
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant={"3d-primary"}
                    className={cn(
                      "w-full text-white",
                      theme === "calm" && "bg-[#123f35] hover:bg-[#0b2e27]"
                    )}
                  >
                    View details
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Doctor Experience Section */}
      <section id="doctors" className={cn(
        "scroll-mt-[73px] border-t px-4 py-20 sm:px-6 sm:py-32 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)] bg-[#f1eee6]" 
          : "border-[rgba(26,26,46,0.1)] bg-[#f5f0e8]"
      )}>
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="order-2 lg:order-1">
              <div className="relative" data-reveal="left">
                <div className={cn(
                  "cb-float absolute -inset-4 -z-10 rounded-[24px] blur-2xl",
                  "bg-[#ffd93d]/20"
                )} />
                <div className={cn(
                  "cb-lift overflow-hidden rounded-[20px] border p-6 editorial-shadow-lg",
                  theme === "calm" 
                    ? "border-[rgba(23,42,37,0.08)] bg-white" 
                    : "border-[rgba(26,26,46,0.1)] bg-white"
                )}>
                  <div className={cn(
                    "flex items-center justify-between border-b pb-4",
                    "border-[rgba(26,26,46,0.1)]"
                  )}>
                    <div className="flex items-center gap-3">
                      <p className={cn(
                        "eyebrow",
                        "text-[#666666]"
                      )}>
                        Today's schedule
                      </p>
                      <EcgLine
                        beats={1}
                        width={200}
                        className="h-5 w-20 text-[#c73e1d]/70"
                        style={{ "--ecg-duration": "2.2s" } as React.CSSProperties}
                      />
                    </div>
                    <span className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium",
                      theme === "calm" 
                        ? "bg-[#e9d6c7] text-[#8d6738]" 
                        : "bg-[#ffd93d] text-[#b8860b]"
                    )}>
                      4 patients
                    </span>
                  </div>
                  <ul className="mt-6 space-y-3">
                    {[
                      { time: "09:00", patient: "Sarah Jenkins", reason: "Follow-up", status: "Confirmed" },
                      { time: "10:00", patient: "James Wilson", reason: "Consultation", status: "Confirmed" },
                      { time: "11:30", patient: "Emma Davis", reason: "Check-up", status: "Requested" },
                      { time: "14:00", patient: "Michael Brown", reason: "Prescription", status: "Confirmed" },
                    ].map((apt, i) => (
                      <li key={apt.time} data-reveal style={delay(250 + i * 110)} className={cn(
                        "flex items-center gap-4 rounded-[12px] border p-4",
                        theme === "calm" 
                          ? "border-[rgba(23,42,37,0.08)] bg-[#f7f2e9]/50" 
                          : "border-[rgba(26,26,46,0.1)] bg-[#faf6f0]/50"
                      )}>
                        <span className={cn(
                          "w-16 text-sm font-medium",
                          "text-[#666666]"
                        )}>
                          {apt.time}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn(
                            "truncate text-sm font-medium",
                            "text-[#1a1a2e]"
                          )}>
                            {apt.patient}
                          </p>
                          <p className={cn(
                            "truncate text-xs",
                            "text-[#666666]"
                          )}>
                            {apt.reason}
                          </p>
                        </div>
                        <span className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium",
                          apt.status === "Confirmed" 
                            ? theme === "calm" 
                              ? "bg-[#dce8e1] text-[#234d43]" 
                              : "bg-[#a8e6cf] text-[#1e5e4e]"
                            : theme === "calm"
                              ? "bg-[#f5e9d2] text-[#8d6738]"
                              : "bg-[#ffd93d] text-[#b8860b]"
                        )}>
                          {apt.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div data-reveal="right">
              <p className={cn(
                "eyebrow",
                "text-[#666666]"
              )}>
                For doctors
              </p>
              <h2 className={cn(
                "mt-4 font-display text-[2.5rem] leading-[1.1] tracking-[-0.04em] sm:text-[3rem]",
                "text-[#1a1a2e]"
              )}>
                Focus on care, not admin
              </h2>
              <p className={cn(
                "mt-6 text-lg leading-8",
                "text-[#666666]"
              )}>
                See your schedule at a glance, access patient history instantly, and write prescriptions in seconds.
              </p>
              </div>
              <ul className="mt-8 space-y-4">
                {[
                  "View today's schedule and patient queue",
                  "Access complete patient history",
                  "Write and manage prescriptions",
                  "Track consultation notes",
                ].map((item, i) => (
                  <li key={item} className="flex items-start gap-3" data-reveal="right" style={delay(150 + i * 100)}>
                    <span className={cn(
                      "cb-check mt-1 grid size-5 shrink-0 place-items-center rounded-full",
                      "bg-[#a8d8ea]"
                    )}>
                      <svg className={cn(
                        "size-3",
                        "text-[#2c5aa0]"
                      )} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span className={cn(
                      "text-sm leading-6",
                      "text-[#666666]"
                    )}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* AI Assistant Section */}
      <section className={cn(
        "border-t px-4 py-20 sm:px-6 sm:py-32 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)]" 
          : "border-[rgba(26,26,46,0.1)]"
      )}>
        <div className="mx-auto max-w-7xl">
          <div className="text-center" data-reveal>
            <p className={cn(
              "eyebrow",
              "text-[#666666]"
            )}>
              AI Assistant
            </p>
            <h2 className={cn(
              "mt-4 font-display text-[2.5rem] leading-[1.1] tracking-[-0.04em] sm:text-[3rem]",
              "text-[#1a1a2e]"
            )}>
              Intelligent care, human touch
            </h2>
            <EcgLine
              beats={1}
              width={300}
              className="mx-auto mt-4 h-8 max-w-56 text-[#2c5aa0]/50"
              style={{ "--ecg-duration": "3s", "--delay": "400ms" } as React.CSSProperties}
            />
            <p className={cn(
              "mx-auto mt-4 max-w-2xl text-lg leading-8",
              "text-[#666666]"
            )}>
              Our AI assistant helps you book appointments, find information, and manage your care—while keeping you in control.
            </p>
          </div>

          <div className="mt-14" data-reveal="scale">
            <ChatDemo />
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                title: "Smart booking",
                description: "Describe your symptoms and let AI suggest the right specialist and time slot.",
                icon: Sparkles,
                color: "bg-[#ffb6c1]/20 text-[#c2185b]",
                buttonVariant: "3d-rose",
              },
              {
                title: "Instant answers",
                description: "Get answers about appointments, prescriptions, and clinic services instantly.",
                icon: Clock,
                color: "bg-[#a8d8ea]/20 text-[#2c5aa0]",
                buttonVariant: "3d-mist",
              },
              {
                title: "Secure & private",
                description: "Your health data stays private. AI only accesses what you allow.",
                icon: ShieldCheck,
                color: "bg-[#a8e6cf]/20 text-[#1e5e4e]",
                buttonVariant: "3d-sage",
              },
            ].map((feature, i) => (
              <div key={feature.title} data-reveal="scale" style={delay(i * 140)}>
              <div className={cn(
                "cb-lift group h-full rounded-[20px] border p-8",
                theme === "calm" 
                  ? "border-[rgba(23,42,37,0.08)] bg-white editorial-shadow" 
                  : "card-3d bg-white"
              )}>
                <span className={cn(
                  "cb-icon inline-grid size-12 place-items-center rounded-full",
                  feature.color
                )}>
                  <feature.icon className="size-6" />
                </span>
                <h3 className={cn(
                  "mt-6 font-display text-xl",
                  "text-[#1a1a2e]"
                )}>
                  {feature.title}
                </h3>
                <p className={cn(
                  "mt-3 text-sm leading-6",
                  "text-[#666666]"
                )}>
                  {feature.description}
                </p>
                <Button 
                  variant={feature.buttonVariant as any}
                  className={cn(
                    "mt-6 text-sm font-medium",
                    theme === "calm" && "text-[#123f35] hover:bg-[#f1eee6]"
                  )}
                >
                  Learn more <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section id="clinics" className={cn(
        "scroll-mt-[73px] border-t px-4 py-20 sm:px-6 sm:py-32 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)] bg-[#f1eee6]" 
          : "border-[rgba(26,26,46,0.1)] bg-[#f5f0e8]"
      )}>
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <div data-reveal="left">
              <p className={cn(
                "eyebrow",
                "text-[#666666]"
              )}>
                Trust & Security
              </p>
              <h2 className={cn(
                "mt-4 font-display text-[2.5rem] leading-[1.1] tracking-[-0.04em] sm:text-[3rem]",
                "text-[#1a1a2e]"
              )}>
                Your data, protected
              </h2>
              <p className={cn(
                "mt-6 text-lg leading-8",
                "text-[#666666]"
              )}>
                We take privacy seriously. Your health information is encrypted, secure, and never shared without your permission.
              </p>
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  { label: "End-to-end encryption", icon: ShieldCheck },
                  { label: "HIPAA compliant", icon: FileText },
                  { label: "Secure data storage", icon: Activity },
                  { label: "Regular audits", icon: Clock },
                ].map((item, i) => (
                  <div key={item.label} data-reveal="scale" style={delay(150 + i * 100)}>
                  <div className={cn(
                    "cb-lift flex items-center gap-3 rounded-[12px] border p-4",
                    theme === "calm" 
                      ? "border-[rgba(23,42,37,0.08)] bg-white" 
                      : "border-[rgba(26,26,46,0.1)] bg-white"
                  )}>
                    <span className={cn(
                      "cb-icon grid size-10 place-items-center rounded-full",
                      "bg-[#a8e6cf]"
                    )}>
                      <item.icon className={cn(
                        "size-5",
                        "text-[#1e5e4e]"
                      )} />
                    </span>
                    <span className={cn(
                      "text-sm font-medium",
                      "text-[#1a1a2e]"
                    )}>
                      {item.label}
                    </span>
                  </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative" data-reveal="right" style={delay(100)}>
              <div className={cn(
                "cb-float absolute -inset-4 -z-10 rounded-[24px] blur-2xl",
                "bg-[#ffb6c1]/20"
              )} />
              <div className={cn(
                "cb-lift overflow-hidden rounded-[20px] border p-8 editorial-shadow-lg",
                theme === "calm" 
                  ? "border-[rgba(23,42,37,0.08)] bg-white" 
                  : "border-[rgba(26,26,46,0.1)] bg-white"
              )}>
                <div className="flex items-center gap-4">
                  <span className={cn(
                    "grid size-16 place-items-center rounded-full",
                    "bg-[#a8e6cf]"
                  )}>
                    <ShieldCheck className={cn(
                      "size-8",
                      "text-[#1e5e4e]"
                    )} />
                  </span>
                  <div>
                    <p className={cn(
                      "font-display text-2xl",
                      "text-[#1a1a2e]"
                    )}>
                      100% Private
                    </p>
                    <p className={cn(
                      "text-sm",
                      "text-[#666666]"
                    )}>
                      Your health data belongs to you
                    </p>
                  </div>
                </div>
                <div className="mt-8 space-y-4">
                  <div className={cn(
                    "flex items-center justify-between rounded-[12px] p-4",
                    "bg-[#faf6f0]"
                  )}>
                    <span className={cn(
                      "text-sm",
                      "text-[#666666]"
                    )}>
                      Data encryption
                    </span>
                    <span className={cn(
                      "font-medium",
                      "text-[#1e5e4e]"
                    )}>
                      AES-256
                    </span>
                  </div>
                  <div className={cn(
                    "flex items-center justify-between rounded-[12px] p-4",
                    "bg-[#faf6f0]"
                  )}>
                    <span className={cn(
                      "text-sm",
                      "text-[#666666]"
                    )}>
                      Access control
                    </span>
                    <span className={cn(
                      "font-medium",
                      "text-[#1e5e4e]"
                    )}>
                      Role-based
                    </span>
                  </div>
                  <div className={cn(
                    "flex items-center justify-between rounded-[12px] p-4",
                    "bg-[#faf6f0]"
                  )}>
                    <span className={cn(
                      "text-sm",
                      "text-[#666666]"
                    )}>
                      Audit logs
                    </span>
                    <span className={cn(
                      "font-medium",
                      "text-[#1e5e4e]"
                    )}>
                      Complete
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingFaq />

      {/* Final CTA */}
      <section className={cn(
        "relative overflow-hidden border-t px-4 py-20 sm:px-6 sm:py-32 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)]" 
          : "border-[rgba(26,26,46,0.1)]"
      )}>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="cb-float absolute left-[8%] top-10 size-64 rounded-full bg-[#a8d8ea]/30 blur-3xl" />
          <div className="cb-float absolute bottom-0 right-[10%] size-72 rounded-full bg-[#ffb6c1]/25 blur-3xl [animation-delay:-5s]" />
          <EcgLine
            beats={4}
            className="absolute inset-x-0 bottom-4 h-20 text-[#ff8b94]/30"
            style={{ "--ecg-duration": "5.5s", "--delay": "800ms" } as React.CSSProperties}
          />
        </div>
        <div className="relative mx-auto max-w-4xl text-center" data-reveal="scale">
          <p className={cn(
            "eyebrow",
            "text-[#666666]"
          )}>
            Get started
          </p>
          <h2 className={cn(
            "mt-4 font-display text-[2.5rem] leading-[1.1] tracking-[-0.04em] sm:text-[3rem]",
            "text-[#1a1a2e]"
          )}>
            Ready to experience calmer healthcare?
          </h2>
          <p className={cn(
            "mx-auto mt-4 max-w-2xl text-lg leading-8",
            "text-[#666666]"
          )}>
            Join thousands of patients, doctors, and clinics using CareBridge to simplify healthcare management.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button
              size="lg"
              variant={"3d-primary"}
              className={cn(
                "h-12 px-8 text-base text-white",
                theme === "calm" && "bg-[#123f35] hover:bg-[#0b2e27]"
              )}
              asChild
            >
              <Link to="/signup">
                Create account <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className={cn(
                "h-12 border px-8 text-base",
                theme === "calm" 
                  ? "border-[rgba(23,42,37,0.15)] bg-transparent text-[#172a25] hover:bg-[#f1eee6]" 
                  : "border-[rgba(26,26,46,0.15)] bg-transparent text-[#1a1a2e] hover:bg-[#f5f0e8]"
              )}
              asChild
            >
              <Link to="/login" search={{ redirect: "/dashboard" }}>Log in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={cn(
        "border-t px-4 py-12 text-white sm:px-6 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)] bg-[#0b2e27]" 
          : "border-[rgba(26,26,46,0.1)] bg-[#1a1a2e]"
      )}>
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <Link to="/" className="flex items-center gap-2.5">
                <span className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-md text-white",
                  "bg-white text-[#1a1a2e]"
                )}>
                  <Activity className="size-4" />
                </span>
                <span className="font-display text-lg leading-none">CareBridge</span>
              </Link>
              <p className={cn(
                "mt-4 text-sm",
                "text-[#a0a0a0]"
              )}>
                Healthcare that feels more human.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Product</p>
              <ul className={cn(
                "mt-4 space-y-2 text-sm",
                "text-[#a0a0a0]"
              )}>
                <li><Link to="/" className="hover:text-white">Features</Link></li>
                <li><Link to="/" className="hover:text-white">Pricing</Link></li>
                <li><Link to="/" className="hover:text-white">Security</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium">Company</p>
              <ul className={cn(
                "mt-4 space-y-2 text-sm",
                "text-[#a0a0a0]"
              )}>
                <li><Link to="/" className="hover:text-white">About</Link></li>
                <li><Link to="/" className="hover:text-white">Blog</Link></li>
                <li><Link to="/" className="hover:text-white">Careers</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium">Legal</p>
              <ul className={cn(
                "mt-4 space-y-2 text-sm",
                "text-[#a0a0a0]"
              )}>
                <li><Link to="/" className="hover:text-white">Privacy</Link></li>
                <li><Link to="/" className="hover:text-white">Terms</Link></li>
                <li><Link to="/" className="hover:text-white">HIPAA</Link></li>
              </ul>
            </div>
          </div>
          <div className={cn(
            "mt-12 border-t pt-8 text-center text-sm",
            "border-[rgba(255,255,255,0.1)] text-[#a0a0a0]"
          )}>
            <p>© 2026 CareBridge. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

