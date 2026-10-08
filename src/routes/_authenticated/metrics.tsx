import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/clinic/page";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AGENT_LABEL,
  KNOWLEDGE_LABEL,
  METRIC_PERIODS,
  compareRows,
  fetchAiMetrics,
  formatRate,
  toChartRows,
  versionMetrics,
  type AiMetrics,
} from "@/lib/clinic/metrics";
import {
  AGENT_EVAL_ROWS,
  EVAL_RUN_DATE,
  SEARCH_EVAL_ROWS,
  type EvalRow,
} from "@/lib/clinic/eval-scores";
import { useClinic } from "@/lib/clinic/store";

export const Route = createFileRoute("/_authenticated/metrics")({
  head: () => ({
    meta: [
      { title: "AI Metrics — CareBridge" },
      {
        name: "description",
        content: "Compare the CareBridge AI assistant versions on speed, cost and safety.",
      },
    ],
  }),
  component: MetricsPage,
});

const dailyConfig = {
  v2: { label: "v2 single agent", color: "#a9b8b1" },
  v3: { label: "v3 multi-agent", color: "#123f35" },
} satisfies ChartConfig;

const countConfig = {
  count: { label: "Turns", color: "#123f35" },
} satisfies ChartConfig;

function MetricsPage() {
  const { role } = useClinic();
  const [days, setDays] = React.useState<number>(30);
  const [metrics, setMetrics] = React.useState<AiMetrics | null>(null);

  React.useEffect(() => {
    if (role !== "receptionist") return;
    let active = true;
    fetchAiMetrics(days)
      .then((next) => {
        if (active) setMetrics(next);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load AI metrics.");
      });
    return () => {
      active = false;
    };
  }, [days, role]);

  if (role !== "receptionist") {
    return (
      <PageHeader
        title="Reception view only"
        description="AI metrics are reviewed by the front desk."
      />
    );
  }

  const v2 = metrics ? versionMetrics(metrics, "v2") : null;
  const v3 = metrics ? versionMetrics(metrics, "v3") : null;
  const rows = compareRows(v2, v3);
  const agentRows = metrics ? toChartRows(metrics.v3_agents, AGENT_LABEL) : [];
  const knowledgeRows = metrics ? toChartRows(metrics.v3_knowledge, KNOWLEDGE_LABEL) : [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Front desk"
        title="AI metrics"
        description="How the single-agent assistant (v2) compares with the multi-agent assistant (v3). Figures come from every assistant reply saved in the period; confirm and cancel clicks are left out."
        actions={METRIC_PERIODS.map((period) => (
          <Button
            key={period}
            size="sm"
            variant={days === period ? "default" : "outline"}
            onClick={() => setDays(period)}
            aria-pressed={days === period}
          >
            {period} days
          </Button>
        ))}
      />

      {!metrics ? (
        <p className="text-sm text-[#5f6b66]">Loading…</p>
      ) : metrics.versions.length === 0 ? (
        <EmptyState
          title="No AI conversations yet"
          description="Metrics appear once staff or patients use CareBridge AI."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="v3 turns"
              value={v3?.turns ?? 0}
              hint={`v2 turns: ${v2?.turns ?? 0}`}
              tone="sage"
            />
            <StatCard
              label="Routed by keywords"
              value={v3 ? formatRate(v3.keyword_route_turns, v3.turns) : "—"}
              hint="Supervisor model failed twice and the keyword router took over."
              tone="sand"
            />
            <StatCard
              label="Multi-agent replies"
              value={v3?.handoff_turns ?? 0}
              hint={`Clarifying questions asked: ${v3?.clarification_turns ?? 0}`}
              tone="mist"
            />
            <StatCard
              label="Guardrail events"
              value={
                v3
                  ? v3.emergency_turns + v3.injection_turns + v3.pii_turns + v3.output_guard_turns
                  : 0
              }
              hint={
                v3
                  ? `Emergency ${v3.emergency_turns}, injection ${v3.injection_turns}, PII ${v3.pii_turns}, output ${v3.output_guard_turns}`
                  : "No v3 turns yet."
              }
              tone="rose"
            />
          </div>

          <Panel
            title="v2 vs v3"
            description="Emergency replies skip the models, so they are left out of the latency and call figures."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">v2</TableHead>
                  <TableHead className="text-right">v3</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell>
                      <p className="font-medium text-[#172a25]">{row.label}</p>
                      <p className="text-xs text-[#5f6b66]">{row.hint}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.v2}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.v3}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>

          <Panel title="Turns per day" description="Dhaka time.">
            <ChartContainer config={dailyConfig} className="aspect-auto h-64 w-full">
              <BarChart data={metrics.daily}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="v2" stackId="turns" fill="var(--color-v2)" />
                <Bar dataKey="v3" stackId="turns" fill="var(--color-v3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="v3 specialist agents" description="Agents that answered, per turn.">
              {agentRows.length ? (
                <CountChart rows={agentRows} />
              ) : (
                <p className="text-sm text-[#5f6b66]">No v3 agent turns yet.</p>
              )}
            </Panel>
            <Panel
              title="v3 knowledge source"
              description="Where the supervisor sent each question."
            >
              {knowledgeRows.length ? (
                <CountChart rows={knowledgeRows} />
              ) : (
                <p className="text-sm text-[#5f6b66]">No v3 routed turns yet.</p>
              )}
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Agent evaluation"
              description={`Labelled scenarios run against both versions with test accounts (${EVAL_RUN_DATE}).`}
            >
              <EvalTable rows={AGENT_EVAL_ROWS} baseline="v2" current="v3" />
            </Panel>
            <Panel
              title="Search evaluation"
              description={`Assessment 2 search compared with the v3 search (${EVAL_RUN_DATE}).`}
            >
              <EvalTable rows={SEARCH_EVAL_ROWS} baseline="A2" current="v3" />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function EvalTable({
  rows,
  baseline,
  current,
}: {
  rows: EvalRow[];
  baseline: string;
  current: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Metric</TableHead>
          <TableHead className="text-right">{baseline}</TableHead>
          <TableHead className="text-right">{current}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell>
              <p className="font-medium text-[#172a25]">{row.label}</p>
              <p className="text-xs text-[#5f6b66]">{row.hint}</p>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.baseline}</TableCell>
            <TableCell className="text-right tabular-nums">{row.current}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CountChart({ rows }: { rows: { name: string; count: number }[] }) {
  return (
    <ChartContainer config={countConfig} className="aspect-auto h-56 w-full">
      <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={130} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
