import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowRight, HardHat, ReceiptText, ShieldCheck, Timer, Wallet } from "lucide-react";
import { useSession } from "@/lib/session";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENT_ENGINEER, ENGINEERS } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WeActive9 Sign In — Field Ops & Payroll Platform" },
      {
        name: "description",
        content:
          "Sign in to WeActive9 to log shifts, submit fuel, meal and credit card expenses, and run payroll for field engineering crews.",
      },
      { property: "og:title", content: "WeActive9 Sign In — Field Ops & Payroll Platform" },
      {
        property: "og:description",
        content: "Shift logging, expense claims and payroll for 30+ field engineers.",
      },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const { signIn } = useSession();
  const router = useRouter();

  const [engineerId, setEngineerId] = useState(CURRENT_ENGINEER.id);
  const selected = ENGINEERS.find((e) => e.id === engineerId) ?? CURRENT_ENGINEER;

  const go = (role: "engineer" | "admin") => {
    signIn(role, engineerId);
    router.navigate({ to: role === "admin" ? "/admin" : "/engineer" });
  };

  return (
    <main className="min-h-screen brand-gradient">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-12 lg:grid-cols-2 lg:gap-16 lg:py-20">
        <div className="text-white">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ring-1 ring-white/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
            Field operations platform
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            WeActive9
            <span className="mt-2 block text-white/60">
              Shifts, expenses & payroll in one console.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70">
            Engineers log site hours and receipts from the field. Leadership approves claims and
            generates payroll across all {ENGINEERS.length} engineers.
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-4 sm:max-w-md">
            {[
              { icon: Timer, k: "Shift logging", v: "Day / night rates" },
              { icon: ReceiptText, k: "Receipts", v: "Upload & attach" },
              { icon: Wallet, k: "Expenses", v: "Fuel, meals, card" },
              { icon: ShieldCheck, k: "Approvals", v: "Pending → paid" },
            ].map((f) => (
              <div key={f.k} className="flex items-start gap-3">
                <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
                <div className="min-w-0">
                  <dt className="text-sm font-semibold">{f.k}</dt>
                  <dd className="text-xs text-white/55">{f.v}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <div className="surface-card p-6 sm:p-8">
          <h2 className="text-lg font-bold tracking-tight">Choose a demo login</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Role-based access. Engineers see only their own records.
          </p>

          <div className="mt-6 space-y-3">
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Engineer account
              </span>
              <Select value={engineerId} onValueChange={setEngineerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {ENGINEERS.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} · {e.region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <button
              onClick={() => go("engineer")}
              className="group flex w-full items-center gap-4 rounded-xl border border-border bg-secondary/60 p-4 text-left transition hover:border-emerald hover:bg-secondary"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand text-white">
                <HardHat className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Engineer Dashboard</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {selected.email}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-emerald" />
            </button>

            <button
              onClick={() => go("admin")}
              className="group flex w-full items-center gap-4 rounded-xl border border-border bg-secondary/60 p-4 text-left transition hover:border-emerald hover:bg-secondary"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand text-white">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">CEO / Admin Dashboard</span>
                <span className="block truncate text-xs text-muted-foreground">
                  ops.director@weactive9.com
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-emerald" />
            </button>
          </div>

          <Button
            className="mt-6 w-full bg-brand text-white hover:bg-brand-deep"
            onClick={() => go("engineer")}
          >
            Continue as engineer
          </Button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Demo environment — no password required.
          </p>
        </div>
      </div>
    </main>
  );
}
