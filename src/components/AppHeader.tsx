import { Link, useRouter } from "@tanstack/react-router";
import { HardHat, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/session";
import { ENGINEERS } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AppHeader({ variant }: { variant: "engineer" | "admin" }) {
  const { signOut, engineer, engineerId, setEngineerId } = useSession();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 brand-gradient text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/12 ring-1 ring-white/20">
            {variant === "admin" ? (
              <ShieldCheck className="h-5 w-5 text-emerald" />
            ) : (
              <HardHat className="h-5 w-5 text-emerald" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-extrabold tracking-tight">
              WeActive9
            </span>
            <span className="block truncate text-[11px] font-medium uppercase tracking-[0.14em] text-white/60">
              {variant === "admin" ? "CEO / Admin console" : engineer.name}
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          {variant === "engineer" && (
            <Select
              value={engineerId}
              onValueChange={(id) => {
                setEngineerId(id);
                const next = ENGINEERS.find((e) => e.id === id);
                if (next) toast.success(`Switched to ${next.name}`);
              }}
            >
              <SelectTrigger className="h-9 w-[9.5rem] border-white/20 bg-white/10 text-xs text-white sm:w-[13rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {ENGINEERS.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-2 text-white/85 hover:bg-white/12 hover:text-white"
            onClick={() => {
              signOut();
              router.navigate({ to: "/" });
            }}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
