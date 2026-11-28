"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Package,
  Phone,
  Plus,
  ShoppingCart,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  STOCK_STATUS_LABELS,
  TEAMS,
  addDays,
  mondayOf,
  toIsoDate,
  type StockProductOption,
  type StockStatus,
  type TeamId,
  type TeamInstallation,
} from "@/lib/equipe";

const INPUT_CLS =
  "w-full h-9 px-3 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors";
const TEXTAREA_CLS =
  "w-full min-h-[70px] px-3 py-2 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors";
const LABEL_CLS = "block text-sm font-medium text-ink mb-1.5";

const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const TEAM_COLORS: Record<TeamId, string> = {
  1: "bg-sky-500",
  2: "bg-violet-500",
  3: "bg-amber-500",
  4: "bg-emerald-500",
};

const STATUS_STYLE: Record<StockStatus, { card: string; badge: string; icon: typeof Package }> = {
  stock: { card: "border-l-green-500", badge: "bg-green-100 text-green-700", icon: Package },
  a_commander: { card: "border-l-red-500", badge: "bg-red-100 text-red-700", icon: ShoppingCart },
  commande: { card: "border-l-orange-500", badge: "bg-orange-100 text-orange-700", icon: Truck },
};

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function productText(p: StockProductOption): string {
  return p.type_name && p.type_name !== p.name ? `${p.type_name} — ${p.name}` : p.name;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.error === "string" && body.error) || fallback;
}

type FormState = {
  id: string | null;
  team: TeamId;
  install_date: string;
  client_name: string;
  phone: string;
  address: string;
  notes: string;
  product_id: string;
  product_label: string;
  quantity: number;
  stock_status: StockStatus;
};

function emptyForm(team: TeamId, date: string): FormState {
  return {
    id: null,
    team,
    install_date: date,
    client_name: "",
    phone: "",
    address: "",
    notes: "",
    product_id: "",
    product_label: "",
    quantity: 1,
    stock_status: "stock",
  };
}

function formFromItem(it: TeamInstallation): FormState {
  return {
    id: it.id,
    team: it.team,
    install_date: it.install_date,
    client_name: it.client_name,
    phone: it.phone ?? "",
    address: it.address ?? "",
    notes: it.notes ?? "",
    product_id: it.product_id ?? "",
    product_label: it.product_label ?? "",
    quantity: it.quantity,
    stock_status: it.stock_status,
  };
}

