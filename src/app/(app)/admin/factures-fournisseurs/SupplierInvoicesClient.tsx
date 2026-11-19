"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UploadCloud,
  UserRound,
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
  clientKey,
  computeTotals,
  daysUntil,
  INVOICE_MAX_SIZE,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_STYLES,
  invoiceMimeType,
  invoiceStatus,
  leadDisplayName,
  remainingAmount,
  summarizeByClient,
  summarizeBySupplier,
  suspectedDuplicates,
  supplierKey,
  todayParis,
  type InvoiceStatus,
  type SupplierInvoice,
  type SupplierInvoiceLine,
} from "@/lib/supplier-invoices";

type Supplier = { id: string; name: string };
type StatusFilter = "ouvertes" | "en_retard" | "payee" | "a_verifier" | "a_associer" | "toutes";

type QueueItem = {
  id: string;
  name: string;
  state: "attente" | "lecture" | "ok" | "attention" | "doublon" | "erreur";
  message?: string;
};

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ouvertes", label: "À payer" },
  { value: "en_retard", label: "En retard" },
  { value: "a_associer", label: "Client à associer" },
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

function ClientCell({ inv, onLink }: { inv: SupplierInvoice; onLink: () => void }) {
  if (inv.lead_id && inv.lead) {
    return (
      <div>
        <Link href={`/admin/leads/${inv.lead_id}`} className="font-medium text-ink hover:text-brand hover:underline">
          {leadDisplayName(inv.lead)}
        </Link>
        <div className="text-xs text-subtle">
          {[inv.lead.postal_code, inv.lead.city].filter(Boolean).join(" ")}
          {inv.lead_match === "auto" && <span title={`Reconnu d'après « ${inv.client_reference ?? ""} »`}> · auto</span>}
        </div>
      </div>
    );
  }
  if (inv.lead_match === "a_associer") {
    return (
      <button
        type="button"
        onClick={onLink}
        className="inline-flex max-w-[200px] items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-left text-xs font-medium text-violet-700 hover:bg-violet-100"
        title="Choisir le lead correspondant"
      >
        <Link2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{inv.client_reference || inv.client_name} · associer</span>
      </button>
    );
  }
  return <span className="text-xs text-faint">Stock</span>;
}

type LeadResult = { id: string; first_name: string | null; last_name: string | null; city: string | null; postal_code: string | null; status: string | null };

