import type { CSSProperties } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ = [
  {
    q: "Who is CareBridge for?",
    a: "Patients, doctors and reception staff. Each role signs in to its own workspace and sees only what it needs.",
  },
  {
    q: "How does the AI assistant book an appointment?",
    a: "It checks the doctor's real free slots and shows a booking proposal. Nothing is booked until you press Confirm, and reception then confirms the visit.",
  },
  {
    q: "Does the assistant give medical advice?",
    a: "No. It helps with bookings, bills, records and clinic policy questions. If a message sounds like an emergency, it tells you to call emergency services right away.",
  },
  {
    q: "Who can see my health records?",
    a: "You see your own records, your doctor sees the patients assigned to them, and reception sees what it needs to run the clinic. Access rules are enforced in the database itself.",
  },
  {
    q: "Will I get reminders?",
    a: "Yes. Confirmed visits send an email and a calendar invite. You can unsubscribe from clinic campaign emails at any time.",
  },
  {
    q: "How do bills work?",
    a: "An invoice is created from each visit and appears in your account. Reception records the payment and the invoice is marked paid.",
  },
];

export function LandingFaq() {
  return (
    <section className="border-t border-[rgba(26,26,46,0.1)] bg-[#f5f0e8] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div data-reveal="left">
          <p className="eyebrow text-[#666666]">FAQ</p>
          <h2 className="mt-4 font-display text-[2.5rem] leading-[1.1] tracking-[-0.04em] text-[#1a1a2e] sm:text-[3rem]">
            Questions, answered
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#666666]">
            Still curious? Ask the assistant after you sign in. It knows the clinic policies.
          </p>
        </div>
        <Accordion type="single" collapsible className="space-y-3">
          {FAQ.map((item, i) => (
            <div key={item.q} data-reveal style={{ "--delay": `${i * 80}ms` } as CSSProperties}>
              <AccordionItem
                value={item.q}
                className="cb-lift rounded-[16px] border border-[#1a1a2e] bg-white px-5 shadow-[4px_4px_0_0_#1a1a2e] data-[state=open]:bg-[#a8e6cf]/40"
              >
                <AccordionTrigger className="font-display text-lg text-[#1a1a2e] hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-base leading-7 text-[#444]">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            </div>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
