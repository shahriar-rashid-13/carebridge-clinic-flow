import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck2, ShieldCheck, Activity, Clock, Users, FileText, CreditCard, HeartPulse, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const theme = "vibrant";

  return (
    <div className="min-h-screen bg-[#faf6f0] text-[#1a1a2e]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-[rgba(26,26,46,0.1)] bg-[#faf6f0]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#2d5a3d] text-white">
              <Activity className="size-4" />
            </span>
            <span className="font-display text-lg leading-none">CareBridge</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <Link to="/" className={cn(
              "text-sm transition-colors",
              "text-[#666666] hover:text-[#1a1a2e]"
            )}>
              How it works
            </Link>
            <Link to="/" className={cn(
              "text-sm transition-colors",
              "text-[#666666] hover:text-[#1a1a2e]"
            )}>
              For patients
            </Link>
            <Link to="/" className={cn(
              "text-sm transition-colors",
              "text-[#666666] hover:text-[#1a1a2e]"
            )}>
              For doctors
            </Link>
            <Link to="/" className={cn(
              "text-sm transition-colors",
              "text-[#666666] hover:text-[#1a1a2e]"
            )}>
              For clinics
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" className="h-10 border border-[rgba(26,26,46,0.15)] bg-transparent text-[#1a1a2e] hover:bg-[#f5f0e8]" asChild>
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
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <p className={cn(
                "eyebrow",
                "text-[#666666]"
              )}>
                Carebridge / clinic care
              </p>
              <h1 className={cn(
                "mt-6 max-w-[16ch] font-display text-[3.5rem] leading-[0.95] tracking-[-0.05em] sm:text-[4.5rem] lg:text-[5.5rem]",
                "text-[#1a1a2e]"
              )}>
                Healthcare that feels more human.
              </h1>
              <p className={cn(
                "mt-8 max-w-xl text-lg leading-8",
                "text-[#666666]"
              )}>
                A calmer way to manage appointments, care plans, prescriptions and billing across the clinic. Built for patients, doctors and reception staff.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
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

            {/* Hero Visual - Workflow Card */}
            <div className="relative">
              <div className={cn(
                "absolute -inset-4 -z-10 rounded-[24px] blur-2xl",
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
                    "rounded-full px-3 py-1 text-xs font-medium",
                    theme === "calm" 
                      ? "bg-[#dce8e1] text-[#234d43]" 
                      : "bg-[#a8e6cf] text-[#1e5e4e]"
                  )}>
                    Live
                  </span>
                </div>
                <ul className="mt-6 space-y-4">
                  {[
                    { label: "Patient books", status: "Requested", icon: CalendarCheck2, color: "text-[#b8860b]" },
                    { label: "Reception confirms", status: "Confirmed", icon: ShieldCheck, color: "text-[#1e5e4e]" },
                    { label: "Doctor consults", status: "Completed", icon: Activity, color: "text-[#2c5aa0]" },
                    { label: "Billing settles", status: "Paid", icon: CreditCard, color: "text-[#c73e1d]" },
                  ].map((item) => (
                    <li key={item.label} className={cn(
                      "flex items-center gap-4 rounded-[12px] border p-4",
                      theme === "calm" 
                        ? "border-[rgba(23,42,37,0.08)] bg-[#f7f2e9]/50" 
                        : "border-[rgba(26,26,46,0.1)] bg-[#faf6f0]/50"
                    )}>
                      <span className={cn(
                        "grid size-10 place-items-center rounded-full bg-white",
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
                        "size-4",
                        "text-[#666666]"
                      )} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className={cn(
        "border-t px-4 py-20 sm:px-6 sm:py-32 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)] bg-[#f1eee6]" 
          : "border-[rgba(26,26,46,0.1)] bg-[#f5f0e8]"
      )}>
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
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
            ].map((item) => (
              <div key={item.role} className={cn(
                "group relative overflow-hidden rounded-[20px] border p-8",
                theme === "calm" 
                  ? "border-[rgba(23,42,37,0.08)] bg-white editorial-shadow transition-all hover:editorial-shadow-lg" 
                  : "card-3d bg-white"
              )}>
                <span className={cn(
                  "inline-grid size-12 place-items-center rounded-full",
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
            ))}
          </div>
        </div>
      </section>

      {/* Patient Experience Section */}
      <section className={cn(
        "border-t px-4 py-20 sm:px-6 sm:py-32 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)]" 
          : "border-[rgba(26,26,46,0.1)]"
      )}>
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
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
              <ul className="mt-8 space-y-4">
                {[
                  "Book appointments with your preferred doctor",
                  "View upcoming and past appointments",
                  "Access prescriptions and medical notes",
                  "Update your health profile anytime",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className={cn(
                      "mt-1 grid size-5 shrink-0 place-items-center rounded-full",
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
            <div className="relative">
              <div className={cn(
                "absolute -inset-4 -z-10 rounded-[24px] blur-2xl",
                "bg-[#a8d8ea]/20"
              )} />
              <div className={cn(
                "overflow-hidden rounded-[20px] border p-6 editorial-shadow-lg",
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
                        Cardiology · Room 204
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
      <section className={cn(
        "border-t px-4 py-20 sm:px-6 sm:py-32 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)] bg-[#f1eee6]" 
          : "border-[rgba(26,26,46,0.1)] bg-[#f5f0e8]"
      )}>
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="order-2 lg:order-1">
              <div className="relative">
                <div className={cn(
                  "absolute -inset-4 -z-10 rounded-[24px] blur-2xl",
                  "bg-[#ffd93d]/20"
                )} />
                <div className={cn(
                  "overflow-hidden rounded-[20px] border p-6 editorial-shadow-lg",
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
                      Today's schedule
                    </p>
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
                    ].map((apt) => (
                      <li key={apt.time} className={cn(
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
              <ul className="mt-8 space-y-4">
                {[
                  "View today's schedule and patient queue",
                  "Access complete patient history",
                  "Write and manage prescriptions",
                  "Track consultation notes",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className={cn(
                      "mt-1 grid size-5 shrink-0 place-items-center rounded-full",
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
          <div className="text-center">
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
            <p className={cn(
              "mx-auto mt-4 max-w-2xl text-lg leading-8",
              "text-[#666666]"
            )}>
              Our AI assistant helps you book appointments, find information, and manage your care—while keeping you in control.
            </p>
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
            ].map((feature) => (
              <div key={feature.title} className={cn(
                "rounded-[20px] border p-8",
                theme === "calm" 
                  ? "border-[rgba(23,42,37,0.08)] bg-white editorial-shadow" 
                  : "card-3d bg-white"
              )}>
                <span className={cn(
                  "inline-grid size-12 place-items-center rounded-full",
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
                  Learn more <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className={cn(
        "border-t px-4 py-20 sm:px-6 sm:py-32 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)] bg-[#f1eee6]" 
          : "border-[rgba(26,26,46,0.1)] bg-[#f5f0e8]"
      )}>
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
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
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  { label: "End-to-end encryption", icon: ShieldCheck },
                  { label: "HIPAA compliant", icon: FileText },
                  { label: "Secure data storage", icon: Activity },
                  { label: "Regular audits", icon: Clock },
                ].map((item) => (
                  <div key={item.label} className={cn(
                    "flex items-center gap-3 rounded-[12px] border p-4",
                    theme === "calm" 
                      ? "border-[rgba(23,42,37,0.08)] bg-white" 
                      : "border-[rgba(26,26,46,0.1)] bg-white"
                  )}>
                    <span className={cn(
                      "grid size-10 place-items-center rounded-full",
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
                ))}
              </div>
            </div>
            <div className="relative">
              <div className={cn(
                "absolute -inset-4 -z-10 rounded-[24px] blur-2xl",
                "bg-[#ffb6c1]/20"
              )} />
              <div className={cn(
                "overflow-hidden rounded-[20px] border p-8 editorial-shadow-lg",
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

      {/* Final CTA */}
      <section className={cn(
        "border-t px-4 py-20 sm:px-6 sm:py-32 lg:px-8",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)]" 
          : "border-[rgba(26,26,46,0.1)]"
      )}>
        <div className="mx-auto max-w-4xl text-center">
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

