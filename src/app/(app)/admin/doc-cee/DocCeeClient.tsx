"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  RotateCcw,
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
import type { UserRole } from "@/lib/types";
import { formatDateTimeParis } from "@/lib/date";
import {
  CEE_DOC_MAX_FILE_BYTES,
  CEE_MANDATAIRE_LABELS,
  CEE_MANDATAIRES,
  ceeDocStatus,
  type CeeDocStatus,
  type CeeDocRequestWithUrls,
  type CeeMandataire,
  type CeeTeleproOption,
} from "@/lib/doc-cee";

export type DocCeeMode = "staff" | "telepro";

type StatusFilter = "all" | CeeDocStatus;

const STATUS_STYLE: Record<CeeDocStatus, { card: string; hover: string; drop: string; badge: string; label: string }> = {
  incomplet: {
    card: "border-red-200 border-l-red-500",
    hover: "hover:bg-red-50/60",
    drop: "border-red-300 bg-red-50/40 hover:bg-red-50",
    badge: "bg-red-100 text-red-700",
    label: "Incomplet",
  },
  depose: {
    card: "border-orange-200 border-l-orange-500",
    hover: "hover:bg-orange-50/60",
    drop: "border-orange-300 bg-orange-50/40 hover:bg-orange-50",
    badge: "bg-orange-100 text-orange-700",
    label: "Document déposé",
  },
  complet: {
    card: "border-green-200 border-l-green-500",
    hover: "hover:bg-green-50/60",
    drop: "border-green-300 bg-green-50/40 hover:bg-green-50",
    badge: "bg-green-100 text-green-700",
    label: "Dossier complet",
  },
};

const STATUS_ORDER: Record<CeeDocStatus, number> = { incomplet: 0, depose: 1, complet: 2 };

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

function StatusBadge({ status }: { status: CeeDocStatus }) {
  const Icon = status === "complet" ? CheckCircle2 : status === "depose" ? Clock : CircleAlert;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status].badge}`}
    >
      <Icon className="h-3.5 w-3.5" /> {STATUS_STYLE[status].label}
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
        <label className={LABEL_CLS}>
          Télépro chargé de récupérer le document{" "}
          <span className="font-normal text-subtle">(facultatif — peut être ajouté plus tard par l&apos;admin)</span>
        </label>
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
  viewerRole,
  telepros,
  item,
  expanded,
  onToggle,
  onChange,
  onDeleted,
}: {
  mode: DocCeeMode;
  viewerRole: UserRole;
  telepros: CeeTeleproOption[];
  item: CeeDocRequestWithUrls;
  expanded: boolean;
  onToggle: () => void;
  onChange: (r: CeeDocRequestWithUrls) => void;
  onDeleted: (id: string) => void;
}) {
  const status = ceeDocStatus(item);
  const style = STATUS_STYLE[status];
  const [togglingComplete, setTogglingComplete] = useState(false);
  // Le secrétariat (et l'admin) ou le télépro assigné valident ; le responsable CEE peut rouvrir.
  const canMarkComplete = viewerRole === "admin" || viewerRole === "secretaire" || viewerRole === "telepro";
  const canReopen = viewerRole === "admin" || viewerRole === "secretaire" || viewerRole === "cee";

  const setComplete = async (complete: boolean) => {
    if (complete && !window.confirm("Marquer ce dossier comme complet ? Un email sera envoyé pour prévenir.")) return;
    if (!complete && !window.confirm("Rouvrir ce dossier (il ne sera plus marqué complet) ?")) return;
    setTogglingComplete(true);
    try {
      const res = await fetch(`/api/admin/doc-cee/${item.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Enregistrement impossible."));
        return;
      }
      const { mail, ...updated } = (await res.json()) as CeeDocRequestWithUrls & {
        mail: { sent: boolean; error?: string } | null;
      };
      onChange(updated);
      if (!complete) toast.success("Dossier rouvert");
      else if (mail?.sent) toast.success("Dossier complet — email envoyé");
      else if (mail) toast.warning("Dossier marqué complet, mais l'email n'a pas pu être envoyé.");
      else toast.success("Dossier complet");
    } finally {
      setTogglingComplete(false);
    }
  };
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
        style.card
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
          style.hover
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
        <StatusBadge status={status} />
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-subtle transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          {status === "complet" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-green-200 bg-green-50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-green-800">
                <CheckCircle2 className="h-4 w-4" />
                Dossier complet
                {item.completed_at ? ` le ${formatDateTimeParis(item.completed_at)}` : ""}
                {item.completed_by_name ? ` par ${item.completed_by_name}` : ""}
              </p>
              {canReopen && (
                <Button variant="outline" size="sm" onClick={() => setComplete(false)} disabled={togglingComplete}>
                  <RotateCcw />
                  Rouvrir
                </Button>
              )}
            </div>
          ) : (
            canMarkComplete && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-canvas/50 px-4 py-3">
                <p className="text-sm text-body">
                  Tous les documents sont réunis ? Validez le dossier : un email prévient automatiquement.
                </p>
                <Button
                  onClick={() => setComplete(true)}
                  disabled={togglingComplete}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  {togglingComplete ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  Marquer le dossier complet
                </Button>
              </div>
            )
          )}
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
                : style.drop
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
  viewerRole,
}: {
  initialItems: CeeDocRequestWithUrls[];
  telepros?: CeeTeleproOption[];
  mode?: DocCeeMode;
  viewerRole: UserRole;
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
      .filter((i) => status === "all" || ceeDocStatus(i) === status)
      .filter((i) => !q || `${i.client_name} ${i.document}`.toLowerCase().includes(q))
      // Rouges d'abord, puis orange, puis vertes.
      .sort((a, b) => STATUS_ORDER[ceeDocStatus(a)] - STATUS_ORDER[ceeDocStatus(b)]);
  }, [byMandataire, status, search]);

  const countOf = (list: CeeDocRequestWithUrls[], st: CeeDocStatus) => list.filter((i) => ceeDocStatus(i) === st).length;
  const incompleteCount = (list: CeeDocRequestWithUrls[]) => countOf(list, "incomplet");

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
          <span className="font-semibold text-red-600">{countOf(items, "incomplet")}</span> à fournir ·{" "}
          <span className="font-semibold text-orange-600">{countOf(items, "depose")}</span> à valider ·{" "}
          <span className="font-semibold text-green-600">{countOf(items, "complet")}</span> complet
          {countOf(items, "complet") > 1 ? "s" : ""}
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
              { key: "depose", label: "Documents déposés" },
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
                    : s.key === "depose"
                    ? "bg-orange-500 text-white"
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
              viewerRole={viewerRole}
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
