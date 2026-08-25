import { gbp2, type Engineer } from "@/lib/mock-data";
import type { PaymentSummary } from "@/lib/payroll";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  engineer: Engineer;
  summary: PaymentSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaymentBreakdownDialog({ engineer, summary, open, onOpenChange }: Props) {
  const rows: { label: string; value: string; tone?: "minus" | "total" }[] = [
    { label: `Shifts logged × ${gbp2(engineer.shiftRate)} rate`, value: `${summary.shiftCount} shifts` },
    { label: "Gross earned", value: gbp2(summary.grossEarned) },
    {
      label: `VAT deducted (${engineer.vatRate}%)`,
      value: `− ${gbp2(summary.vatDeducted)}`,
      tone: "minus",
    },
    { label: "Net shift earnings", value: gbp2(summary.netEarned) },
    { label: "Approved reimbursables", value: `+ ${gbp2(summary.reimbursables)}` },
    { label: "Total paid to date", value: `− ${gbp2(summary.paid)}`, tone: "minus" },
    { label: "Net to be paid", value: gbp2(summary.toBePaid), tone: "total" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Payment breakdown</DialogTitle>
          <DialogDescription>
            {engineer.name} · {summary.ownVehicleDays} own-vehicle days claimed
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <li
              key={r.label}
              className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${
                r.tone === "total" ? "bg-secondary font-extrabold" : ""
              }`}
            >
              <span className={r.tone === "total" ? "" : "text-muted-foreground"}>{r.label}</span>
              <span
                className={
                  r.tone === "minus"
                    ? "font-semibold text-destructive"
                    : r.tone === "total"
                      ? "text-lg text-emerald"
                      : "font-semibold"
                }
              >
                {r.value}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