/** Choix du client (lead) d'une facture : recherche par nom, ou « stock ». */
function LeadPicker({
  invoice,
  value,
  onChange,
}: {
  invoice: SupplierInvoice;
  value: { id: string | null; label: string | null };
  onChange: (v: { id: string | null; label: string | null }) => void;
}) {
  const [q, setQ] = useState(invoice.lead_id ? "" : invoice.client_name ?? "");
  const [results, setResults] = useState<LeadResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = await res.json();
        setResults(data.leads ?? []);
      } catch {
        /* recherche annulée */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-sm">
          {value.id ? (
            <span className="font-medium text-ink">{value.label}</span>
          ) : (
            <span className="text-subtle">Aucun client (stock)</span>
          )}
          {invoice.client_reference && (
            <div className="truncate text-xs text-subtle">Sur la facture : « {invoice.client_reference} »</div>
          )}
        </div>
        {(value.id || invoice.lead_match === "a_associer") && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ id: null, label: null })}>
            {value.id ? "Retirer" : "Pas de client (stock)"}
          </Button>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un lead (nom, ville, téléphone)…" className="pl-8" />
      </div>
      {(loading || results.length > 0) && (
        <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-md border border-line">
          {loading && results.length === 0 && <li className="px-3 py-2 text-xs text-subtle">Recherche…</li>}
          {results.map((l) => {
            const label = leadDisplayName(l);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ id: l.id, label });
                    setQ("");
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-line-soft ${value.id === l.id ? "bg-brand-soft" : ""}`}
                >
                  <span className="font-medium text-ink">{label}</span>
                  <span className="text-xs text-subtle">{[l.postal_code, l.city].filter(Boolean).join(" ")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
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
  const [clientFilter, setClientFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [linesCache, setLinesCache] = useState<Record<string, SupplierInvoiceLine[] | "loading" | "error">>({});
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SupplierInvoice | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const processing = useRef(false);
  const pending = useRef<{ id: string; file: File }[]>([]);

  const today = todayParis();
  const supplierNames = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const scoped = useMemo(
    () => (supplierFilter ? invoices.filter((inv) => supplierKey(inv) === supplierFilter) : invoices),
    [invoices, supplierFilter]
  );
  const totals = useMemo(() => computeTotals(scoped, today), [scoped, today]);
  const summaries = useMemo(() => summarizeBySupplier(invoices, supplierNames, today), [invoices, supplierNames, today]);
  const clientSummaries = useMemo(() => summarizeByClient(scoped, supplierNames, today), [scoped, supplierNames, today]);
  const duplicates = useMemo(() => suspectedDuplicates(invoices), [invoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      const status = invoiceStatus(inv, today);
      if (statusFilter === "ouvertes" && status === "payee") return false;
      if (statusFilter === "en_retard" && status !== "en_retard") return false;
      if (statusFilter === "payee" && status !== "payee") return false;
      if (statusFilter === "a_verifier" && !inv.needs_review) return false;
      if (statusFilter === "a_associer" && inv.lead_match !== "a_associer") return false;
      if (supplierFilter && supplierKey(inv) !== supplierFilter) return false;
      if (clientFilter && (clientKey(inv) ?? "stock") !== clientFilter) return false;
      if (q) {
        const name = (inv.supplier_id && supplierNames[inv.supplier_id]) || inv.supplier_name || "";
        const client = inv.lead ? leadDisplayName(inv.lead) : inv.client_reference ?? "";
        const hay = `${name} ${client} ${inv.invoice_number ?? ""} ${inv.order_reference ?? ""} ${inv.description ?? ""} ${inv.file_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, supplierFilter, clientFilter, search, today, supplierNames]);

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
        const created = (data.invoices ?? []) as SupplierInvoice[];
        setInvoices((list) => [...created, ...list]);
        setSuppliers((list) => {
          const next = [...list];
          for (const inv of created) {
            if (inv.supplier_id && inv.supplier_name && !next.some((s) => s.id === inv.supplier_id)) {
              next.push({ id: inv.supplier_id, name: inv.supplier_name });
            }
          }
          return next.sort((a, b) => a.name.localeCompare(b.name, "fr"));
        });
        const total = created.reduce((n, inv) => n + Number(inv.amount_ttc ?? 0), 0);
        const c = data.counts ?? { auto: 0, a_associer: 0, stock: 0, review: 0 };
        const parts = [
          created.length > 1
            ? `${created.length} factures ${created[0]?.supplier_name ?? ""} · ${formatEuro(total)}`
            : `${created[0]?.supplier_name ?? "Fournisseur ?"} · ${formatEuro(created[0]?.amount_ttc)}${created[0]?.due_date ? ` · échéance ${formatDate(created[0].due_date)}` : ""}`,
          c.auto ? `${c.auto} rattachée(s) à un client` : null,
          c.a_associer ? `${c.a_associer} client(s) à associer` : null,
          c.stock ? `${c.stock} sans client (stock)` : null,
          data.duplicates?.length ? `${data.duplicates.length} déjà enregistrée(s), ignorée(s)` : null,
          data.errors?.length ? `${data.errors.length} en erreur` : null,
          data.warning,
        ].filter(Boolean);
        const attention = !!data.warning || c.a_associer > 0 || c.review > 0 || data.errors?.length > 0;
        updateQueue(id, { state: attention ? "attention" : "ok", message: parts.join(" · ") });
        if (c.a_associer > 0) setStatusFilter("a_associer");
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

  const reprocess = async (inv: SupplierInvoice) => {
    setReprocessing(inv.id);
    try {
      const res = await fetch(`/api/admin/supplier-invoices/${inv.id}/reprocess`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Relecture impossible");
        return;
      }
      const created = (data.invoices ?? []) as SupplierInvoice[];
      setInvoices((list) => [...created, ...list.filter((i) => i.id !== inv.id)]);
      setSuppliers((list) => {
        const next = [...list];
        for (const c of created) {
          if (c.supplier_id && c.supplier_name && !next.some((s) => s.id === c.supplier_id)) next.push({ id: c.supplier_id, name: c.supplier_name });
        }
        return next.sort((a, b) => a.name.localeCompare(b.name, "fr"));
      });
      toast.success(`${created.length} facture(s) reconnue(s)${data.duplicates?.length ? `, ${data.duplicates.length} déjà présente(s)` : ""}`);
    } finally {
      setReprocessing(null);
    }
  };

  const toggleExpand = async (inv: SupplierInvoice) => {
    if (expanded === inv.id) {
      setExpanded(null);
      return;
    }
    setExpanded(inv.id);
    if (linesCache[inv.id] && linesCache[inv.id] !== "error") return;
    setLinesCache((c) => ({ ...c, [inv.id]: "loading" }));
    try {
      const res = await fetch(`/api/admin/supplier-invoices/${inv.id}`);
      const data = await res.json();
      setLinesCache((c) => ({ ...c, [inv.id]: res.ok ? (data.lines as SupplierInvoiceLine[]) : "error" }));
    } catch {
      setLinesCache((c) => ({ ...c, [inv.id]: "error" }));
    }
  };

  const busy = queue.some((q) => q.state === "attente" || q.state === "lecture");
  const selectedSupplierName = summaries.find((s) => s.key === supplierFilter)?.name;
  const selectedClientName = clientSummaries.find((c) => c.key === clientFilter)?.label;
  const allRemaining = summaries.reduce((n, s) => n + s.remaining, 0);

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
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed px-6 py-7 text-center transition-colors ${
          dragging ? "border-brand bg-brand-soft" : "border-line-strong bg-white hover:border-brand hover:bg-brand-soft/40"
        }`}
      >
        {busy ? <Loader2 className="h-8 w-8 animate-spin text-brand" /> : <UploadCloud className="h-8 w-8 text-brand" />}
        <p className="text-sm font-semibold text-ink">
          {busy ? "Lecture des factures en cours…" : "Glissez vos factures ici, ou cliquez pour les choisir"}
        </p>
        <p className="text-xs text-subtle">
          PDF ou photo · un PDF peut contenir plusieurs factures : elles sont séparées automatiquement, avec chaque ligne, chaque montant et le client
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
                    {it.state === "lecture" && "Lecture et découpage des factures…"}
                    {it.message}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Onglets fournisseurs : ce que je dois à chacun */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-max gap-2">
          <SupplierTab
            active={supplierFilter === ""}
            onClick={() => {
              setSupplierFilter("");
              setClientFilter("");
            }}
            name="Tous les fournisseurs"
            remaining={allRemaining}
            hint={`${invoices.length} facture(s)`}
            overdue={totals.overdueAmount}
          />
          {summaries.map((s) => (
            <SupplierTab
              key={s.key}
              active={supplierFilter === s.key}
              onClick={() => {
                setSupplierFilter(s.key);
                setClientFilter("");
              }}
              name={s.name}
              remaining={s.remaining}
              hint={`${s.openCount} à payer / ${s.invoiceCount}`}
              overdue={s.overdueAmount}
            />
          ))}
        </div>
      </div>

      {/* Indicateurs de l'onglet */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={selectedSupplierName ? `Je dois à ${selectedSupplierName}` : "Reste à payer"} value={formatEuro(totals.remaining)} icon={Wallet} tone="brand" hint={`${totals.openCount} facture(s) en cours`} />
        <StatCard label="En retard" value={formatEuro(totals.overdueAmount)} icon={AlertTriangle} tone="danger" hint={`${totals.overdueCount} facture(s) échue(s)`} />
        <StatCard label="Échéance sous 7 jours" value={formatEuro(totals.dueSoonAmount)} icon={CalendarClock} tone="warning" hint={`${totals.dueSoonCount} facture(s)`} />
        <StatCard
          label="Client à associer"
          value={totals.toLinkCount}
          icon={UserRound}
          tone="amethyst"
          hint={totals.toReviewCount ? `${totals.toReviewCount} facture(s) à vérifier aussi` : "Référence client trouvée, lead à confirmer"}
        />
      </div>

      {/* Liste des factures */}
      <Panel
        title={[selectedSupplierName ?? "Toutes les factures", selectedClientName].filter(Boolean).join(" · ")}
        description={`${filtered.length} facture(s) · reste à payer ${formatEuro(filteredRemaining)} · cliquez sur une facture pour voir son détail ligne par ligne`}
        action={
          clientFilter ? (
            <Button variant="ghost" size="sm" onClick={() => setClientFilter("")}>
              <X className="h-4 w-4" /> Tous les clients
            </Button>
          ) : null
        }
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
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N°, client, article…" className="h-8 w-56 pl-8" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-xs text-subtle">
                <th className="w-8 px-3 py-2" />
                <th className="px-2 py-2 font-medium">Facture</th>
                {!supplierFilter && <th className="px-2 py-2 font-medium">Fournisseur</th>}
                <th className="px-2 py-2 font-medium">Client</th>
                <th className="px-2 py-2 font-medium">Échéance</th>
                <th className="px-2 py-2 font-medium text-right">HT</th>
                <th className="px-2 py-2 font-medium text-right">TTC</th>
                <th className="px-2 py-2 font-medium text-right">Reste dû</th>
                <th className="px-2 py-2 font-medium">Statut</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const status = invoiceStatus(inv, today);
                const name = (inv.supplier_id && supplierNames[inv.supplier_id]) || inv.supplier_name || "Fournisseur inconnu";
                const open = expanded === inv.id;
                const unread = !inv.invoice_number && inv.amount_ttc === null;
                const cols = supplierFilter ? 9 : 10;
                return (
                  <Fragment key={inv.id}>
                    <tr
                      onClick={() => toggleExpand(inv)}
                      className={`cursor-pointer border-t border-line align-top transition-colors ${open ? "bg-brand-soft/60" : "hover:bg-line-soft/60"}`}
                    >
                      <td className="px-3 py-2.5 text-subtle">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="px-2 py-2.5">
                        <div className="font-medium text-ink">{inv.invoice_number ?? inv.file_name ?? "—"}</div>
                        <div className="max-w-[260px] truncate text-xs text-subtle">
                          {formatDate(inv.invoice_date)}
                          {inv.description ? ` · ${inv.description}` : ""}
                        </div>
                      </td>
                      {!supplierFilter && <td className="px-2 py-2.5 font-medium text-ink">{name}</td>}
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <ClientCell inv={inv} onLink={() => setEditing(inv)} />
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">
                        <div>{formatDate(inv.due_date)}</div>
                        <DueHint inv={inv} today={today} />
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{formatEuro(inv.amount_ht)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{formatEuro(inv.amount_ttc)}</td>
                      <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-ink">
                        {status === "payee" ? <span className="font-normal text-faint">—</span> : formatEuro(remainingAmount(inv))}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={status} />
                          {duplicates.has(inv.id) && (
                            <span
                              title={`Même client et même montant que : ${duplicates.get(inv.id)!.join(", ")}`}
                              className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700"
                            >
                              Doublon possible ?
                            </span>
                          )}
                          {inv.needs_review && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                              À vérifier
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {unread && inv.storage_path && (
                            <Button size="sm" variant="outline" onClick={() => reprocess(inv)} disabled={reprocessing === inv.id}>
                              {reprocessing === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                              Relire
                            </Button>
                          )}
                          {inv.storage_path && (
                            <a
                              href={`/api/admin/supplier-invoices/${inv.id}/file`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Voir le PDF"
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
                    {open && (
                      <tr className="border-t border-line bg-canvas/60">
                        <td colSpan={cols} className="px-5 py-4">
                          <InvoiceDetail inv={inv} lines={linesCache[inv.id]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-4 text-subtle">
                    Aucune facture ne correspond à ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Synthèse par client */}
      <Panel
        title="Par client"
        description={`Le matériel facturé pour chaque chantier${selectedSupplierName ? ` par ${selectedSupplierName}` : ""}. Cliquez sur une ligne pour filtrer les factures.`}
        bodyClassName="px-0 pb-2 pt-3 overflow-x-auto"
      >
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs text-subtle">
              <th className="px-5 py-2 font-medium">Client / chantier</th>
              <th className="px-2 py-2 font-medium">Fournisseur(s)</th>
              <th className="px-2 py-2 font-medium text-right">Factures</th>
              <th className="px-2 py-2 font-medium text-right">Matériel HT</th>
              <th className="px-2 py-2 font-medium text-right">TTC</th>
              <th className="px-5 py-2 font-medium text-right">Reste à payer</th>
            </tr>
          </thead>
          <tbody>
            {clientSummaries.map((c) => (
              <tr
                key={c.key}
                onClick={() => setClientFilter((cur) => (cur === c.key ? "" : c.key))}
                className={`cursor-pointer border-t border-line transition-colors hover:bg-line-soft ${clientFilter === c.key ? "bg-brand-soft" : ""}`}
              >
                <td className="px-5 py-2">
                  <div className="flex items-center gap-2">
                    {c.kind === "lead" && c.leadId ? (
                      <Link href={`/admin/leads/${c.leadId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-brand hover:underline">
                        {c.label}
                      </Link>
                    ) : (
                      <span className={`font-medium ${c.kind === "stock" ? "text-subtle" : "text-ink"}`}>{c.label}</span>
                    )}
                    {c.kind === "a_associer" && (
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">à associer</span>
                    )}
                  </div>
                  {c.sublabel && <div className="text-xs text-subtle">{c.sublabel}</div>}
                </td>
                <td className="px-2 py-2 text-xs text-subtle">{c.suppliers.join(", ")}</td>
                <td className="px-2 py-2 text-right tabular-nums">{c.invoiceCount}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-ink">{formatEuro(c.totalHt)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatEuro(c.totalTtc)}</td>
                <td className="px-5 py-2 text-right tabular-nums">{c.remaining > 0 ? formatEuro(c.remaining) : <span className="text-faint">—</span>}</td>
              </tr>
            ))}
            {clientSummaries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-4 text-subtle">
                  Aucune facture pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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

/* ── Onglet fournisseur ───────────────────────────────────────────── */

function SupplierTab({
  active,
  onClick,
  name,
  remaining,
  hint,
  overdue,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
  remaining: number;
  hint: string;
  overdue: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[170px] rounded-[12px] border px-4 py-2.5 text-left transition-colors ${
        active ? "border-brand bg-brand text-white shadow-card" : "border-line bg-white text-ink hover:border-brand/60 hover:bg-brand-soft/40"
      }`}
    >
      <div className={`truncate text-xs font-semibold uppercase tracking-wide ${active ? "text-white/85" : "text-subtle"}`}>{name}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{formatEuro(remaining)}</div>
      <div className={`text-xs ${active ? "text-white/80" : "text-subtle"}`}>
        {hint}
        {overdue > 0 && <span className={active ? "font-semibold text-white" : "font-semibold text-red-600"}> · {formatEuro(overdue)} en retard</span>}
      </div>
    </button>
  );
}

/* ── Détail d'une facture : lignes ────────────────────────────────── */

function formatQty(n: number | null): string {
  if (n === null || n === undefined) return "";
  return Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

function InvoiceDetail({ inv, lines }: { inv: SupplierInvoice; lines: SupplierInvoiceLine[] | "loading" | "error" | undefined }) {
  const facts: [string, string | null | undefined][] = [
    ["Date de facture", formatDate(inv.invoice_date)],
    ["Échéance", formatDate(inv.due_date)],
    ["Livraison", inv.delivery_date ? formatDate(inv.delivery_date) : null],
    ["Commande", inv.order_reference],
    ["Paiement", inv.payment_terms],
    ["Réf. client sur la facture", inv.client_reference],
    ["Pages du PDF d'origine", inv.source_pages],
  ];
  return (
    <div className="space-y-3">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        {facts
          .filter(([, v]) => v && v !== "—")
          .map(([k, v]) => (
            <div key={k}>
              <dt className="inline text-subtle">{k} : </dt>
              <dd className="inline font-medium text-ink">{v}</dd>
            </div>
          ))}
      </dl>

      {lines === "loading" || lines === undefined ? (
        <p className="flex items-center gap-2 text-sm text-subtle">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des lignes…
        </p>
      ) : lines === "error" ? (
        <p className="text-sm text-red-600">Impossible de charger les lignes.</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-subtle">Pas de détail ligne par ligne pour cette facture.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-line-soft/60 text-left text-xs text-subtle">
                <th className="px-3 py-1.5 font-medium">#</th>
                <th className="px-2 py-1.5 font-medium">Réf.</th>
                <th className="px-2 py-1.5 font-medium">Désignation</th>
                <th className="px-2 py-1.5 font-medium text-right">Qté</th>
                <th className="px-2 py-1.5 font-medium text-right">Prix unit. HT</th>
                <th className="px-3 py-1.5 font-medium text-right">Montant HT</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) =>
                l.is_comment ? (
                  <tr key={l.id} className="border-t border-line">
                    <td className="px-3 py-1.5 text-faint">{l.position}</td>
                    <td colSpan={5} className="px-2 py-1.5 text-xs font-medium italic text-violet-700">
                      {l.description}
                    </td>
                  </tr>
                ) : (
                  <tr key={l.id} className="border-t border-line">
                    <td className="px-3 py-1.5 text-faint">{l.position}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-subtle">{l.reference}</td>
                    <td className="px-2 py-1.5 text-ink">{l.description}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatQty(l.quantity)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatEuro(l.unit_price)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${Number(l.amount) < 0 ? "text-emerald-700" : "text-ink"}`}>{formatEuro(l.amount)}</td>
                  </tr>
                )
              )}
            </tbody>
            <tfoot className="border-t border-line-strong text-sm">
              <tr>
                <td colSpan={5} className="px-3 py-1 text-right text-subtle">Total HT</td>
                <td className="px-3 py-1 text-right font-medium tabular-nums">{formatEuro(inv.amount_ht)}</td>
              </tr>
              <tr>
                <td colSpan={5} className="px-3 py-1 text-right text-subtle">TVA</td>
                <td className="px-3 py-1 text-right tabular-nums">{formatEuro(inv.amount_tva)}</td>
              </tr>
              <tr>
                <td colSpan={5} className="px-3 py-1 text-right font-semibold text-ink">Total TTC</td>
                <td className="px-3 py-1 text-right font-bold tabular-nums text-ink">{formatEuro(inv.amount_ttc)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
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
  const [lead, setLead] = useState<{ id: string | null; label: string | null }>({
    id: invoice.lead_id,
    label: invoice.lead ? leadDisplayName(invoice.lead) : null,
  });
  const [leadTouched, setLeadTouched] = useState(false);
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
    const leadChanged = leadTouched && (lead.id !== invoice.lead_id || (!lead.id && invoice.lead_match === "a_associer"));
    await onSave({ ...form, needs_review: false, ...(leadChanged ? { lead_id: lead.id } : {}) });
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
          <span className={label}>Client / chantier</span>
          <LeadPicker
            invoice={invoice}
            value={lead}
            onChange={(v) => {
              setLead(v);
              setLeadTouched(true);
            }}
          />
        </div>
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
