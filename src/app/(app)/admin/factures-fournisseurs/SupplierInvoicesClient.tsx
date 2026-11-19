"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  UploadCloud,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Panel } from "@/components/ui-kit/Panel";
import { StatCard } from "@/components/ui-kit/StatCard";
import { formatEuro } from "@/lib/finance/format";
import {
  computeTotals,
  daysUntil,
  INVOICE_MAX_SIZE,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_STYLES,
  invoiceMimeType,
  invoiceStatus,
  remainingAmount,
  summarizeBySupplier,
  supplierKey,
  todayParis,
  type InvoiceStatus,
  type SupplierInvoice,
} from "@/lib/supplier-invoices";

type Supplier = { id: string; name: string };
type StatusFilter = "ouvertes" | "en_retard" | "payee" | "a_verifier" | "toutes";

type QueueItem = {
  id: string;
  name: string;
  state: "attente" | "lecture" | "ok" | "attention" | "doublon" | "erreur";
  message?: string;
};

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ouvertes", label: "À payer" },
  { value: "en_retard", label: "En retard" },
  { value: "a_verifier", label: "À vérifier" },
  { value: "payee", label: "Payées" },
  { value: "toutes", label: "Toutes" },
];

function formatDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${INVOICE_STATUS_STYLES[status]}`}>
      {INVOICE_STATUS_LABELS[status]}
    </span>
  );
}

function DueHint({ inv, today }: { inv: SupplierInvoice; today: string }) {
  if (!inv.due_date) return null;
  const status = invoiceStatus(inv, today);
  if (status === "payee") return null;
  const d = daysUntil(inv.due_date, today);
  if (d < 0) return <span className="text-xs font-medium text-red-600">retard {-d} j</span>;
  if (d === 0) return <span className="text-xs font-medium text-amber-600">aujourd&apos;hui</span>;
  if (d <= 7) return <span className="text-xs font-medium text-amber-600">dans {d} j</span>;
  return <span className="text-xs text-subtle">dans {d} j</span>;
}

export function SupplierInvoicesClient({
  initialInvoices,
  initialSuppliers,
  loadError,
}: {
  initialInvoices: SupplierInvoice[];
  initialSuppliers: Supplier[];
  loadError: string | null;
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ouvertes");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SupplierInvoice | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const processing = useRef(false);
  const pending = useRef<{ id: string; file: File }[]>([]);

  const today = todayParis();
  const supplierNames = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const totals = useMemo(() => computeTotals(invoices, today), [invoices, today]);
  const summaries = useMemo(() => summarizeBySupplier(invoices, supplierNames, today), [invoices, supplierNames, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      const status = invoiceStatus(inv, today);
      if (statusFilter === "ouvertes" && status === "payee") return false;
      if (statusFilter === "en_retard" && status !== "en_retard") return false;
      if (statusFilter === "payee" && status !== "payee") return false;
      if (statusFilter === "a_verifier" && !inv.needs_review) return false;
      if (supplierFilter && supplierKey(inv) !== supplierFilter) return false;
      if (q) {
        const name = (inv.supplier_id && supplierNames[inv.supplier_id]) || inv.supplier_name || "";
        const hay = `${name} ${inv.invoice_number ?? ""} ${inv.description ?? ""} ${inv.file_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, supplierFilter, search, today, supplierNames]);

  const filteredRemaining = filtered.reduce((sum, inv) => sum + remainingAmount(inv), 0);

  /* ── Dépôt et lecture automatique ─────────────────────────────────── */

  const updateQueue = (id: string, patch: Partial<QueueItem>) =>
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const processQueue = async () => {
    if (processing.current) return;
    processing.current = true;
    while (pending.current.length > 0) {
      const { id, file } = pending.current.shift()!;
      updateQueue(id, { state: "lecture" });
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/supplier-invoices", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          updateQueue(id, { state: "doublon", message: data.error });
          continue;
        }
        if (!res.ok) {
          updateQueue(id, { state: "erreur", message: data.error || "Erreur lors de l'envoi" });
          continue;
        }
        const inv = data.invoice as SupplierInvoice;
        setInvoices((list) => [inv, ...list]);
        if (data.supplier && !suppliers.some((s) => s.id === data.supplier.id)) {
          setSuppliers((list) =>
            list.some((s) => s.id === data.supplier.id) ? list : [...list, data.supplier].sort((a, b) => a.name.localeCompare(b.name, "fr"))
          );
        }
        const summary = `${inv.supplier_name ?? "Fournisseur ?"} · ${formatEuro(inv.amount_ttc)}${inv.due_date ? ` · échéance ${formatDate(inv.due_date)}` : ""}`;
        updateQueue(id, {
          state: data.warning ? "attention" : "ok",
          message: data.warning ? `${summary} — ${data.warning}` : summary,
        });
      } catch {
        updateQueue(id, { state: "erreur", message: "Connexion impossible" });
      }
    }
    processing.current = false;
  };

  const addFiles = (files: FileList | File[]) => {
    const items: QueueItem[] = [];
    for (const file of Array.from(files)) {
      const id = `${Date.now()}-${Math.random()}`;
      if (!invoiceMimeType(file.name, file.type)) {
        items.push({ id, name: file.name, state: "erreur", message: "Format non pris en charge (PDF, JPG, PNG, WebP)" });
      } else if (file.size > INVOICE_MAX_SIZE) {
        items.push({ id, name: file.name, state: "erreur", message: "Fichier trop lourd (15 Mo max)" });
      } else {
        items.push({ id, name: file.name, state: "attente" });
        pending.current.push({ id, file });
      }
    }
    setQueue((q) => [...items, ...q]);
    void processQueue();
  };

  /* ── Actions sur une facture ──────────────────────────────────────── */

  const patchInvoice = async (id: string, body: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch(`/api/admin/supplier-invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Enregistrement impossible");
      return false;
    }
    const inv = data.invoice as SupplierInvoice;
    setInvoices((list) => list.map((i) => (i.id === id ? inv : i)));
    if (inv.supplier_id && !supplierNames[inv.supplier_id] && inv.supplier_name) {
      setSuppliers((list) => [...list, { id: inv.supplier_id!, name: inv.supplier_name! }]);
    }
    return true;
  };

  const togglePaid = async (inv: SupplierInvoice) => {
    const paid = invoiceStatus(inv, today) === "payee";
    if (!paid && (inv.amount_ttc === null || Number(inv.amount_ttc) <= 0)) {
      toast.error("Renseignez d'abord le montant TTC de la facture.");
      setEditing(inv);
      return;
    }
    if (await patchInvoice(inv.id, paid ? { mark_unpaid: true } : { mark_paid: true })) {
      toast.success(paid ? "Facture remise à payer" : "Facture marquée comme payée");
    }
  };

  const deleteInvoice = async (inv: SupplierInvoice) => {
    if (!confirm(`Supprimer la facture ${inv.invoice_number ?? inv.file_name ?? ""} ? Le fichier sera aussi supprimé.`)) return;
    const res = await fetch(`/api/admin/supplier-invoices/${inv.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Suppression impossible");
      return;
    }
    setInvoices((list) => list.filter((i) => i.id !== inv.id));
    toast.success("Facture supprimée");
  };

  const busy = queue.some((q) => q.state === "attente" || q.state === "lecture");
  const selectedSupplierName = summaries.find((s) => s.key === supplierFilter)?.name;

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Impossible de charger les factures : {loadError}
        </p>
      )}

      {/* Zone de dépôt */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? "border-brand bg-brand-soft" : "border-line-strong bg-white hover:border-brand hover:bg-brand-soft/40"
        }`}
      >
        {busy ? <Loader2 className="h-8 w-8 animate-spin text-brand" /> : <UploadCloud className="h-8 w-8 text-brand" />}
        <p className="text-sm font-semibold text-ink">
          {busy ? "Lecture des factures en cours…" : "Glissez vos factures ici, ou cliquez pour les choisir"}
        </p>
        <p className="text-xs text-subtle">
          PDF ou photo (JPG, PNG, WebP) · plusieurs fichiers à la fois · fournisseur, n°, montants et échéance remplis automatiquement
        </p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {queue.length > 0 && (
        <Panel
          title="Dépôts récents"
          action={
            !busy ? (
              <Button variant="ghost" size="sm" onClick={() => setQueue([])}>
                <X className="h-4 w-4" /> Effacer
              </Button>
            ) : null
          }
          bodyClassName="px-5 pb-4 pt-2"
        >
          <ul className="divide-y divide-line">
            {queue.map((it) => (
              <li key={it.id} className="flex items-start gap-3 py-2 text-sm">
                <span className="mt-0.5 shrink-0">
                  {it.state === "attente" && <Loader2 className="h-4 w-4 text-faint" />}
                  {it.state === "lecture" && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
                  {it.state === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {(it.state === "attention" || it.state === "doublon") && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  {it.state === "erreur" && <XCircle className="h-4 w-4 text-red-600" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{it.name}</p>
                  <p className="text-xs text-subtle">
                    {it.state === "attente" && "En attente…"}
                    {it.state === "lecture" && "Lecture automatique de la facture…"}
                    {it.message}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Indicateurs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Reste à payer" value={formatEuro(totals.remaining)} icon={Wallet} tone="brand" hint={`${totals.openCount} facture(s) en cours`} />
        <StatCard label="En retard" value={formatEuro(totals.overdueAmount)} icon={AlertTriangle} tone="danger" hint={`${totals.overdueCount} facture(s) échue(s)`} />
        <StatCard label="Échéance sous 7 jours" value={formatEuro(totals.dueSoonAmount)} icon={CalendarClock} tone="warning" hint={`${totals.dueSoonCount} facture(s)`} />
        <StatCard label="À vérifier" value={totals.toReviewCount} icon={FileText} tone="amethyst" hint="Lecture incomplète : à contrôler" />
      </div>

      {/* Synthèse par fournisseur */}
      <Panel title="Par fournisseur" description="Cliquez sur un fournisseur pour voir ses factures." bodyClassName="px-0 pb-2 pt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs text-subtle">
              <th className="px-5 py-2 font-medium">Fournisseur</th>
              <th className="px-2 py-2 font-medium text-right">Factures</th>
              <th className="px-2 py-2 font-medium text-right">Total TTC</th>
              <th className="px-2 py-2 font-medium text-right">Payé</th>
              <th className="px-2 py-2 font-medium text-right">Reste à payer</th>
              <th className="px-2 py-2 font-medium text-right">Dont en retard</th>
              <th className="px-5 py-2 font-medium text-right">Prochaine échéance</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr
                key={s.key}
                onClick={() => setSupplierFilter((cur) => (cur === s.key ? "" : s.key))}
                className={`cursor-pointer border-t border-line transition-colors hover:bg-line-soft ${supplierFilter === s.key ? "bg-brand-soft" : ""}`}
              >
                <td className="px-5 py-2 font-medium text-ink">{s.name}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {s.invoiceCount}
                  {s.openCount > 0 && <span className="text-subtle"> ({s.openCount} en cours)</span>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{formatEuro(s.totalTtc)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{formatEuro(s.totalPaid)}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-ink">{formatEuro(s.remaining)}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${s.overdueAmount > 0 ? "font-medium text-red-600" : "text-faint"}`}>
                  {s.overdueAmount > 0 ? formatEuro(s.overdueAmount) : "—"}
                </td>
                <td className="px-5 py-2 text-right tabular-nums">{formatDate(s.nextDueDate)}</td>
              </tr>
            ))}
            {summaries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-4 text-subtle">
                  Aucune facture pour l&apos;instant. Glissez votre première facture dans la zone ci-dessus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      {/* Liste des factures */}
      <Panel
        title={selectedSupplierName ? `Factures — ${selectedSupplierName}` : "Factures"}
        description={`${filtered.length} facture(s) · reste à payer ${formatEuro(filteredRemaining)}`}
        bodyClassName="px-0 pb-2 pt-3"
      >
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === f.value ? "border-brand bg-brand text-white" : "border-line bg-white text-body hover:bg-line-soft"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="h-8 rounded-lg border border-line bg-white px-2 text-sm"
            aria-label="Filtrer par fournisseur"
          >
            <option value="">Tous les fournisseurs</option>
            {summaries.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N°, fournisseur, objet…" className="h-8 w-56 pl-8" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs text-subtle">
                <th className="px-5 py-2 font-medium">Fournisseur</th>
                <th className="px-2 py-2 font-medium">N° / objet</th>
                <th className="px-2 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Échéance</th>
                <th className="px-2 py-2 font-medium text-right">TTC</th>
                <th className="px-2 py-2 font-medium text-right">Reste</th>
                <th className="px-2 py-2 font-medium">Statut</th>
                <th className="px-5 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const status = invoiceStatus(inv, today);
                const name = (inv.supplier_id && supplierNames[inv.supplier_id]) || inv.supplier_name || "Fournisseur inconnu";
                return (
                  <tr key={inv.id} className="border-t border-line align-top hover:bg-line-soft/60">
                    <td className="px-5 py-2.5 font-medium text-ink">{name}</td>
                    <td className="px-2 py-2.5">
                      <div className="text-ink">{inv.invoice_number ?? <span className="text-faint">—</span>}</div>
                      {inv.description && <div className="max-w-[220px] truncate text-xs text-subtle">{inv.description}</div>}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">{formatDate(inv.invoice_date)}</td>
                    <td className="px-2 py-2.5 tabular-nums">
                      <div>{formatDate(inv.due_date)}</div>
                      <DueHint inv={inv} today={today} />
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatEuro(inv.amount_ttc)}</td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-ink">
                      {status === "payee" ? <span className="font-normal text-faint">—</span> : formatEuro(remainingAmount(inv))}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={status} />
                        {inv.needs_review && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                            À vérifier
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex justify-end gap-1">
                        {inv.storage_path && (
                          <a
                            href={`/api/admin/supplier-invoices/${inv.id}/file`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Voir la facture"
                            className="rounded-md p-1.5 text-subtle hover:bg-line-soft hover:text-ink"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        )}
                        <button type="button" title="Modifier" onClick={() => setEditing(inv)} className="rounded-md p-1.5 text-subtle hover:bg-line-soft hover:text-ink">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title={status === "payee" ? "Remettre à payer" : "Marquer comme payée"}
                          onClick={() => togglePaid(inv)}
                          className={`rounded-md p-1.5 hover:bg-line-soft ${status === "payee" ? "text-subtle hover:text-ink" : "text-emerald-600 hover:text-emerald-700"}`}
                        >
                          {status === "payee" ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button type="button" title="Supprimer" onClick={() => deleteInvoice(inv)} className="rounded-md p-1.5 text-subtle hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-4 text-subtle">
                    Aucune facture ne correspond à ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <EditInvoiceDialog
        invoice={editing}
        supplierName={editing ? (editing.supplier_id && supplierNames[editing.supplier_id]) || editing.supplier_name || "" : ""}
        suppliers={suppliers}
        onClose={() => setEditing(null)}
        onSave={async (body) => {
          if (!editing) return;
          if (await patchInvoice(editing.id, body)) {
            toast.success("Facture enregistrée");
            setEditing(null);
          }
        }}
      />
    </div>
  );
}

/* ── Fenêtre de modification ──────────────────────────────────────── */

function amountToInput(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v).replace(".", ",");
}

function EditInvoiceDialog({
  invoice,
  supplierName,
  suppliers,
  onClose,
  onSave,
}: {
  invoice: SupplierInvoice | null;
  supplierName: string;
  suppliers: Supplier[];
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <Dialog open={!!invoice} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        {invoice && <EditInvoiceForm key={invoice.id} invoice={invoice} supplierName={supplierName} suppliers={suppliers} onClose={onClose} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function EditInvoiceForm({
  invoice,
  supplierName,
  suppliers,
  onClose,
  onSave,
}: {
  invoice: SupplierInvoice;
  supplierName: string;
  suppliers: Supplier[];
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    supplier_name: supplierName,
    invoice_number: invoice.invoice_number ?? "",
    invoice_date: invoice.invoice_date ?? "",
    due_date: invoice.due_date ?? "",
    amount_ht: amountToInput(invoice.amount_ht),
    amount_tva: amountToInput(invoice.amount_tva),
    amount_ttc: amountToInput(invoice.amount_ttc),
    amount_paid: amountToInput(invoice.amount_paid),
    description: invoice.description ?? "",
    notes: invoice.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplier_name.trim()) {
      toast.error("Indiquez le fournisseur.");
      return;
    }
    setSaving(true);
    await onSave({ ...form, needs_review: false });
    setSaving(false);
  };

  const field = "space-y-1";
  const label = "text-xs font-medium text-subtle";

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Facture {invoice.invoice_number ?? ""}</DialogTitle>
        <DialogDescription>
          Vérifiez ou corrigez les informations lues sur la facture.
          {invoice.storage_path && (
            <>
              {" "}
              <a href={`/api/admin/supplier-invoices/${invoice.id}/file`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline">
                Ouvrir le document
              </a>
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={`${field} sm:col-span-2`}>
          <label className={label} htmlFor="inv-supplier">Fournisseur</label>
          <Input id="inv-supplier" list="inv-suppliers" value={form.supplier_name} onChange={set("supplier_name")} />
          <datalist id="inv-suppliers">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>
        <div className={field}>
          <label className={label} htmlFor="inv-number">N° de facture</label>
          <Input id="inv-number" value={form.invoice_number} onChange={set("invoice_number")} />
        </div>
        <div className={field}>
          <label className={label} htmlFor="inv-date">Date de facture</label>
          <Input id="inv-date" type="date" value={form.invoice_date} onChange={set("invoice_date")} />
        </div>
        <div className={field}>
          <label className={label} htmlFor="inv-due">Échéance</label>
          <Input id="inv-due" type="date" value={form.due_date} onChange={set("due_date")} />
        </div>
        <div className={field}>
          <label className={label} htmlFor="inv-ht">Montant HT (€)</label>
          <Input id="inv-ht" inputMode="decimal" value={form.amount_ht} onChange={set("amount_ht")} />
        </div>
        <div className={field}>
          <label className={label} htmlFor="inv-tva">TVA (€)</label>
          <Input id="inv-tva" inputMode="decimal" value={form.amount_tva} onChange={set("amount_tva")} />
        </div>
        <div className={field}>
          <label className={label} htmlFor="inv-ttc">Montant TTC (€)</label>
          <Input id="inv-ttc" inputMode="decimal" value={form.amount_ttc} onChange={set("amount_ttc")} />
        </div>
        <div className={field}>
          <label className={label} htmlFor="inv-paid">Déjà payé (€)</label>
          <Input id="inv-paid" inputMode="decimal" value={form.amount_paid} onChange={set("amount_paid")} />
        </div>
        <div className={`${field} sm:col-span-2`}>
          <label className={label} htmlFor="inv-desc">Objet</label>
          <Input id="inv-desc" value={form.description} onChange={set("description")} />
        </div>
        <div className={`${field} sm:col-span-2`}>
          <label className={label} htmlFor="inv-notes">Notes</label>
          <textarea
            id="inv-notes"
            value={form.notes}
            onChange={set("notes")}
            rows={2}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </DialogFooter>
    </form>
  );
}
