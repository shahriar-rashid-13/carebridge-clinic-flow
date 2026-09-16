import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel } from "@/components/clinic/page";
import { useClinic } from "@/lib/clinic/store";
import { prettyDate } from "@/lib/clinic/data";

export const Route = createFileRoute("/patients")({
  head: () => ({
    meta: [
      { title: "Patients — CareBridge" },
      {
        name: "description",
        content: "Directory of registered patients with contact details and appointment counts.",
      },
      { property: "og:title", content: "Patients — CareBridge" },
      {
        property: "og:description",
        content: "Front desk directory of every registered patient in the clinic.",
      },
    ],
  }),
  component: PatientsPage,
});

function PatientsPage() {
  const { role, patients, appointments } = useClinic();
  const [q, setQ] = React.useState("");

  if (role !== "receptionist") {
    return (
      <PageHeader
        title="Reception view only"
        description="Switch the role selector to Receptionist to open the patient directory."
      />
    );
  }

  const list = patients.filter((p) =>
    [p.name, p.email, p.phone].join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Front desk"
        title="Patients"
        description={`${patients.length} registered patients.`}
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email or phone"
          className="pl-9"
        />
      </div>

      {list.length === 0 ? (
        <EmptyState title="No patients match" description="Try a different search term." />
      ) : (
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="pb-3 font-medium">Patient</th>
                  <th className="pb-3 font-medium">Contact</th>
                  <th className="pb-3 font-medium">Born</th>
                  <th className="pb-3 font-medium">Visits</th>
                  <th className="pb-3 font-medium">Upcoming</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((p) => {
                  const all = appointments.filter((a) => a.patientId === p.id);
                  return (
                    <tr key={p.id}>
                      <td className="py-3">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.gender} · {p.bloodType}
                        </p>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        <p>{p.phone}</p>
                        <p className="text-xs">{p.email}</p>
                      </td>
                      <td className="py-3 text-muted-foreground">{prettyDate(p.dob)}</td>
                      <td className="py-3">{all.length}</td>
                      <td className="py-3 text-muted-foreground">
                        {all.filter((a) => a.status === "Confirmed" || a.status === "Requested")
                          .length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
