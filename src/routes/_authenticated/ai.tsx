import { createFileRoute } from "@tanstack/react-router";
import { CareBridgeAiPanel } from "@/components/clinic/carebridge-ai-panel";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({
    meta: [
      { title: "CareBridge AI — CareBridge" },
      { name: "description", content: "Your CareBridge AI conversations." },
    ],
  }),
  component: CareBridgeAiPage,
});

function CareBridgeAiPage() {
  return <CareBridgeAiPanel />;
}
