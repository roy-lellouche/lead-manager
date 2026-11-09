"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  Inbox,
  Link2,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  UserX,
  X,
} from "lucide-react";
import { SavForm } from "@/components/sav/SavForm";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/compress-image";
import { formatFullDateTimeParis, fromDatetimeLocalValueParis } from "@/lib/date";
import {
  isSavArchived,
  SAV_ACTIVE_STATUSES,
  SAV_PUBLIC_PATH,
  SAV_STATUS_COLORS,
  SAV_STATUS_LABELS,
  type SavRequestWithUrls,
  type SavStatus,
} from "@/lib/sav";

// Leaflet touche `window` : la carte n'est rendue que côté navigateur.
const SavMap = dynamic(() => import("./SavMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-[14px] bg-line" />,
});

type Filter = "all" | SavStatus;
type View = "en_cours" | "archives";

function StatusBadge({ status }: { status: SavStatus }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${SAV_STATUS_COLORS[status]}1a`, color: SAV_STATUS_COLORS[status] }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SAV_STATUS_COLORS[status] }} />
      {SAV_STATUS_LABELS[status]}
    </span>
  );
}

export function SavClient({ initialItems }: { initialItems: SavRequestWithUrls[] }) {
  const [items, setItems] = useState(initialItems);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("en_cours");
  const [showForm, setShowForm] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Les SAV résolus sont archivés : ils n'apparaissent (liste et carte) que dans l'onglet « SAV archivés ».
  const active = useMemo(() => items.filter((i) => !isSavArchived(i)), [items]);
  const archived = useMemo(() => items.filter(isSavArchived), [items]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: active.length };
    for (const s of SAV_ACTIVE_STATUSES) c[s] = active.filter((i) => i.status === s).length;
    return c;
  }, [active]);

  const visible = useMemo(() => {
    if (view === "archives") return archived;
    return filter === "all" ? active : active.filter((i) => i.status === filter);
  }, [view, active, archived, filter]);

  const replaceItem = (updated: SavRequestWithUrls) => {
    // Résolu ou désarchivé : le SAV quitte l'onglet affiché, sa fiche se referme.
    if (isSavArchived(updated) !== (view === "archives")) setExpandedId(null);
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const switchView = (next: View) => {
    setView(next);
    setFilter("all");
    setExpandedId(null);
  };

  const selectFromMap = (id: string) => {
    // Si le SAV est masqué par le filtre, on l'affiche pour que la fiche s'ouvre.
    setFilter((f) => (f === "all" || items.find((i) => i.id === id)?.status === f ? f : "all"));
    setExpandedId(id);
  };

  useEffect(() => {
    if (expandedId) rowRefs.current[expandedId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [expandedId]);

  const copyLink = async () => {
    const url = `${window.location.origin}${SAV_PUBLIC_PATH}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien du formulaire client copié");
    } catch {
      window.prompt("Copiez le lien du formulaire client :", url);
    }
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Tous" },
    ...SAV_ACTIVE_STATUSES.map((s) => ({ key: s as Filter, label: SAV_STATUS_LABELS[s] })),
  ];

  const views: { key: View; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "en_cours", label: "SAV en cours", icon: <Inbox className="h-4 w-4" />, count: active.length },
    { key: "archives", label: "SAV archivés", icon: <Archive className="h-4 w-4" />, count: archived.length },
  ];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "default"} size="lg">
            {showForm ? <X /> : <Plus />}
            {showForm ? "Fermer le formulaire" : "Nouveau SAV"}
          </Button>
          <Button onClick={copyLink} variant="outline" size="lg" title="Lien unique à envoyer à vos clients">
            <Link2 />
            Copier le lien client
          </Button>
        </div>

        {showForm && (
          <div className="rounded-[14px] border border-line bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-ink">Nouvelle demande de SAV</h2>
            <SavForm
              endpoint="/api/admin/sav"
              submitLabel="Enregistrer le SAV"
              onSuccess={(created) => {
                const sav = created as SavRequestWithUrls;
                setItems((prev) => [sav, ...prev]);
                setShowForm(false);
                switchView("en_cours");
                setExpandedId(sav.id);
                toast.success("SAV enregistré");
              }}
            />
          </div>
        )}

        <div role="tablist" className="inline-flex rounded-[10px] border border-line bg-white p-1 shadow-sm">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => switchView(v.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                view === v.key ? "bg-ink text-white" : "text-body hover:bg-canvas"
              }`}
            >
              {v.icon}
              {v.label} <span className="tabular-nums opacity-80">{v.count}</span>
            </button>
          ))}
        </div>

        {view === "archives" ? (
          <p className="text-sm text-subtle">
            SAV résolus. Désarchivez-en un pour le remettre dans les SAV en cours.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-white text-body hover:bg-canvas"
                }`}
              >
                {f.label} <span className="tabular-nums opacity-80">{counts[f.key]}</span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {visible.length === 0 && (
            <p className="rounded-[14px] border border-dashed border-line-strong bg-white p-8 text-center text-sm text-subtle">
              {view === "archives"
                ? "Aucun SAV archivé pour le moment."
                : active.length === 0
                  ? "Aucun SAV en cours."
                  : "Aucune demande dans cette catégorie."}
            </p>
          )}
          {visible.map((item) => (
            <div
              key={item.id}
              ref={(el) => {
                rowRefs.current[item.id] = el;
              }}
            >
              <SavCard
                item={item}
                expanded={expandedId === item.id}
                onToggle={() => setExpandedId((cur) => (cur === item.id ? null : item.id))}
                onUpdated={replaceItem}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Carte fixe : seule la colonne de gauche défile (sticky sur grand écran). */}
      <div className="h-80 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <div className="h-full overflow-hidden rounded-[14px] border border-line bg-white shadow-sm">
          <SavMap items={visible} selectedId={expandedId} onSelect={selectFromMap} />
        </div>
      </div>
    </div>
  );
}

