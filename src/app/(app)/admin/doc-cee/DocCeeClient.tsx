"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTimeParis } from "@/lib/date";
import {
  CEE_DOC_MAX_FILE_BYTES,
  CEE_MANDATAIRE_LABELS,
  CEE_MANDATAIRES,
  isCeeDocComplete,
  type CeeDocRequestWithUrls,
  type CeeMandataire,
  type CeeTeleproOption,
} from "@/lib/doc-cee";

export type DocCeeMode = "staff" | "telepro";

type StatusFilter = "all" | "incomplet" | "complet";

const INPUT_CLS =
  "w-full h-9 px-3 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors";
const TEXTAREA_CLS =
  "w-full min-h-[80px] px-3 py-2 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors";
const LABEL_CLS = "block text-sm font-medium text-ink mb-1.5";

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.error === "string" && body.error) || fallback;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function StatusBadge({ complete }: { complete: boolean }) {
  return complete ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
      <CheckCircle2 className="h-3.5 w-3.5" /> Complet
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
      <CircleAlert className="h-3.5 w-3.5" /> Incomplet
    </span>
  );
}

function TeleproSelect({
  telepros,
  value,
  onChange,
  disabled,
}: {
  telepros: CeeTeleproOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={INPUT_CLS}>
      <option value="">— Aucun télépro —</option>
      {telepros.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

function NewRequestForm({
  telepros,
  onCreated,
}: {
  telepros: CeeTeleproOption[];
  onCreated: (r: CeeDocRequestWithUrls) => void;
}) {
  const [mandataire, setMandataire] = useState<CeeMandataire>(CEE_MANDATAIRES[0]);
  const [clientName, setClientName] = useState("");
  const [docName, setDocName] = useState("");
  const [comment, setComment] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/doc-cee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mandataire,
          client_name: clientName,
          document: docName,
          request_comment: comment,
          assigned_to: assignedTo || null,
        }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Impossible de créer la demande."));
        return;
      }
      onCreated(await res.json());
      setClientName("");
      setDocName("");
      setComment("");
      setAssignedTo("");
      toast.success(
        assignedTo ? "Demande envoyée au secrétariat et au télépro assigné" : "Demande de document envoyée au secrétariat"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-[14px] border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">Nouvelle demande de document</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLS}>Mandataire</label>
          <select
            value={mandataire}
            onChange={(e) => setMandataire(e.target.value as CeeMandataire)}
            className={INPUT_CLS}
          >
            {CEE_MANDATAIRES.map((m) => (
              <option key={m} value={m}>
                {CEE_MANDATAIRE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Client / dossier</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            required
            placeholder="Ex. M. Dupont – Lyon"
            className={INPUT_CLS}
          />
        </div>
      </div>
      <div>
        <label className={LABEL_CLS}>Document demandé</label>
        <input
          value={docName}
          onChange={(e) => setDocName(e.target.value)}
          required
          placeholder="Ex. Avis d'imposition 2025, facture signée, photo de la PAC…"
          className={INPUT_CLS}
        />
      </div>
      <div>
        <label className={LABEL_CLS}>Télépro chargé de récupérer le document (optionnel)</label>
        <TeleproSelect telepros={telepros} value={assignedTo} onChange={setAssignedTo} />
      </div>
      <div>
        <label className={LABEL_CLS}>Commentaire (responsable CEE)</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Précisions pour le secrétariat…"
          className={TEXTAREA_CLS}
        />
      </div>
      <Button type="submit" disabled={saving} size="lg">
        {saving ? <Loader2 className="animate-spin" /> : <Plus />}
        Envoyer la demande
      </Button>
    </form>
  );
}

function RequestCard({
  mode,
  telepros,
  item,
  expanded,
  onToggle,
  onChange,
  onDeleted,
}: {
  mode: DocCeeMode;
  telepros: CeeTeleproOption[];
  item: CeeDocRequestWithUrls;
  expanded: boolean;
  onToggle: () => void;
  onChange: (r: CeeDocRequestWithUrls) => void;
  onDeleted: (id: string) => void;
}) {
  const complete = isCeeDocComplete(item);
  const [requestComment, setRequestComment] = useState(item.request_comment ?? "");
  const [responseComment, setResponseComment] = useState(item.response_comment ?? "");
  const [teleproComment, setTeleproComment] = useState(item.telepro_comment ?? "");
  const [savingComments, setSavingComments] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const isTelepro = mode === "telepro";
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commentsDirty =
    requestComment.trim() !== (item.request_comment ?? "") ||
    responseComment.trim() !== (item.response_comment ?? "") ||
    teleproComment.trim() !== (item.telepro_comment ?? "");

  const assign = async (teleproId: string) => {
    setAssigning(true);
    try {
      const res = await fetch(`/api/admin/doc-cee/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: teleproId || null }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Assignation impossible."));
        return;
      }
      onChange(await res.json());
      toast.success(teleproId ? "Télépro assigné" : "Assignation retirée");
    } finally {
      setAssigning(false);
    }
  };

  const saveComments = async () => {
    setSavingComments(true);
    try {
      const res = await fetch(`/api/admin/doc-cee/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isTelepro
            ? { telepro_comment: teleproComment }
            : { request_comment: requestComment, response_comment: responseComment, telepro_comment: teleproComment }
        ),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Enregistrement impossible."));
        return;
      }
      const updated = (await res.json()) as CeeDocRequestWithUrls;
      onChange(updated);
      setRequestComment(updated.request_comment ?? "");
      setResponseComment(updated.response_comment ?? "");
      setTeleproComment(updated.telepro_comment ?? "");
      toast.success("Commentaires enregistrés");
    } finally {
      setSavingComments(false);
    }
  };

  const upload = async (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => f.size > 0);
    if (!files.length) return;
    if (files.some((f) => f.size > CEE_DOC_MAX_FILE_BYTES)) {
      toast.error("Un fichier dépasse 25 Mo.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch(`/api/admin/doc-cee/${item.id}/files`, { method: "POST", body: fd });
      if (!res.ok) {
        toast.error(await readError(res, "Échec de l'envoi."));
        return;
      }
      onChange(await res.json());
      toast.success(files.length > 1 ? `${files.length} documents déposés` : "Document déposé");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeFile = async (path: string, name: string) => {
    if (!window.confirm(`Retirer « ${name} » ?`)) return;
    const res = await fetch(`/api/admin/doc-cee/${item.id}/files?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error(await readError(res, "Suppression impossible."));
      return;
    }
    onChange(await res.json());
  };

  const removeRequest = async () => {
    if (!window.confirm("Supprimer cette demande et ses documents ?")) return;
    const res = await fetch(`/api/admin/doc-cee/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await readError(res, "Suppression impossible."));
      return;
    }
    onDeleted(item.id);
    toast.success("Demande supprimée");
  };

  return (
    <div
      className={`overflow-hidden rounded-[14px] border border-l-4 bg-white shadow-sm ${
        complete ? "border-green-200 border-l-green-500" : "border-red-200 border-l-red-500"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
          complete ? "hover:bg-green-50/60" : "hover:bg-red-50/60"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-ink px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
              {CEE_MANDATAIRE_LABELS[item.mandataire]}
            </span>
            <span className="font-semibold text-ink">{item.client_name}</span>
            {item.assigned_to_name && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                <UserRound className="h-3 w-3" />
                {item.assigned_to_name}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-body">{item.document}</p>
          <p className="mt-1 text-xs text-subtle">
            Demandé le {formatDateTimeParis(item.created_at)}
            {item.created_by_name ? ` par ${item.created_by_name}` : ""}
            {item.files.length > 0 && (
              <>
                {" · "}
                <Paperclip className="inline h-3 w-3" /> {item.files.length} document{item.files.length > 1 ? "s" : ""}
              </>
            )}
          </p>
        </div>
        <StatusBadge complete={complete} />
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-subtle transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          {!isTelepro && (
            <div className="max-w-sm">
              <label className={LABEL_CLS}>Télépro chargé de récupérer le document</label>
              <TeleproSelect
                telepros={telepros}
                value={item.assigned_to ?? ""}
                onChange={assign}
                disabled={assigning}
              />
            </div>
          )}
          <div
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
            onClick={() => !uploading && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragOver
                ? "border-brand bg-brand/5"
                : complete
                ? "border-green-300 bg-green-50/40 hover:bg-green-50"
                : "border-red-300 bg-red-50/40 hover:bg-red-50"
            }`}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-subtle" />
            ) : (
              <Upload className="h-6 w-6 text-subtle" />
            )}
            <p className="text-sm font-medium text-ink">
              {uploading ? "Envoi en cours…" : "Glissez le document ici ou cliquez pour choisir"}
            </p>
            <p className="text-xs text-subtle">PDF, images ou tout autre fichier — 25 Mo max par fichier</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && upload(e.target.files)}
            />
          </div>

          {item.files.length > 0 && (
            <ul className="space-y-1.5">
              {item.files.map((f) => (
                <li
                  key={f.path}
                  className="flex items-center gap-2 rounded-[10px] border border-line bg-canvas/50 px-3 py-2 text-sm"
                >
                  {f.type.startsWith("image/") ? (
                    <ImageIcon className="h-4 w-4 shrink-0 text-subtle" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-subtle" />
                  )}
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate font-medium text-brand hover:underline"
                  >
                    {f.name}
                  </a>
                  <span className="shrink-0 text-xs text-subtle">
                    {formatSize(f.size)} · {formatDateTimeParis(f.uploaded_at)}
                  </span>
                  {!isTelepro && (
                  <button
                    type="button"
                    onClick={() => removeFile(f.path, f.name)}
                    className="shrink-0 rounded p-1 text-subtle hover:bg-red-50 hover:text-red-600"
                    aria-label={`Retirer ${f.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className={LABEL_CLS}>Commentaire du responsable CEE</label>
              <textarea
                readOnly={isTelepro}
                value={requestComment}
                onChange={(e) => setRequestComment(e.target.value)}
                placeholder="Précisions sur le document attendu…"
                className={TEXTAREA_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Commentaire du secrétariat</label>
              <textarea
                readOnly={isTelepro}
                value={responseComment}
                onChange={(e) => setResponseComment(e.target.value)}
                placeholder="Réponse, document manquant, relance client…"
                className={TEXTAREA_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Commentaire du télépro</label>
              <textarea
                value={teleproComment}
                onChange={(e) => setTeleproComment(e.target.value)}
                placeholder="Client rappelé, document promis pour…"
                className={TEXTAREA_CLS}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button onClick={saveComments} disabled={!commentsDirty || savingComments}>
              {savingComments && <Loader2 className="animate-spin" />}
              Enregistrer les commentaires
            </Button>
            {!isTelepro && (
              <Button variant="destructive" onClick={removeRequest}>
                <Trash2 />
                Supprimer la demande
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DocCeeClient({
  initialItems,
  telepros = [],
  mode = "staff",
}: {
  initialItems: CeeDocRequestWithUrls[];
  telepros?: CeeTeleproOption[];
  mode?: DocCeeMode;
}) {
  const [items, setItems] = useState(initialItems);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mandataire, setMandataire] = useState<CeeMandataire | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [telepro, setTelepro] = useState<string>("all");

  const byMandataire = useMemo(
    () =>
      items
        .filter((i) => mandataire === "all" || i.mandataire === mandataire)
        .filter((i) => telepro === "all" || (telepro === "none" ? !i.assigned_to : i.assigned_to === telepro)),
    [items, mandataire, telepro]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return byMandataire
      .filter((i) => (status === "all" ? true : (status === "complet") === isCeeDocComplete(i)))
      .filter((i) => !q || `${i.client_name} ${i.document}`.toLowerCase().includes(q))
      // Les demandes incomplètes (rouges) d'abord.
      .sort((a, b) => Number(isCeeDocComplete(a)) - Number(isCeeDocComplete(b)));
  }, [byMandataire, status, search]);

  const incompleteCount = (list: CeeDocRequestWithUrls[]) => list.filter((i) => !isCeeDocComplete(i)).length;

  const replaceItem = (updated: CeeDocRequestWithUrls) =>
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {mode === "staff" && (
          <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "default"} size="lg">
            {showForm ? <X /> : <Plus />}
            {showForm ? "Fermer le formulaire" : "Nouvelle demande"}
          </Button>
        )}
        <span className="text-sm text-subtle">
          <span className="font-semibold text-red-600">{incompleteCount(items)}</span> à fournir ·{" "}
          <span className="font-semibold text-green-600">{items.length - incompleteCount(items)}</span> complet
          {items.length - incompleteCount(items) > 1 ? "s" : ""}
        </span>
      </div>

      {showForm && mode === "staff" && (
        <NewRequestForm
          telepros={telepros}
          onCreated={(r) => {
            setItems((prev) => [r, ...prev]);
            setShowForm(false);
            setExpandedId(r.id);
          }}
        />
      )}

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...CEE_MANDATAIRES] as const).map((m) => {
          const list = m === "all" ? items : items.filter((i) => i.mandataire === m);
          const missing = incompleteCount(list);
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMandataire(m)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                mandataire === m ? "border-brand bg-brand text-white" : "border-line bg-white text-body hover:bg-canvas"
              }`}
            >
              {m === "all" ? "Tous les mandataires" : CEE_MANDATAIRE_LABELS[m]}
              <span className="tabular-nums opacity-80">{list.length}</span>
              {missing > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white tabular-nums">
                  {missing}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex rounded-[10px] border border-line bg-white p-1 shadow-sm">
          {(
            [
              { key: "all", label: "Toutes" },
              { key: "incomplet", label: "Incomplètes" },
              { key: "complet", label: "Complètes" },
            ] as { key: StatusFilter; label: string }[]
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={status === s.key}
              onClick={() => setStatus(s.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                status === s.key
                  ? s.key === "incomplet"
                    ? "bg-red-600 text-white"
                    : s.key === "complet"
                    ? "bg-green-600 text-white"
                    : "bg-ink text-white"
                  : "text-body hover:bg-canvas"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un client ou un document…"
          className={`${INPUT_CLS} max-w-xs`}
        />
        {mode === "staff" && (
          <select value={telepro} onChange={(e) => setTelepro(e.target.value)} className={`${INPUT_CLS} max-w-[220px]`}>
            <option value="all">Tous les télépros</option>
            <option value="none">Non assignées</option>
            {telepros.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-2">
        {visible.length === 0 ? (
          <p className="rounded-[14px] border border-dashed border-line-strong bg-white p-8 text-center text-sm text-subtle">
            {items.length === 0
              ? mode === "telepro"
                ? "Aucun document à récupérer pour le moment."
                : "Aucune demande de document pour le moment."
              : "Aucune demande ne correspond aux filtres."}
          </p>
        ) : (
          visible.map((item) => (
            <RequestCard
              key={item.id}
              mode={mode}
              telepros={telepros}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((id) => (id === item.id ? null : item.id))}
              onChange={replaceItem}
              onDeleted={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
            />
          ))
        )}
      </div>
    </div>
  );
}
