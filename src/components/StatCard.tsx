import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "brand",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "brand" | "emerald" | "cyan" | "warning";
}) {
  const toneMap: Record<string, string> = {
    brand: "bg-brand/10 text-brand",
    emerald: "bg-emerald/15 text-emerald",
    cyan: "bg-cyan/15 text-cyan",
    warning: "bg-warning/20 text-warning",
  };
  return (
    <div className="surface-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${toneMap[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
