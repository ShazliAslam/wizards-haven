import { useState } from "react";
import { CalendarDays, Car, ChevronDown, MapPin, MessageSquare } from "lucide-react";
import { gbp, gbp2, type ShiftLog } from "@/lib/mock-data";
import { groupByWeek } from "@/lib/payroll";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/StatusPill";

export function WeeklyShiftBlocks({
  shifts,
  shiftRate,
}: {
  shifts: ShiftLog[];
  shiftRate: number;
}) {
  const { commentOnShift } = useSession();
  const weeks = groupByWeek(shifts, shiftRate);
  const [openWeek, setOpenWeek] = useState<string | null>(weeks[0]?.key ?? null);
  const [queryFor, setQueryFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (weeks.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">No shifts logged yet.</p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {weeks.map((w) => {
        const open = openWeek === w.key;
        return (
          <li key={w.key}>
            <button
              type="button"
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 text-left transition hover:bg-secondary/60"
              onClick={() => setOpenWeek(open ? null : w.key)}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">Week of {w.label}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>{w.shiftCount} shifts</span>
                  <span className="inline-flex items-center gap-1">
                    <Car className="h-3 w-3" /> {w.ownVehicle} own-vehicle days
                  </span>
                  <span>{gbp(w.earnings)} gross</span>
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
              />
            </button>

            {open && (
              <ul className="divide-y divide-border border-t border-border bg-secondary/30">
                {w.shifts.map((s) => (
                  <li key={s.id} className="space-y-2 p-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{s.site}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" /> {s.date}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {s.shiftType} shift
                          </span>
                          {s.ownVehicle && (
                            <span className="inline-flex items-center gap-1 text-emerald">
                              <Car className="h-3 w-3" /> own vehicle
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold">
                          {s.shiftCount} × {gbp2(shiftRate)}
                        </p>
                        <StatusPill status={s.status} />
                      </div>
                    </div>

                    {s.comment && (
                      <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-foreground">
                        <span className="font-bold">Your query:</span> {s.comment}
                      </p>
                    )}

                    {queryFor === s.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={draft}
                          maxLength={400}
                          placeholder="Describe the issue with this shift…"
                          onChange={(e) => setDraft(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-brand text-white hover:bg-brand-deep"
                            onClick={() => {
                              if (draft.trim().length < 3) return;
                              commentOnShift(s.id, draft.trim());
                              setDraft("");
                              setQueryFor(null);
                            }}
                          >
                            Send query
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setQueryFor(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => {
                          setQueryFor(s.id);
                          setDraft(s.comment ?? "");
                        }}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {s.comment ? "Edit query" : "Add comment / query"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
