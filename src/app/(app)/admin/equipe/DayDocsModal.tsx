"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, Loader2, Paperclip, Save, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compress-image";
import {
  EQUIPE_DOC_MAX_BYTES,
  EQUIPE_DOCS_BUCKET,
  teamName,
  type TeamDayDocs,
  type TeamId,
} from "@/lib/equipe";

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.error === "string" && body.error) || fallback;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function DayDocsModal({
  team,
  day,
  dayLabel,
  onClose,
  onChange,
}: {
  team: TeamId;
  day: string;
  dayLabel: string;
  onClose: () => void;
  /** Appelé après chaque modification, pour mettre à jour le badge de la grille. */
  onChange: (summary: { files: number; hasNote: boolean; note: string }) => void;
}) {
  const [docs, setDocs] = useState<TeamDayDocs | null>(null);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/equipe/day?team=${team}&day=${day}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, "Chargement impossible."));
        return (await res.json()) as TeamDayDocs;
      })
      .then((d) => {
        if (cancelled) return;
        setDocs(d);
        setNote(d.note);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Chargement impossible."));
    return () => {
      cancelled = true;
    };
  }, [team, day]);

  const apply = (d: TeamDayDocs, savedNote = note) => {
    setDocs(d);
    onChange({ files: d.files.length, hasNote: !!savedNote.trim(), note: savedNote });
  };

  async function saveNote() {
    setSavingNote(true);
    try {
      const res = await fetch("/api/admin/equipe/day", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, day, note }),
      });
      if (!res.ok) throw new Error(await readError(res, "Enregistrement impossible."));
      if (docs) apply({ ...docs, note }, note);
      toast.success("Note enregistrée.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSavingNote(false);
    }
  }

  async function upload(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => f.size > 0);
    if (!files.length) return;
    const supabase = createClient();
    let ok = 0;
    for (const original of files) {
      setUploading(original.name);
      try {
        const file = await compressImage(original);
        if (file.size > EQUIPE_DOC_MAX_BYTES) throw new Error(`« ${file.name} » dépasse 50 Mo.`);

        const res = await fetch("/api/admin/equipe/day/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team, day, name: file.name, size: file.size }),
        });
        if (!res.ok) throw new Error(await readError(res, "Envoi impossible."));
        const { path, token } = (await res.json()) as { path: string; token: string };

        const { error } = await supabase.storage
          .from(EQUIPE_DOCS_BUCKET)
          .uploadToSignedUrl(path, token, file, { contentType: file.type || "application/octet-stream" });
        if (error) throw new Error(`Envoi de « ${file.name} » impossible.`);

        const reg = await fetch("/api/admin/equipe/day/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team, day, path, name: file.name, type: file.type, size: file.size }),
        });
        if (!reg.ok) throw new Error(await readError(reg, "Enregistrement impossible."));
        apply((await reg.json()) as TeamDayDocs);
        ok++;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Envoi impossible.");
      }
    }
    setUploading(null);
    if (ok) toast.success(ok > 1 ? `${ok} documents ajoutés.` : "Document ajouté.");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function removeFile(id: string, name: string) {
    if (!window.confirm(`Supprimer « ${name} » ?`)) return;
    const res = await fetch(`/api/admin/equipe/day/files?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await readError(res, "Suppression impossible."));
      return;
    }
    apply((await res.json()) as TeamDayDocs, docs?.note ?? note);
    toast.success("Document supprimé.");
  }

  const noteDirty = docs !== null && note !== docs.note;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[16px] bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              Documents — Équipe {team} · {teamName(team)}
            </h2>
            <p className="text-sm text-subtle">{dayLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-subtle hover:bg-canvas">
            <X className="size-5" />
          </button>
        </div>

        {!docs ? (
          <div className="flex items-center justify-center py-12 text-subtle">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <label className="mb-1.5 block text-sm font-medium text-ink">Note du jour</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Écrivez ici les consignes du jour, le matériel à prévoir, les remarques du chantier…"
                className="min-h-[140px] w-full rounded-[9px] border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
              <div className="mt-2 flex justify-end">
                <Button type="button" size="sm" onClick={saveNote} disabled={savingNote || !noteDirty}>
                  {savingNote ? <Loader2 className="animate-spin" /> : <Save />}
                  Enregistrer la note
                </Button>
              </div>
            </section>

            <section>
              <div className="mb-1.5 text-sm font-medium text-ink">
                Fichiers joints <span className="font-normal text-subtle">(PDF à signer, photos du chantier…)</span>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => !uploading && inputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && !uploading && inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
                  dragOver ? "border-brand bg-brand/5" : "border-line hover:border-brand hover:bg-canvas"
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="size-5 animate-spin text-brand" />
                    <span className="text-body">Envoi de « {uploading} »…</span>
                  </>
                ) : (
                  <>
                    <Upload className="size-5 text-subtle" />
                    <span className="text-body">Glissez vos fichiers ici ou cliquez pour choisir</span>
                    <span className="text-xs text-subtle">PDF, photos ou tout autre document — 50 Mo max par fichier</span>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.odt,.txt"
                  className="hidden"
                  onChange={(e) => e.target.files && upload(e.target.files)}
                />
              </div>

              {docs.files.length > 0 ? (
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {docs.files.map((f) => {
                    const isImage = f.type.startsWith("image/");
                    return (
                      <li key={f.id} className="flex items-center gap-3 rounded-[10px] border border-line bg-white p-2">
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas"
                        >
                          {isImage && f.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.url} alt={f.name} className="size-full object-cover" />
                          ) : f.type === "application/pdf" ? (
                            <FileText className="size-6 text-red-500" />
                          ) : isImage ? (
                            <ImageIcon className="size-6 text-subtle" />
                          ) : (
                            <Paperclip className="size-6 text-subtle" />
                          )}
                        </a>
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink hover:text-brand">{f.name}</div>
                          <div className="text-xs text-subtle">{formatSize(f.size)}</div>
                        </a>
                        <button
                          type="button"
                          onClick={() => removeFile(f.id, f.name)}
                          className="rounded-lg p-1.5 text-subtle hover:bg-red-50 hover:text-red-600"
                          aria-label={`Supprimer ${f.name}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-subtle">Aucun fichier pour ce jour.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
