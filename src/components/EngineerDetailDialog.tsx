import { useEffect, useMemo, useState } from "react";
import { Download, MapPin, Pencil, RefreshCw, Receipt, Trash2 } from "lucide-react";

import { toast } from "sonner";
import {
  gbp,
  gbp2,
  expenseTotal,
  num,
  OWN_VEHICLE_WEEKLY_CAP,
  vatPortion,
  type Engineer,
  type ExpenseEntry,
  type ShiftLog,
} from "@/lib/mock-data";
import { generateEngineerStatementPdf } from "@/lib/pdf";
import { useSession } from "@/lib/session";
import { paymentSummary } from "@/lib/payroll";
import { ClaimAmendTable, QueryList, ShiftAmendTable } from "@/components/AmendPanels";
import { DocumentManager } from "@/components/DocumentManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

interface Props {
  engineer: Engineer | null;
  onOpenChange: (open: boolean) => void;
}

export function EngineerDetailDialog({ engineer, onOpenChange }: Props) {
  const { shifts, expenses, syncEngineerFromSheet, updateEngineer, deleteEngineer } = useSession();
  const [month, setMonth] = useState<string>("all");
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sheetDraft, setSheetDraft] = useState("");
  const [rateDraft, setRateDraft] = useState("");
  const [paidDraft, setPaidDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");

  useEffect(() => {
    setEditing(false);
    setSheetDraft(engineer?.sheetId ?? "");
    setRateDraft(engineer ? String(num(engineer.shiftRate)) : "");
    setPaidDraft(engineer ? String(num(engineer.paidAmount)) : "");
    setEmailDraft(engineer?.email ?? "");
  }, [engineer]);


  const allShifts = useMemo<ShiftLog[]>(
    () => (engineer ? shifts.filter((s) => s.engineerId === engineer.id) : []),
    [shifts, engineer],
  );
  const allExpenses = useMemo<ExpenseEntry[]>(
    () => (engineer ? expenses.filter((e) => e.engineerId === engineer.id) : []),
    [expenses, engineer],
  );

  const months = useMemo(() => {
    const set = new Set<string>();
    allShifts.forEach((s) => set.add(monthKey(s.date)));
    allExpenses.forEach((e) => set.add(monthKey(e.date)));
    return [...set].sort().reverse();
  }, [allShifts, allExpenses]);

  const periodShifts = month === "all" ? allShifts : allShifts.filter((s) => monthKey(s.date) === month);
  const periodExpenses =
    month === "all" ? allExpenses : allExpenses.filter((e) => monthKey(e.date) === month);

  const fuel = periodExpenses.reduce((a, e) => a + e.fuel, 0);
  const meals = periodExpenses.reduce((a, e) => a + e.meals, 0);
  const card = periodExpenses.reduce((a, e) => a + e.creditCard, 0);
  const gross = fuel + meals + card;
  const vat = vatPortion(gross);
  const dayShifts = periodShifts
    .filter((s) => s.shiftType === "Day")
    .reduce((a, s) => a + s.shiftCount, 0);
  const nightShifts = periodShifts
    .filter((s) => s.shiftType === "Night")
    .reduce((a, s) => a + s.shiftCount, 0);
  const summary = useMemo(
    () =>
      engineer
        ? paymentSummary(engineer, periodShifts, periodExpenses)
        : null,
    [engineer, periodShifts, periodExpenses],
  );

  const sites = useMemo(() => {
    const map = new Map<string, { shifts: number; visits: number; spend: number }>();
    periodShifts.forEach((s) => {
      const row = map.get(s.site) ?? { shifts: 0, visits: 0, spend: 0 };
      row.shifts += num(s.shiftCount);
      row.visits += 1;
      map.set(s.site, row);
    });
    periodExpenses.forEach((e) => {
      const row = map.get(e.site) ?? { shifts: 0, visits: 0, spend: 0 };
      row.spend += expenseTotal(e);
      map.set(e.site, row);
    });
    return [...map.entries()].sort((a, b) => b[1].shifts - a[1].shifts);
  }, [periodShifts, periodExpenses]);

  return (
    <Dialog open={!!engineer} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {engineer && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
                {engineer.name}
                <Badge variant={engineer.active ? "default" : "destructive"}>
                  {engineer.active ? "Active" : "Blocked"}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {engineer.region} region · {engineer.email} · {gbp2(engineer.shiftRate)}/shift
                {engineer.sheetId ? " · Google Sheet linked" : " · No sheet linked"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Monthly history</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All available data</SelectItem>
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  await syncEngineerFromSheet(engineer.id);
                  setSyncing(false);
                }}
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                Sync sheet
              </Button>
              <Button
                className="gap-2 bg-brand text-white hover:bg-brand-deep"
                onClick={async () => {
                  try {
                    await generateEngineerStatementPdf(engineer, periodShifts, periodExpenses);
                    toast.success("Statement PDF downloaded");
                  } catch {
                    toast.error("Could not generate the statement PDF.");
                  }
                }}
              >
                <Download className="h-4 w-4" /> Statement PDF
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setEditing((v) => !v)}>
                <Pencil className="h-4 w-4" /> Edit / Link Google Sheet
              </Button>
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm(`Remove ${engineer.name} and all their records?`)
                  )
                    return;
                  deleteEngineer(engineer.id);
                  onOpenChange(false);
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete engineer
              </Button>
            </div>

            {editing && (
              <section className="surface-card grid gap-4 p-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="edit-sheet">Google Sheet ID / URL</Label>
                  <Input
                    id="edit-sheet"
                    value={sheetDraft}
                    maxLength={300}
                    placeholder="1LuNs0Fze80u2gD1fAULv0At-3KF-qhPzHA-6BMb9DmY"
                    onChange={(e) => setSheetDraft(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the sheet ID or full URL, save, then hit Sync sheet to pull their records.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-email">Work email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={emailDraft}
                    maxLength={160}
                    onChange={(e) => setEmailDraft(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-rate">Shift rate (£)</Label>
                  <Input
                    id="edit-rate"
                    type="number"
                    min="1"
                    step="0.5"
                    value={rateDraft}
                    onChange={(e) => setRateDraft(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-paid">Paid amount (£)</Label>
                  <Input
                    id="edit-paid"
                    type="number"
                    min="0"
                    step="0.01"
                    value={paidDraft}
                    onChange={(e) => setPaidDraft(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button
                    className="bg-brand text-white hover:bg-brand-deep"
                    onClick={() => {
                      const rate = Number(rateDraft);
                      if (!Number.isFinite(rate) || rate <= 0) {
                        toast.error("Enter a valid shift rate");
                        return;
                      }
                      if (!emailDraft.trim().includes("@")) {
                        toast.error("Enter a valid work email");
                        return;
                      }
                      updateEngineer(engineer.id, {
                        sheetId: sheetDraft.trim(),
                        email: emailDraft.trim(),
                        shiftRate: rate,
                        paidAmount: Math.max(num(paidDraft), 0),
                      });
                      setEditing(false);
                    }}
                  >
                    Save changes
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </section>
            )}



            <section className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Fuel", value: gbp2(fuel) },
                { label: "Meals", value: gbp2(meals) },
                { label: "Credit card", value: gbp2(card) },
                { label: "VAT (20% incl.)", value: gbp2(vat) },
                { label: "Total reimbursable", value: gbp2(gross) },
                { label: "Approved reimbursables", value: gbp2(summary?.reimbursables) },
                { label: `VAT deducted (${num(engineer.vatRate)}%)`, value: gbp2(summary?.vatDeducted) },
                { label: "Paid amount", value: gbp2(summary?.paid) },
                { label: "To be paid", value: gbp2(summary?.toBePaid) },
                {
                  label: "Own vehicle days",
                  value: `${num(summary?.ownVehicleDays)}/${OWN_VEHICLE_WEEKLY_CAP} days`,
                },
              ].map((c) => (
                <div key={c.label} className="surface-card p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {c.label}
                  </p>
                  <p className="mt-1 text-lg font-extrabold tracking-tight">{c.value}</p>
                </div>
              ))}
            </section>

            <section className="surface-card overflow-x-auto">
              <p className="flex items-center gap-2 p-4 pb-2 text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
                <MapPin className="h-4 w-4" /> Sites visited · {dayShifts + nightShifts} shifts logged
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Shifts</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sites.map(([site, v]) => (
                    <TableRow key={site}>
                      <TableCell className="font-medium">{site}</TableCell>
                      <TableCell className="text-right">{v.visits}</TableCell>
                      <TableCell className="text-right">{v.shifts}</TableCell>
                      <TableCell className="text-right">{gbp2(v.spend)}</TableCell>
                    </TableRow>
                  ))}
                  {sites.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        No activity in this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </section>

            <section className="surface-card overflow-x-auto">
              <p className="flex items-center gap-2 p-4 pb-2 text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
                <Pencil className="h-4 w-4" /> Amend shifts & own vehicle · {periodShifts.length}
              </p>
              <ShiftAmendTable shifts={periodShifts} />
            </section>

            <DocumentManager engineer={engineer} />

            <section className="surface-card overflow-hidden">
              <p className="flex items-center gap-2 p-4 pb-2 text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
                <Receipt className="h-4 w-4" /> Engineer queries
              </p>
              <QueryList shifts={allShifts} />
            </section>

            <section className="surface-card overflow-x-auto">
              <p className="flex items-center gap-2 p-4 pb-2 text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
                <Receipt className="h-4 w-4" /> Claims · {periodExpenses.length}
              </p>
              <ClaimAmendTable expenses={periodExpenses} />
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
