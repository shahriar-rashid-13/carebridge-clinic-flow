import {
  Apple,
  Baby,
  Bone,
  Brain,
  CalendarCheck2,
  CreditCard,
  Droplet,
  Ear,
  Eye,
  FileText,
  Hand,
  HeartPulse,
  type LucideIcon,
  Mail,
  MessageSquareText,
  ShieldCheck,
  Smile,
  Sparkles,
  Stethoscope,
  Wind,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { label: string; icon: LucideIcon };

const SPECIALTIES: Item[] = [
  { label: "General Medicine", icon: Stethoscope },
  { label: "Cardiology", icon: HeartPulse },
  { label: "Neurology", icon: Brain },
  { label: "Dermatology", icon: Hand },
  { label: "Psychiatry", icon: Smile },
  { label: "Orthopedics", icon: Bone },
  { label: "Ophthalmology", icon: Eye },
  { label: "ENT", icon: Ear },
  { label: "Pulmonology", icon: Wind },
  { label: "Endocrinology", icon: Droplet },
  { label: "Gastroenterology", icon: Apple },
  { label: "Obstetrics & Gynecology", icon: Baby },
];

const FEATURES: Item[] = [
  { label: "AI booking assistant", icon: Sparkles },
  { label: "Real-time slots", icon: CalendarCheck2 },
  { label: "Prescriptions", icon: FileText },
  { label: "Invoices & payments", icon: CreditCard },
  { label: "Email reminders", icon: Mail },
  { label: "Role-based access", icon: ShieldCheck },
  { label: "Policy answers", icon: MessageSquareText },
];

function Row({ items, reverse, tone }: { items: Item[]; reverse?: boolean; tone: string }) {
  const loop = [...items, ...items];
  return (
    <div className="cb-marquee group flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
      <ul
        className={cn(
          "cb-marquee-track flex shrink-0 gap-4 py-2 pr-4",
          reverse && "[animation-direction:reverse]",
        )}
      >
        {loop.map((item, i) => (
          <li
            key={`${item.label}-${i}`}
            aria-hidden={i >= items.length}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-full border border-[rgba(26,26,46,0.12)] px-5 py-2.5 text-sm font-medium text-[#1a1a2e] shadow-[2px_2px_0_0_rgba(26,26,46,0.85)]",
              tone,
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FeatureMarquee() {
  return (
    <section
      aria-label="Specialties and features"
      className="border-t border-[rgba(26,26,46,0.1)] py-10"
    >
      <div className="space-y-4">
        <Row items={SPECIALTIES} tone="bg-white" />
        <Row items={FEATURES} reverse tone="bg-[#a8e6cf]/60" />
      </div>
    </section>
  );
}
