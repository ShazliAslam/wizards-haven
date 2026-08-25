import { useMemo, useState } from "react";
import { FileDown, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/session";
import { expenseTotal, gbp, gbp2 } from "@/lib/mock-data";
import { monthKey, monthLabel, totalShifts, weekKey, weekRangeLabel } from "@/lib/payroll";
import { generateInvoicePdf } from "@/lib/pdf";
import { Button } from "@/components/ui/button";
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

type Granularity = "Weekly" | "Monthly" | "Yearly";

const bucketOf = (date: string, g: Granularity) =>
  g === "Weekly" ? weekKey(date) : g === "Monthly" ? monthKey(date) : date.slice(0, 4);

const bucketLabel = (bucket: string, g: Granularity, sample: string) =>
  g === "Weekly" ? `Week ${bucket} · ${weekRangeLabel(sample)}` : g === "Monthly" ? monthLabel(bucket) : bucket;

export function InvoiceManager() {
  const { engineers, shifts, expenses } = useSession();
  const [granularity, setGranularity] = useState<Granularity>("Monthly");
  const [bucket, setBucket] = useState<string>("");

  const buckets = useMemo(() => {
    const map = new Map<string, string>();
    [...shifts, ...expenses].forEach((r) => {
      if (!r.date) return;
      const k = bucketOf(r.date, granularity);
      if (!map.has(k)) map.set(k, r.date);
    });
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [shifts, expenses, granularity]);

  const active = bucket && buckets.some(([k]) => k === bucket) ? bucket : buckets[0]?.[0] ?? "";
  const sampleDate = buckets.find(([k]) => k === active)?.[1] ?? "";

  const lines = useMemo(() => {
    return engineers
      .map((eng) => {
        const es = shifts.filter((s) => s.engineerId === eng.id && bucketOf(s.date, granularity) === active);
        const ex = expenses.filter(
          (e) =>
            e.engineerId === eng.id &&
            e.status === "Approved" &&
            bucketOf(e.date, granularity) === active,
        );
        const count = totalShifts(es);
        const gross = count * eng.shiftRate;
        const vat = gross * (eng.vatRate / 100);
        const reimb = ex.reduce((a, e) => a + expenseTotal(e), 0);
        return { label: eng.name, shifts: count, gross, vat, reimb, net: gross - vat + reimb };
      })
      .filter((l) => l.shifts > 0 || l.reimb > 0)
      .sort((a, b) => b.net - a.net);
  }, [engineers, shifts, expenses, granularity, active]);

  const sum = (k: "shifts" | "gross" | "vat" | "reimb" | "net") =>
    lines.reduce((a, l) => a + l[k], 0);

  return (
    <div className="space-y-4">
      <div className="surface-card grid gap-3 p-4 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">View</Label>
          <Select value={granularity} onValueChange={(v) => { setGranularity(v as Granularity); setBucket(""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Weekly">Weekly</SelectItem>
              <SelectItem value="Monthly">Monthly</SelectItem>
              <SelectItem value="Yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Period</Label>
          <Select value={active} onValueChange={setBucket}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              {buckets.map(([k, sample]) => (
                <SelectItem key={k} value={k}>{bucketLabel(k, granularity, sample)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="gap-2 bg-brand text-white hover:bg-brand-deep"
          disabled={lines.length === 0}
          onClick={async () => {
            try {
              await generateInvoicePdf({
                reference: `${granularity.slice(0, 1)}-${active}`,
                periodLabel: bucketLabel(active, granularity, sampleDate),
                granularity,
                lines,
              });
              toast.success("Invoice saved", { description: `${lines.length} engineers · ${gbp(sum("net"))} net` });
            } catch {
              toast.error("Could not generate the invoice PDF.");
            }
          }}
        >
          <FileDown className="h-4 w-4" /> Generate invoice
        </Button>
      </div>

      <div className="surface-card grid gap-3 p-4 sm:grid-cols-4">
        {[
          { label: "Shifts invoiced", value: String(sum("shifts")) },
          { label: "Gross value", value: gbp(sum("gross")) },
          { label: "VAT deducted", value: `− ${gbp(sum("vat"))}` },
          { label: "Net payable", value: gbp(sum("net")) },
        ].map((c) => (
          <div key={c.label}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {c.label}
            </p>
            <p className="mt-1 text-lg font-extrabold tracking-tight">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="surface-card overflow-x-auto">
        <p className="flex items-center gap-2 p-4 pb-2 text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
          <ReceiptText className="h-4 w-4" /> {bucketLabel(active, granularity, sampleDate) || "No data"}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Engineer</TableHead>
              <TableHead className="text-right">Shifts</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Reimbursables</TableHead>
              <TableHead className="text-right">Net payable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.label}>
                <TableCell className="font-medium">{l.label}</TableCell>
                <TableCell className="text-right">{l.shifts}</TableCell>
                <TableCell className="text-right">{gbp2(l.gross)}</TableCell>
                <TableCell className="text-right text-destructive">− {gbp2(l.vat)}</TableCell>
                <TableCell className="hidden text-right sm:table-cell">{gbp2(l.reimb)}</TableCell>
                <TableCell className="text-right font-bold">{gbp2(l.net)}</TableCell>
              </TableRow>
            ))}
            {lines.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Nothing to invoice for this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
