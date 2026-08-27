import { useState } from "react";
import { Car, MessageSquare, Pencil, Trash2 } from "lucide-react";
import {
  expenseTotal,
  gbp2,
  num,
  type ExpenseEntry,
  type ShiftLog,
  type Status,
} from "@/lib/mock-data";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/StatusPill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const flip = (s: Status): Status => (s === "Approved" ? "Pending" : "Approved");

/** Admin/CEO amendments for shift records and own-vehicle entries. */
export function ShiftAmendTable({ shifts }: { shifts: ShiftLog[] }) {
  const { updateShift, deleteShift } = useSession();
  const [editId, setEditId] = useState<string | null>(null);
  const [count, setCount] = useState("1");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="hidden sm:table-cell">Site</TableHead>
          <TableHead className="text-right">Shifts</TableHead>
          <TableHead className="text-right">Own vehicle</TableHead>
          <TableHead className="text-right">Status</TableHead>
          <TableHead className="text-right">Amend</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shifts.slice(0, 60).map((s) => (
          <TableRow key={s.id}>
            <TableCell className="whitespace-nowrap">{s.date}</TableCell>
            <TableCell className="hidden max-w-[12rem] truncate sm:table-cell">{s.site}</TableCell>
            <TableCell className="text-right">
              {editId === s.id ? (
                <Input
                  className="ml-auto h-8 w-16 text-right"
                  type="number"
                  min="1"
                  max="3"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              ) : (
                num(s.shiftCount)
              )}
            </TableCell>
            <TableCell className="text-right">
              <Button
                size="sm"
                variant={s.ownVehicle ? "default" : "outline"}
                className="h-8 gap-1.5"
                onClick={() => updateShift(s.id, { ownVehicle: !s.ownVehicle })}
              >
                <Car className="h-3.5 w-3.5" />
                {s.ownVehicle ? "Yes" : "No"}
              </Button>
            </TableCell>
            <TableCell className="text-right">
              <button type="button" onClick={() => updateShift(s.id, { status: flip(s.status) })}>
                <StatusPill status={s.status} />
              </button>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                {editId === s.id ? (
                  <>
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        const n = Math.min(Math.max(num(count, 1), 1), 3);
                        updateShift(s.id, { shiftCount: n });
                        setEditId(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    aria-label="Edit shift"
                    onClick={() => {
                      setEditId(s.id);
                      setCount(String(num(s.shiftCount, 1)));
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  aria-label="Delete shift"
                  onClick={() => deleteShift(s.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {shifts.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
              No shifts in this period.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

/** Admin/CEO amendments for claims / reimbursables. */
export function ClaimAmendTable({ expenses }: { expenses: ExpenseEntry[] }) {
  const { updateExpense } = useSession();
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ fuel: "", meals: "", creditCard: "" });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="hidden sm:table-cell">Site</TableHead>
          <TableHead className="text-right">Fuel</TableHead>
          <TableHead className="text-right">Meals</TableHead>
          <TableHead className="text-right">Card</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Status</TableHead>
          <TableHead className="text-right">Amend</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {expenses.slice(0, 60).map((e) => {
          const editing = editId === e.id;
          return (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap">{e.date}</TableCell>
              <TableCell className="hidden max-w-[12rem] truncate sm:table-cell">{e.site}</TableCell>
              {(["fuel", "meals", "creditCard"] as const).map((k) => (
                <TableCell key={k} className="text-right">
                  {editing ? (
                    <Input
                      className="ml-auto h-8 w-20 text-right"
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft[k]}
                      onChange={(ev) => setDraft((d) => ({ ...d, [k]: ev.target.value }))}
                    />
                  ) : (
                    gbp2(e[k])
                  )}
                </TableCell>
              ))}
              <TableCell className="text-right font-bold">{gbp2(expenseTotal(e))}</TableCell>
              <TableCell className="text-right">
                <button type="button" onClick={() => updateExpense(e.id, { status: flip(e.status) })}>
                  <StatusPill status={e.status} />
                </button>
              </TableCell>
              <TableCell className="text-right">
                {editing ? (
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        updateExpense(e.id, {
                          fuel: num(draft.fuel),
                          meals: num(draft.meals),
                          creditCard: num(draft.creditCard),
                        });
                        setEditId(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    aria-label="Edit claim"
                    onClick={() => {
                      setEditId(e.id);
                      setDraft({
                        fuel: String(num(e.fuel)),
                        meals: String(num(e.meals)),
                        creditCard: String(num(e.creditCard)),
                      });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
        {expenses.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
              No claims in this period.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

/** Renders query text with any http(s) links turned into clickable anchors. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-brand underline underline-offset-2 hover:text-brand-deep"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

/** Engineer-raised queries against shifts, for Admin/CEO review. */
export function QueryList({ shifts }: { shifts: ShiftLog[] }) {
  const queries = shifts.filter((s) => (s.comment ?? "").trim().length > 0);
  if (queries.length === 0) {
    return (
      <p className="px-4 pb-4 text-sm text-muted-foreground">No queries raised by this engineer.</p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {queries.map((s) => (
        <li key={s.id} className="space-y-1 p-4">
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <MessageSquare className="h-3.5 w-3.5 text-brand" /> {s.date}
            </span>
            <span className="truncate">{s.site}</span>
            {s.commentAt && <span>raised {new Date(s.commentAt).toLocaleString("en-GB")}</span>}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">{s.comment}</p>
        </li>
      ))}
    </ul>
  );
}
