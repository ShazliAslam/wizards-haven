import { useState } from "react";
import { Download, Eye, FileText, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/session";
import type { DocumentKind, Engineer } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KINDS: { kind: DocumentKind; label: string }[] = [
  { kind: "drivingLicense", label: "Driving licence" },
  { kind: "photoId", label: "Photo ID" },
  { kind: "resume", label: "Resume / CV" },
];

const MAX_BYTES = 4 * 1024 * 1024;

export function DocumentManager({ engineer }: { engineer: Engineer }) {
  const { setEngineerDocument } = useSession();
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);

  const upload = (kind: DocumentKind, file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("File too large", { description: "Keep documents under 4MB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEngineerDocument(engineer.id, kind, {
        name: file.name,
        url: String(reader.result),
        uploadedAt: new Date().toISOString(),
      });
      toast.success("Document uploaded");
    };
    reader.onerror = () => toast.error("Could not read that file");
    reader.readAsDataURL(file);
  };

  return (
    <section className="surface-card p-4">
      <p className="flex items-center gap-2 pb-3 text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
        <FileText className="h-4 w-4" /> Document manager
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {KINDS.map(({ kind, label }) => {
          const doc = engineer.documents?.[kind];
          return (
            <div key={kind} className="rounded-xl border border-border p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              {doc ? (
                <>
                  <p className="mt-1 truncate text-sm font-semibold" title={doc.name}>
                    {doc.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setPreview({ name: doc.name, url: doc.url })}
                    >
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" asChild>
                      <a href={doc.url} download={doc.name}>
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-destructive"
                      onClick={() => setEngineerDocument(engineer.id, kind, null)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <label
                  htmlFor={`doc-${kind}-${engineer.id}`}
                  className="mt-2 flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-border bg-secondary/50 p-4 text-center text-xs transition hover:border-emerald"
                >
                  <UploadCloud className="h-5 w-5 text-emerald" />
                  Upload file
                  <input
                    id={`doc-${kind}-${engineer.id}`}
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) upload(kind, file);
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview?.url.startsWith("data:image") ? (
            <img src={preview.url} alt={preview.name} className="max-h-[70vh] w-full rounded-lg object-contain" />
          ) : (
            <iframe title={preview?.name ?? "document"} src={preview?.url} className="h-[70vh] w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
