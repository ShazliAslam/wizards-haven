import { useEffect, useState } from "react";
import { Banknote, RefreshCw } from "lucide-react";

import { gbp2, num, type Engineer } from "@/lib/mock-data";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Payout History — reads directly from the dedicated WeActive9_Payroll_Sync
 * sheet, matched to the engineer by email. Financial rows only; never mixed
 * into shift logs or the Sites Visited table.
 */
export function PayoutHistory({ engineer }: { engineer: Engineer }) {
  const { payoutsFor, syncPayouts } = useSession();
  const logs = payoutsFor(engineer.id);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void syncPayouts(engineer.id, { silent: true }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineer.id, engineer.email]);

  const total = logs.reduce((a, l) => a + num(l.amount), 0);

  return (
    <section className="surface-card overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
          <Banknote className="h-4 w-4" /> Payout history · {gbp2(total)} paid
        </p>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            await syncPayouts(engineer.id);
            setLoading(false);
          }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Sync payouts
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Paid amount</TableHead>
            <TableHead>Payment method</TableHead>
            <TableHead>Transaction ref</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((l, i) => (
            <TableRow key={`${l.date}-${l.reference}-${i}`}>
              <TableCell className="font-medium">{l.date || "—"}</TableCell>
              <TableCell className="text-right font-semibold">{gbp2(l.amount)}</TableCell>
              <TableCell>{l.method || "—"}</TableCell>
              <TableCell className="font-mono text-xs">{l.reference || "—"}</TableCell>
              <TableCell className="max-w-[16rem] truncate">{l.notes || "—"}</TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                {loading
                  ? "Reading WeActive9_Payroll_Sync…"
                  : `No payouts matched ${engineer.email} in WeActive9_Payroll_Sync yet.`}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}
