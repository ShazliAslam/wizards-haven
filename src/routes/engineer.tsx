import { useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock,
  CreditCard,
  Download,
  Fuel,
  MapPin,
  ReceiptText,
  UploadCloud,
  Utensils,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/session";
import {
  SITES,
  daysAgo,
  expenseTotal,
  gbp,
  gbp2,
} from "@/lib/mock-data";
import { generateEngineerStatementPdf } from "@/lib/pdf";
import { AppHeader } from "@/components/AppHeader";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/engineer")({
  head: () => ({
    meta: [
      { title: "Engineer Dashboard — WeActive9 Shifts & Expenses" },
      {
        name: "description",
        content:
          "Log daily site shifts, submit fuel, meal and credit card expenses with receipt uploads, and track weekly hours and claims.",
      },
      { property: "og:title", content: "Engineer Dashboard — WeActive9" },
      {
        property: "og:description",
        content: "Log shifts and expenses from the field on any device.",
      },
    ],
  }),
  component: EngineerDashboard,
});

const today = () => new Date().toISOString().slice(0, 10);

function EngineerDashboard() {
  const { shifts, expenses, addShift, addExpense, role, engineer } = useSession();
  const router = useRouter();

  if (role === "admin") router.navigate({ to: "/admin" });

  const myShifts = useMemo(
    () => shifts.filter((s) => s.engineerId === engineer.id),
    [shifts, engineer.id],
  );
  const myExpenses = useMemo(
    () => expenses.filter((e) => e.engineerId === engineer.id),
    [expenses, engineer.id],
  );

  const weekHours = myShifts
    .filter((s) => daysAgo(s.date) < 7)
    .reduce((a, s) => a + s.hours, 0);
  const weekExpenses = myExpenses
    .filter((e) => daysAgo(e.date) < 7)
    .reduce((a, e) => a + expenseTotal(e), 0);
  const pending = myExpenses.filter((e) => e.status === "Pending").length;
  const monthPay =
    myShifts.filter((s) => daysAgo(s.date) < 28).reduce((a, s) => a + s.hours, 0) *
    engineer.hourlyRate;

  const chartData = useMemo(() => {
    const buckets: Record<string, { day: string; Fuel: number; Meals: number; Card: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = {
        day: d.toLocaleDateString("en-GB", { weekday: "short" }),
        Fuel: 0,
        Meals: 0,
        Card: 0,
      };
    }
    myExpenses.forEach((e) => {
      const b = buckets[e.date];
      if (!b) return;
      b.Fuel += e.fuel;
      b.Meals += e.meals;
      b.Card += e.creditCard;
    });
    return Object.values(buckets);
  }, [myExpenses]);

  // Shift form
  const [sDate, setSDate] = useState(today());
  const [sSite, setSSite] = useState(SITES[0]!);
  const [sType, setSType] = useState<"Day" | "Night">("Day");
  const [sHours, setSHours] = useState("8");

  // Expense form
  const [eDate, setEDate] = useState(today());
  const [eSite, setESite] = useState(SITES[0]!);
  const [fuel, setFuel] = useState("");
  const [meals, setMeals] = useState("");
  const [card, setCard] = useState("");
  const [receipt, setReceipt] = useState<string | undefined>(undefined);

  return (
    <div className="min-h-screen bg-background pb-16">
      <AppHeader variant="engineer" />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">
              Good day, {engineer.name.split(" ")[0]}
            </h1>
            <p className="text-sm text-muted-foreground">
              {engineer.region} region · {gbp2(engineer.hourlyRate)}/hr
            </p>
          </div>
          <Badge className="shrink-0 bg-emerald/15 text-emerald hover:bg-emerald/15">
            {pending} pending
          </Badge>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Clock} label="Hours this week" value={`${weekHours}h`} sub="Logged shifts" />
          <StatCard
            icon={Wallet}
            label="Claimed this week"
            value={gbp(weekExpenses)}
            sub="Fuel, meals & card"
            tone="emerald"
          />
          <StatCard
            icon={ReceiptText}
            label="Pending claims"
            value={String(pending)}
            sub="Awaiting approval"
            tone="warning"
          />
          <StatCard
            icon={CreditCard}
            label="Est. monthly pay"
            value={gbp(monthPay)}
            sub="Hours × base rate"
            tone="cyan"
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="surface-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <CalendarDays className="h-4 w-4 text-brand" /> Daily shift log
            </h2>
            <form
              className="mt-4 grid gap-4 sm:grid-cols-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                const hours = Number(sHours);
                if (!hours || hours <= 0 || hours > 24) {
                  toast.error("Enter valid hours between 1 and 24.");
                  return;
                }
                addShift({ date: sDate, site: sSite, shiftType: sType, hours });
                toast.success("Shift submitted for approval.");
                setSHours("8");
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="sdate">Date</Label>
                <Input id="sdate" type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Site location</Label>
                <Select value={sSite} onValueChange={setSSite}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SITES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Shift type</Label>
                <Select value={sType} onValueChange={(v) => setSType(v as "Day" | "Night")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Day">Day</SelectItem>
                    <SelectItem value="Night">Night (+15%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="shours">Total hours</Label>
                <Input
                  id="shours"
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                  value={sHours}
                  onChange={(e) => setSHours(e.target.value)}
                />
              </div>
              <Button type="submit" className="bg-brand text-white hover:bg-brand-deep sm:col-span-2">
                Submit shift
              </Button>
            </form>
          </section>

          <section className="surface-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <ReceiptText className="h-4 w-4 text-brand" /> Expense entry
            </h2>
            <form
              className="mt-4 grid gap-4 sm:grid-cols-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                const f = Number(fuel) || 0;
                const m = Number(meals) || 0;
                const c = Number(card) || 0;
                if (f + m + c <= 0) {
                  toast.error("Add at least one expense amount.");
                  return;
                }
                addExpense({
                  date: eDate,
                  site: eSite,
                  fuel: f,
                  meals: m,
                  creditCard: c,
                  receiptName: receipt,
                });
                toast.success("Expense claim submitted.");
                setFuel("");
                setMeals("");
                setCard("");
                setReceipt(undefined);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="edate">Date</Label>
                <Input id="edate" type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Site location</Label>
                <Select value={eSite} onValueChange={setESite}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SITES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fuel" className="gap-1.5">
                  <Fuel className="h-3.5 w-3.5 text-muted-foreground" /> Fuel / petrol (£)
                </Label>
                <Input id="fuel" type="number" min="0" step="0.01" placeholder="0.00" value={fuel} onChange={(e) => setFuel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meals" className="gap-1.5">
                  <Utensils className="h-3.5 w-3.5 text-muted-foreground" /> Meal allowance (£)
                </Label>
                <Input id="meals" type="number" min="0" step="0.01" placeholder="0.00" value={meals} onChange={(e) => setMeals(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="card" className="gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" /> Credit card spend (£)
                </Label>
                <Input id="card" type="number" min="0" step="0.01" placeholder="0.00" value={card} onChange={(e) => setCard(e.target.value)} />
              </div>

              <label
                htmlFor="receipt"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/50 p-6 text-center transition hover:border-emerald hover:bg-secondary sm:col-span-2"
              >
                <UploadCloud className="h-6 w-6 text-emerald" />
                <span className="text-sm font-semibold">
                  {receipt ?? "Drop receipt or tap to upload"}
                </span>
                <span className="text-xs text-muted-foreground">PDF, JPG or PNG up to 10MB</span>
                <input
                  id="receipt"
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={(e) => setReceipt(e.target.files?.[0]?.name)}
                />
              </label>

              <Button type="submit" className="bg-brand text-white hover:bg-brand-deep sm:col-span-2">
                Submit claim
              </Button>
            </form>
          </section>
        </div>

        <section className="surface-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Last 7 days spend
          </h2>
          <div className="mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -18, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => gbp2(v)}
                />
                <Bar dataKey="Fuel" stackId="a" fill="var(--color-brand)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Meals" stackId="a" fill="var(--color-emerald)" />
                <Bar dataKey="Card" stackId="a" fill="var(--color-cyan)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="surface-card overflow-hidden">
          <Tabs defaultValue="expenses">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border p-4">
              <TabsList className="w-fit">
                <TabsTrigger value="expenses">My claims</TabsTrigger>
                <TabsTrigger value="shifts">My shifts</TabsTrigger>
              </TabsList>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-2"
                onClick={async () => {
                  try {
                    await generateEngineerStatementPdf(engineer, myShifts, myExpenses);
                    toast.success("Receipt PDF downloaded", {
                      description: `${engineer.name} — 28 day expense & hours statement.`,
                    });
                  } catch {
                    toast.error("Could not generate the PDF. Please try again.");
                  }
                }}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Generate Receipt PDF</span>
              </Button>
            </div>

            <TabsContent value="expenses" className="m-0">
              <ul className="divide-y divide-border">
                {myExpenses.slice(0, 12).map((e) => (
                  <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{e.site}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {e.date}
                        </span>
                        <span>Fuel {gbp2(e.fuel)}</span>
                        <span>Meals {gbp2(e.meals)}</span>
                        {e.creditCard > 0 && <span>Card {gbp2(e.creditCard)}</span>}
                        {e.receiptName && (
                          <span className="inline-flex items-center gap-1 text-emerald">
                            <ReceiptText className="h-3 w-3" /> receipt
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold">{gbp2(expenseTotal(e))}</p>
                      <StatusPill status={e.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="shifts" className="m-0">
              <ul className="divide-y divide-border">
                {myShifts.slice(0, 12).map((s) => (
                  <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{s.site}</p>
                      <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> {s.date}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {s.shiftType} shift
                        </span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold">{s.hours}h</p>
                      <StatusPill status={s.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}

export function StatusPill({ status }: { status: "Pending" | "Approved" }) {
  return (
    <span
      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        status === "Approved"
          ? "bg-success/15 text-success"
          : "bg-warning/20 text-warning"
      }`}
    >
      {status}
    </span>
  );
}
