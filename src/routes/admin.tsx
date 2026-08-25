import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  CreditCard,
  Download,
  FileSpreadsheet,
  Fuel,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSession } from "@/lib/session";
import {
  SITES,
  daysAgo,
  expenseTotal,
  gbp,
  gbp2,
} from "@/lib/mock-data";
import { generatePayrollPdf } from "@/lib/pdf";
import { AppHeader } from "@/components/AppHeader";
import { StatCard } from "@/components/StatCard";
import { AddEngineerDialog } from "@/components/AddEngineerDialog";
import { EngineerDetailDialog } from "@/components/EngineerDetailDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusPill } from "./engineer";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — WeActive9 Expenses & Payroll" },
      {
        name: "description",
        content:
          "Company-wide KPIs, filterable expense claims across 30 field engineers, and an automated payroll calculator with PDF export.",
      },
      { property: "og:title", content: "Admin Console — WeActive9" },
      {
        property: "og:description",
        content: "Approve claims, track fuel and card spend, and run payroll in one place.",
      },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { shifts, expenses, engineers, findEngineer, setEngineerActive } = useSession();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [site, setSite] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const weekExpenses = expenses
    .filter((e) => daysAgo(e.date) < 7)
    .reduce((a, e) => a + expenseTotal(e), 0);
  const monthExpenses = expenses.reduce((a, e) => a + expenseTotal(e), 0);
  const activeToday = shifts.filter((s) => daysAgo(s.date) === 0).length;
  const fuelTotal = expenses.reduce((a, e) => a + e.fuel, 0);
  const cardTotal = expenses.reduce((a, e) => a + e.creditCard, 0);

  const rows = useMemo(() => {
    return expenses
      .filter((e) => {
        const eng = findEngineer(e.engineerId);
        if (q && !eng?.name.toLowerCase().includes(q.toLowerCase())) return false;
        if (site !== "all" && e.site !== site) return false;
        if (status !== "all" && e.status !== status) return false;
        if (from && e.date < from) return false;
        if (to && e.date > to) return false;
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [expenses, q, site, status, from, to]);

  const trend = useMemo(() => {
    const out: { day: string; Expenses: number; Hours: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({
        day: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        Expenses: Math.round(
          expenses.filter((e) => e.date === key).reduce((a, e) => a + expenseTotal(e), 0),
        ),
        Hours: shifts.filter((s) => s.date === key).reduce((a, s) => a + s.hours, 0),
      });
    }
    return out;
  }, [expenses, shifts]);

  const breakdown = [
    { name: "Fuel", value: Math.round(fuelTotal) },
    { name: "Meals", value: Math.round(expenses.reduce((a, e) => a + e.meals, 0)) },
    { name: "Credit card", value: Math.round(cardTotal) },
  ];
  const pieColors = ["var(--color-brand)", "var(--color-emerald)", "var(--color-cyan)"];

  const siteSpend = useMemo(
    () =>
      SITES.map((s) => ({
        site: s.split(" ")[0]!,
        Spend: Math.round(
          expenses.filter((e) => e.site === s).reduce((a, e) => a + expenseTotal(e), 0),
        ),
      })),
    [expenses],
  );

  const payroll = useMemo(
    () =>
      engineers.map((eng) => {
        const es = shifts.filter((s) => s.engineerId === eng.id && daysAgo(s.date) < 28);
        const dayHours = es.filter((s) => s.shiftType === "Day").reduce((a, s) => a + s.hours, 0);
        const nightHours = es.filter((s) => s.shiftType === "Night").reduce((a, s) => a + s.hours, 0);
        const base = dayHours * eng.hourlyRate + nightHours * eng.hourlyRate * 1.15;
        const reimb = expenses
          .filter((e) => e.engineerId === eng.id && e.status === "Approved")
          .reduce((a, e) => a + expenseTotal(e), 0);
        return { eng, dayHours, nightHours, base, reimb, gross: base + reimb };
      }),
    [engineers, shifts, expenses],
  );
  const payrollTotal = payroll.reduce((a, p) => a + p.gross, 0);

  return (
    <div className="min-h-screen bg-background pb-16">
      <AppHeader variant="admin" />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              Operations overview
            </h1>
            <p className="text-sm text-muted-foreground">
              Rolling 28 days across {engineers.length} field engineers.
            </p>
          </div>
          <AddEngineerDialog />
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Wallet} label="Weekly expenses" value={gbp(weekExpenses)} sub="Last 7 days, all crews" />
          <StatCard icon={FileSpreadsheet} label="Monthly expenses" value={gbp(monthExpenses)} sub="Rolling 28 days" tone="emerald" />
          <StatCard icon={Activity} label="Active shifts today" value={String(activeToday)} sub="Engineers on site" tone="cyan" />
          <StatCard icon={Fuel} label="Fuel spend" value={gbp(fuelTotal)} sub={`Card balances ${gbp(cardTotal)}`} tone="warning" />
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="surface-card p-5 lg:col-span-2">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Expense & hours trend
            </h2>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: -14, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} interval={2} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Expenses" stroke="var(--color-brand)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="Hours" stroke="var(--color-emerald)" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="surface-card p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Cost breakdown
            </h2>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={breakdown} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={3}>
                    {breakdown.map((_, i) => (
                      <Cell key={i} fill={pieColors[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => gbp(v)} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="surface-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Spend by site
          </h2>
          <div className="mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={siteSpend} margin={{ left: -16, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="site" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip formatter={(v: number) => gbp(v)} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 }} />
                <Bar dataKey="Spend" fill="var(--color-brand)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <Tabs defaultValue="claims" className="space-y-4">
          <TabsList>
            <TabsTrigger value="claims">Expense claims</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
          </TabsList>

          <TabsContent value="claims" className="m-0 space-y-4">
            <div className="surface-card p-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="space-y-1.5">
                  <Label className="text-xs">Engineer</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Site location</Label>
                  <Select value={site} onValueChange={setSite}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sites</SelectItem>
                      {SITES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {rows.length} claims · {gbp(rows.reduce((a, r) => a + expenseTotal(r), 0))} total
              </p>
            </div>

            <div className="surface-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Engineer</TableHead>
                    <TableHead className="hidden md:table-cell">Site</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="text-right">Fuel</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Meals</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Card</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 60).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          className="block max-w-[10rem] truncate text-left font-semibold text-brand underline-offset-4 hover:underline"
                          onClick={() => setSelectedId(r.engineerId)}
                        >
                          {findEngineer(r.engineerId)?.name}
                        </button>
                        <span className="block text-xs text-muted-foreground md:hidden">{r.site}</span>
                      </TableCell>
                      <TableCell className="hidden max-w-[12rem] truncate md:table-cell">{r.site}</TableCell>
                      <TableCell className="hidden whitespace-nowrap sm:table-cell">{r.date}</TableCell>
                      <TableCell className="text-right">{gbp2(r.fuel)}</TableCell>
                      <TableCell className="hidden text-right lg:table-cell">{gbp2(r.meals)}</TableCell>
                      <TableCell className="hidden text-right lg:table-cell">{gbp2(r.creditCard)}</TableCell>
                      <TableCell className="text-right font-bold">{gbp2(expenseTotal(r))}</TableCell>
                      <TableCell className="text-right"><StatusPill status={r.status} /></TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                        No claims match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="payroll" className="m-0 space-y-4">
            <div className="surface-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Payroll run · 28 days
                </p>
                <p className="mt-1 text-2xl font-extrabold tracking-tight">{gbp(payrollTotal)}</p>
                <p className="text-xs text-muted-foreground">
                  Base hours + night uplift (15%) + approved reimbursements
                </p>
              </div>
              <Button
                className="shrink-0 gap-2 bg-brand text-white hover:bg-brand-deep"
                onClick={async () => {
                  try {
                    await generatePayrollPdf(
                      payroll.map((p) => ({
                        name: p.eng.name,
                        region: p.eng.region,
                        rate: p.eng.hourlyRate,
                        dayHours: p.dayHours,
                        nightHours: p.nightHours,
                        base: p.base,
                        reimb: p.reimb,
                        gross: p.gross,
                      })),
                      "Last 28 days",
                    );
                    toast.success("Payroll PDF downloaded", {
                      description: `${engineers.length} engineers · ${gbp(payrollTotal)} gross`,
                    });
                  } catch {
                    toast.error("Could not generate the payroll PDF. Please try again.");
                  }
                }}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export Payroll PDF</span>
                <span className="sm:hidden">PDF</span>
              </Button>
            </div>

            <div className="surface-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Engineer</TableHead>
                    <TableHead className="hidden sm:table-cell">Rate</TableHead>
                    <TableHead className="text-right">Day h</TableHead>
                    <TableHead className="text-right">Night h</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Base pay</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Reimburse</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payroll.map((p) => (
                    <TableRow key={p.eng.id} className={p.eng.active ? "" : "opacity-60"}>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          className="block max-w-[10rem] truncate text-left font-semibold text-brand underline-offset-4 hover:underline"
                          onClick={() => setSelectedId(p.eng.id)}
                        >
                          {p.eng.name}
                        </button>
                        <span className="block text-xs text-muted-foreground">{p.eng.region}</span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{gbp2(p.eng.hourlyRate)}</TableCell>
                      <TableCell className="text-right">{p.dayHours}</TableCell>
                      <TableCell className="text-right">{p.nightHours}</TableCell>
                      <TableCell className="hidden text-right md:table-cell">{gbp(p.base)}</TableCell>
                      <TableCell className="hidden text-right md:table-cell">{gbp(p.reimb)}</TableCell>
                      <TableCell className="text-right font-bold">{gbp(p.gross)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            {p.eng.active ? "Active" : "Blocked"}
                          </span>
                          <Switch
                            checked={p.eng.active}
                            aria-label={`Toggle ${p.eng.name} active status`}
                            onCheckedChange={(v) => setEngineerActive(p.eng.id, v)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {engineers.length} engineers ·{" "}
          <CreditCard className="h-3.5 w-3.5" /> card balances {gbp(cardTotal)}
        </p>

        <EngineerDetailDialog
          engineer={(selectedId ? findEngineer(selectedId) : null) ?? null}
          onOpenChange={(o) => !o && setSelectedId(null)}
        />
      </main>
    </div>
  );
}