function SavCard({
  item,
  expanded,
  onToggle,
  onUpdated,
}: {
  item: SavRequestWithUrls;
  expanded: boolean;
  onToggle: () => void;
  onUpdated: (item: SavRequestWithUrls) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [when, setWhen] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const archived = isSavArchived(item);

  const updateStatus = async (status: SavStatus, rescheduledAt?: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sav/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rescheduled_at: rescheduledAt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      onUpdated(json);
      setRescheduling(false);
      toast.success(
        isSavArchived(json)
          ? "SAV résolu et archivé"
          : archived
            ? "SAV désarchivé"
            : `SAV : ${SAV_STATUS_LABELS[status].toLowerCase()}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const addPhotos = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const body = new FormData();
      const files = await Promise.all(Array.from(list).map((f) => compressImage(f)));
      files.forEach((f) => body.append("photos", f));
      const res = await fetch(`/api/admin/sav/${item.id}/photos`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      onUpdated(json);
      toast.success("Photo(s) ajoutée(s)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  };

  return (
    <div
      className={`overflow-hidden rounded-[14px] border bg-white shadow-sm transition-colors ${
        expanded ? "border-brand" : "border-line"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-panel"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-ink">{item.name}</span>
            <StatusBadge status={item.status} />
          </div>
          <div className="mt-0.5 text-sm text-body">
            {item.problem_type} · {item.phone}
          </div>
          <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-subtle">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.address}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-subtle">
          <span>{formatFullDateTimeParis(item.created_at)}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-line bg-[#fbfcfe] px-4 py-4">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Info label="Nom" value={item.name} />
            <Info
              label="Téléphone"
              value={
                <a href={`tel:${item.phone}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                  <Phone className="h-3.5 w-3.5" />
                  {item.phone}
                </a>
              }
            />
            <Info
              label="Email"
              value={
                item.email ? (
                  <a href={`mailto:${item.email}`} className="text-brand hover:underline">
                    {item.email}
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <Info label="Type de problème" value={item.problem_type} />
            <div className="sm:col-span-2">
              <Info label="Adresse de l'intervention" value={item.address} />
            </div>
            <div className="sm:col-span-2">
              <Info label="Description" value={<p className="whitespace-pre-wrap">{item.description}</p>} />
            </div>
            <Info label="Reçu" value={`${formatFullDateTimeParis(item.created_at)} · ${item.source === "client" ? "formulaire client" : "saisie interne"}`} />
            {item.status === "a_reprogrammer" && item.rescheduled_at && (
              <Info label="Reprogrammé le" value={formatFullDateTimeParis(item.rescheduled_at)} />
            )}
          </dl>

          {item.photo_urls.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
                Photos ({item.photo_urls.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {item.photo_urls.map((url, i) =>
                  url ? (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-lg border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                    </a>
                  ) : null
                )}
              </div>
            </div>
          )}

          {rescheduling && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-3">
              <label className="text-sm font-medium text-ink">
                Nouvelle date et heure
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="mt-1 block h-9 rounded-lg border border-line bg-white px-2 text-sm"
                />
              </label>
              <Button
                size="lg"
                disabled={!when || busy}
                onClick={() => updateStatus("a_reprogrammer", fromDatetimeLocalValueParis(when))}
              >
                <Check /> Valider
              </Button>
              <Button size="lg" variant="ghost" onClick={() => setRescheduling(false)}>
                Annuler
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {archived ? (
              <Button size="lg" variant="outline" disabled={busy} onClick={() => updateStatus("a_traiter")}>
                <ArchiveRestore /> Désarchiver
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  disabled={busy}
                  onClick={() => updateStatus("resolu")}
                  title="Le SAV sera archivé"
                  className="bg-[#16a34a] text-white hover:bg-[#15803d]"
                >
                  <Check /> Résolu
                </Button>
                <Button size="lg" variant="outline" disabled={busy} onClick={() => setRescheduling((v) => !v)}>
                  <Calendar /> À reprogrammer
                </Button>
                <Button size="lg" variant="outline" disabled={busy || item.status === "absent"} onClick={() => updateStatus("absent")}>
                  <UserX /> Absent
                </Button>
              </>
            )}
            <Button size="lg" variant="outline" disabled={busy} onClick={() => photoInput.current?.click()}>
              <Camera /> Ajouter une photo
            </Button>
            {!archived && item.status !== "a_traiter" && (
              <Button size="lg" variant="ghost" disabled={busy} onClick={() => updateStatus("a_traiter")}>
                <RotateCcw /> Remettre à traiter
              </Button>
            )}
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => void addPhotos(e.target.files)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
