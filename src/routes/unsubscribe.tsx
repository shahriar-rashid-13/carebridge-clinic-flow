import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { unsubscribe } from "@/lib/clinic/campaigns";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  head: () => ({
    meta: [{ title: "Email preferences — CareBridge" }, { name: "robots", content: "noindex" }],
  }),
  component: UnsubscribePage,
});

type State = "idle" | "saving" | "done" | "error";

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const [alsoReminders, setAlsoReminders] = React.useState(false);
  const [state, setState] = React.useState<State>(token ? "idle" : "error");

  const confirm = async () => {
    setState("saving");
    try {
      await unsubscribe(token, alsoReminders ? "all" : "campaign");
      setState("done");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#f7f2e9] px-4">
      <div className="w-full max-w-md rounded-[14px] border border-[rgba(23,42,37,0.08)] bg-white p-8">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-[#123f35] text-white">
            <Activity className="size-4" />
          </span>
          <span className="font-display text-lg leading-none">CareBridge</span>
        </Link>

        {state === "done" ? (
          <div className="mt-6 space-y-2">
            <CheckCircle2 className="size-6 text-[#2d5a3d]" />
            <h1 className="font-display text-2xl text-[#172a25]">You are unsubscribed</h1>
            <p className="text-sm leading-6 text-[#5f6b66]">
              {alsoReminders
                ? "We will not send you any more emails, including appointment reminders."
                : "We will not send you any more campaign emails. Appointment reminders still arrive."}{" "}
              To change this, contact reception.
            </p>
          </div>
        ) : state === "error" ? (
          <div className="mt-6 space-y-2">
            <h1 className="font-display text-2xl text-[#172a25]">This link does not work</h1>
            <p className="text-sm leading-6 text-[#5f6b66]">
              The link is invalid or has expired. To stop emails, contact reception.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <h1 className="font-display text-2xl text-[#172a25]">Stop campaign emails?</h1>
              <p className="text-sm leading-6 text-[#5f6b66]">
                You will no longer get check-up and follow-up invitations from CareBridge Clinic.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="also-reminders"
                checked={alsoReminders}
                onCheckedChange={(checked) => setAlsoReminders(checked === true)}
              />
              <Label htmlFor="also-reminders" className="text-sm font-normal leading-5">
                Also stop appointment reminder emails
              </Label>
            </div>
            <Button className="w-full" onClick={confirm} disabled={state === "saving"}>
              {state === "saving" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Unsubscribe
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
