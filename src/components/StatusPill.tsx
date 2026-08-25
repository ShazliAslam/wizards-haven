export function StatusPill({ status }: { status: "Pending" | "Approved" }) {
  return (
    <span
      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        status === "Approved" ? "bg-success/15 text-success" : "bg-warning/20 text-warning"
      }`}
    >
      {status}
    </span>
  );
}