export function EquipeClient({
  initialWeekStart,
  initialItems,
  initialProducts,
}: {
  initialWeekStart: string;
  initialItems: TeamInstallation[];
  initialProducts: StockProductOption[];
}) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [items, setItems] = useState<TeamInstallation[]>(initialItems);
  const [products, setProducts] = useState<StockProductOption[]>(initialProducts);
  const [teamFilter, setTeamFilter] = useState<TeamId | "all">("all");
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [editing, setEditing] = useState<TeamInstallation | null>(null);
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => {
    const start = parseIso(weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekStart]);
  const todayIso = toIsoDate(new Date());

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productGroups = useMemo(() => {
    const groups = new Map<string, StockProductOption[]>();
    for (const p of products) {
      const key = p.type_name ?? "Autres";
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()];
  }, [products]);

  const visibleTeams = teamFilter === "all" ? TEAMS : TEAMS.filter((t) => t.id === teamFilter);

  const toOrder = items.filter((i) => i.stock_status === "a_commander").length;
  const ordered = items.filter((i) => i.stock_status === "commande").length;

  async function loadWeek(start: string) {
    setWeekStart(start);
    setLoadingWeek(true);
    try {
      const to = toIsoDate(addDays(parseIso(start), 6));
      const res = await fetch(`/api/admin/equipe?from=${start}&to=${to}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res, "Impossible de charger le planning."));
      const body = await res.json();
      setItems(body.items);
      setProducts(body.products);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de charger le planning.");
    } finally {
      setLoadingWeek(false);
    }
  }

  function openCreate(team: TeamId, date: string) {
    setEditing(null);
    setForm(emptyForm(team, date));
  }

  function openEdit(it: TeamInstallation) {
    setEditing(it);
    setForm(formFromItem(it));
  }

  /** Stock disponible pour ce produit, en comptant ce que ce créneau réserve déjà. */
  function availableFor(productId: string): number {
    const p = productsById.get(productId);
    if (!p) return 0;
    const alreadyReserved =
      editing && editing.stock_status === "stock" && editing.product_id === productId ? editing.quantity : 0;
    return p.quantity + alreadyReserved;
  }

  function selectProduct(productId: string) {
    if (!form) return;
    const next = { ...form, product_id: productId };
    if (productId) {
      const p = productsById.get(productId);
      next.product_label = p ? productText(p) : "";
      // Pas assez en stock : on bascule d'office sur « à commander ».
      if (form.stock_status === "stock" && availableFor(productId) < form.quantity) next.stock_status = "a_commander";
      else if (form.stock_status === "a_commander" && availableFor(productId) >= form.quantity) next.stock_status = "stock";
    }
    setForm(next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const payload = {
        team: form.team,
        install_date: form.install_date,
        client_name: form.client_name,
        phone: form.phone,
        address: form.address,
        notes: form.notes,
        product_id: form.product_id || null,
        product_label: form.product_label,
        quantity: form.quantity,
        stock_status: form.stock_status,
      };
      const res = await fetch(form.id ? `/api/admin/equipe/${form.id}` : "/api/admin/equipe", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readError(res, "Enregistrement impossible."));
      const body = (await res.json()) as { item: TeamInstallation; products: StockProductOption[] };
      setProducts(body.products);
      const inWeek = body.item.install_date >= weekStart && body.item.install_date <= toIsoDate(days[6]);
      setItems((prev) => {
        const rest = prev.filter((i) => i.id !== body.item.id);
        return inWeek ? [...rest, body.item] : rest;
      });
      toast.success(
        form.id
          ? "Créneau modifié."
          : body.item.stock_status === "stock"
          ? "Créneau ajouté — pompe à chaleur retirée du stock."
          : "Créneau ajouté."
      );
      setForm(null);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form?.id) return;
    const msg =
      editing?.stock_status === "stock" && editing.product_id
        ? "Supprimer ce créneau ? La pompe à chaleur sera remise dans le stock."
        : "Supprimer ce créneau ?";
    if (!window.confirm(msg)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/equipe/${form.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Suppression impossible."));
      const body = await res.json();
      setProducts(body.products);
      setItems((prev) => prev.filter((i) => i.id !== form.id));
      toast.success("Créneau supprimé.");
      setForm(null);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  }

  const weekLabel = `Semaine du ${days[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${days[6].toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div className="space-y-4">
      {/* Navigation semaine + filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-[10px] border border-line bg-white p-1 shadow-sm">
          <button
            type="button"
            aria-label="Semaine précédente"
            onClick={() => loadWeek(toIsoDate(addDays(parseIso(weekStart), -7)))}
            className="rounded-lg p-1.5 text-body hover:bg-canvas"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => loadWeek(toIsoDate(mondayOf(new Date())))}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-body hover:bg-canvas"
          >
            Cette semaine
          </button>
          <button
            type="button"
            aria-label="Semaine suivante"
            onClick={() => loadWeek(toIsoDate(addDays(parseIso(weekStart), 7)))}
            className="rounded-lg p-1.5 text-body hover:bg-canvas"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-body">
          <CalendarDays className="size-4 text-subtle" />
          <input
            type="date"
            value={weekStart}
            onChange={(e) => e.target.value && loadWeek(toIsoDate(mondayOf(parseIso(e.target.value))))}
            className={`${INPUT_CLS} w-auto`}
          />
        </label>
        <span className="text-sm font-medium text-ink">{weekLabel}</span>
        {loadingWeek && <Loader2 className="size-4 animate-spin text-subtle" />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTeamFilter("all")}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            teamFilter === "all" ? "border-brand bg-brand text-white" : "border-line bg-white text-body hover:bg-canvas"
          }`}
        >
          Toutes les équipes
        </button>
        {TEAMS.map((t) => {
          const count = items.filter((i) => i.team === t.id).length;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTeamFilter(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                teamFilter === t.id ? "border-brand bg-brand text-white" : "border-line bg-white text-body hover:bg-canvas"
              }`}
            >
              <span className={`size-2 rounded-full ${TEAM_COLORS[t.id]}`} />
              Équipe {t.id} · {t.name}
              <span className="tabular-nums opacity-80">{count}</span>
            </button>
          );
        })}
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          {toOrder > 0 && (
            <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-700">
              {toOrder} à commander
            </span>
          )}
          {ordered > 0 && (
            <span className="rounded-full bg-orange-100 px-2.5 py-1 font-medium text-orange-700">
              {ordered} commandée{ordered > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Grille équipes × jours */}
      <div className="overflow-x-auto rounded-[14px] border border-line bg-white shadow-sm">
        <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-canvas/60">
              <th className="w-[150px] border-b border-line px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-subtle">
                Équipe
              </th>
              {days.map((d, i) => {
                const iso = toIsoDate(d);
                return (
                  <th
                    key={iso}
                    className={`border-b border-l border-line px-2 py-2 text-left text-xs font-semibold ${
                      iso === todayIso ? "bg-brand/10 text-brand" : "text-subtle"
                    }`}
                  >
                    <div className="uppercase tracking-wide">{DAY_LABELS[i]}</div>
                    <div className="font-normal tabular-nums">{formatShort(d)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleTeams.map((t) => (
              <tr key={t.id} className="align-top">
                <td className="border-b border-line px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 shrink-0 rounded-full ${TEAM_COLORS[t.id]}`} />
                    <div>
                      <div className="text-xs text-subtle">Équipe {t.id}</div>
                      <div className="font-semibold text-ink">{t.name}</div>
                    </div>
                  </div>
                </td>
                {days.map((d) => {
                  const iso = toIsoDate(d);
                  const cell = items.filter((i) => i.team === t.id && i.install_date === iso);
                  return (
                    <td
                      key={iso}
                      className={`group border-b border-l border-line p-1.5 ${iso === todayIso ? "bg-brand/[0.03]" : ""}`}
                    >
                      <div className="flex min-h-[90px] flex-col gap-1.5">
                        {cell.map((it) => {
                          const st = STATUS_STYLE[it.stock_status];
                          const Icon = st.icon;
                          return (
                            <button
                              key={it.id}
                              type="button"
                              onClick={() => openEdit(it)}
                              className={`w-full rounded-lg border border-line border-l-4 ${st.card} bg-white p-2 text-left shadow-sm transition-colors hover:bg-canvas`}
                            >
                              <div className="truncate text-[13px] font-semibold text-ink">{it.client_name}</div>
                              {it.product_label && (
                                <div className="mt-0.5 line-clamp-2 text-xs text-body">
                                  {it.quantity > 1 ? `${it.quantity} × ` : ""}
                                  {it.product_label}
                                </div>
                              )}
                              <span
                                className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${st.badge}`}
                              >
                                <Icon className="size-3" />
                                {STOCK_STATUS_LABELS[it.stock_status]}
                              </span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => openCreate(t.id, iso)}
                          className="mt-auto flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1 text-xs text-subtle opacity-60 transition hover:border-brand hover:text-brand hover:opacity-100 group-hover:opacity-100"
                        >
                          <Plus className="size-3.5" /> Ajouter
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !saving && setForm(null)}
        >
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[16px] bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">
                {form.id ? "Modifier l'installation" : "Nouvelle installation"}
              </h2>
              <button type="button" onClick={() => setForm(null)} className="rounded-lg p-1 text-subtle hover:bg-canvas">
                <X className="size-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLS}>Équipe</label>
                <select
                  value={form.team}
                  onChange={(e) => setForm({ ...form, team: Number(e.target.value) as TeamId })}
                  className={INPUT_CLS}
                >
                  {TEAMS.map((t) => (
                    <option key={t.id} value={t.id}>
                      Équipe {t.id} — {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Date d&apos;installation</label>
                <input
                  type="date"
                  required
                  value={form.install_date}
                  onChange={(e) => setForm({ ...form, install_date: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL_CLS}>Client *</label>
                <input
                  required
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  placeholder="Nom du client"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>
                  <Phone className="mr-1 inline size-3.5" />
                  Téléphone
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>
                  <MapPin className="mr-1 inline size-3.5" />
                  Adresse
                </label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>
            </div>

            <div className="mt-4 rounded-[12px] border border-line bg-canvas/40 p-3">
              <div className="mb-2 text-sm font-semibold text-ink">Pompe à chaleur à installer</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_90px]">
                <div>
                  <label className={LABEL_CLS}>Produit du stockage</label>
                  <select value={form.product_id} onChange={(e) => selectProduct(e.target.value)} className={INPUT_CLS}>
                    <option value="">— Aucun / hors stockage —</option>
                    {productGroups.map(([type, list]) => (
                      <optgroup key={type} label={type}>
                        {list.map((p) => {
                          const avail = availableFor(p.id);
                          return (
                            <option key={p.id} value={p.id}>
                              {p.name} — {avail > 0 ? `${avail} en stock` : "rupture"}
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>Quantité</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: Math.max(1, Number(e.target.value) || 1) })}
                    className={INPUT_CLS}
                  />
                </div>
              </div>

              {!form.product_id && (
                <div className="mt-3">
                  <label className={LABEL_CLS}>Modèle (si absent du stockage)</label>
                  <input
                    value={form.product_label}
                    onChange={(e) => setForm({ ...form, product_label: e.target.value })}
                    placeholder="Ex. Atlantic Excellia 11 kW mono"
                    className={INPUT_CLS}
                  />
                </div>
              )}

              <div className="mt-3">
                <label className={LABEL_CLS}>Disponibilité</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["stock", "a_commander", "commande"] as StockStatus[]).map((s) => {
                    const st = STATUS_STYLE[s];
                    const Icon = st.icon;
                    const disabled =
                      s === "stock" && (!form.product_id || availableFor(form.product_id) < form.quantity);
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={disabled}
                        onClick={() => setForm({ ...form, stock_status: s })}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          form.stock_status === s ? `${st.badge} border-transparent ring-2 ring-current/30` : "border-line bg-white text-body hover:bg-canvas"
                        }`}
                      >
                        <Icon className="size-3.5" />
                        {STOCK_STATUS_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-subtle">
                  {form.stock_status === "stock"
                    ? "La quantité sera retirée du Stockage à l'enregistrement."
                    : form.product_id && availableFor(form.product_id) < form.quantity
                    ? "Pas assez de stock : la pompe à chaleur doit être commandée."
                    : "Le stock n'est pas modifié. Repassez sur « Pris du stock » une fois le matériel reçu."}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className={LABEL_CLS}>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Informations complémentaires (accès, horaires, matériel annexe…)"
                className={TEXTAREA_CLS}
              />
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              {form.id ? (
                <Button type="button" variant="destructive" onClick={remove} disabled={saving}>
                  <Trash2 /> Supprimer
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={saving}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="animate-spin" />}
                  Enregistrer
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
