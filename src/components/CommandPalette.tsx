"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, User, Loader2, type LucideIcon } from "lucide-react";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/types";
import { startNavigationProgress } from "@/components/NavigationProgress";

export interface PaletteNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface LeadHit {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  city: string | null;
  postal_code: string | null;
  status: LeadStatus | null;
}

type Item =
  | { kind: "lead"; key: string; href: string; lead: LeadHit }
  | { kind: "page"; key: string; href: string; nav: PaletteNavItem };

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ouvre la palette depuis n'importe où (bouton du menu, etc.). */
export function openCommandPalette() {
  window.dispatchEvent(new Event("app:open-palette"));
}

/**
 * Recherche rapide : Ctrl+K (ou ⌘K) pour retrouver un lead par nom, téléphone,
 * ville ou e-mail, ou sauter directement à une page du menu.
 */
export function CommandPalette({
  nav,
  leadBasePath,
  canSearchLeads,
}: {
  nav: PaletteNavItem[];
  leadBasePath: string;
  canSearchLeads: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<LeadHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Raccourcis clavier globaux
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("app:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("app:open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [open]);

  // Recherche des leads (debounce + annulation des requêtes obsolètes)
  useEffect(() => {
    if (!open || !canSearchLeads) return;
    const q = query.trim();
    if (q.length < 2) {
      setLeads([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const json = await res.json();
        setLeads(Array.isArray(json.leads) ? json.leads : []);
        setActive(0);
      } catch {
        if (!ctrl.signal.aborted) setLeads([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open, canSearchLeads]);

  const items: Item[] = useMemo(() => {
    const q = normalize(query.trim());
    const pages = nav
      .filter((n) => !q || normalize(n.label).includes(q))
      .map<Item>((n) => ({ kind: "page", key: `p:${n.href}`, href: n.href, nav: n }));
    const leadItems = leads.map<Item>((l) => ({
      kind: "lead",
      key: `l:${l.id}`,
      href: `${leadBasePath}/${l.id}`,
      lead: l,
    }));
    return [...leadItems, ...pages];
  }, [nav, leads, query, leadBasePath]);

  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = useCallback(
    (item: Item | undefined, newTab = false) => {
      if (!item) return;
      if (newTab) {
        window.open(item.href, "_blank");
        return;
      }
      setOpen(false);
      setQuery("");
      startNavigationProgress(item.href);
      router.push(item.href);
    },
    [router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active], e.ctrlKey || e.metaKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  if (!open) return null;

  const firstPageIndex = items.findIndex((i) => i.kind === "page");
  const trimmed = query.trim();

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/30 backdrop-blur-[1px] p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Recherche rapide"
    >
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl ring-1 ring-line overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-line">
          <Search className="w-4 h-4 text-subtle shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={canSearchLeads ? "Rechercher un lead (nom, téléphone, ville…) ou une page" : "Aller à une page"}
            className="flex-1 h-12 bg-transparent outline-none text-sm text-ink placeholder:text-faint"
            aria-label="Recherche"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <Loader2 className="w-4 h-4 text-subtle animate-spin shrink-0" />}
          <kbd className="hidden sm:inline text-[10px] text-subtle border border-line rounded px-1.5 py-0.5">Échap</kbd>
        </div>

        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-2" role="listbox">
          {canSearchLeads && trimmed.length >= 2 && !loading && leads.length === 0 && (
            <li className="px-4 py-2 text-xs text-subtle">Aucun lead trouvé pour « {trimmed} ».</li>
          )}
          {canSearchLeads && trimmed.length < 2 && (
            <li className="px-4 py-2 text-xs text-subtle">Tapez au moins 2 caractères pour chercher un lead.</li>
          )}
          {leads.length > 0 && (
            <li className="px-4 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Leads</li>
          )}
          {items.map((item, idx) => (
            <PaletteRow
              key={item.key}
              item={item}
              index={idx}
              active={idx === active}
              header={idx === firstPageIndex}
              onHover={() => setActive(idx)}
              onSelect={(newTab) => go(item, newTab)}
            />
          ))}
        </ul>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-line text-[11px] text-subtle bg-canvas">
          <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> naviguer</span>
          <span className="inline-flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> ouvrir</span>
          <span>Ctrl + Entrée : nouvel onglet</span>
        </div>
      </div>
    </div>
  );
}

function PaletteRow({
  item,
  index,
  active,
  header,
  onHover,
  onSelect,
}: {
  item: Item;
  index: number;
  active: boolean;
  header: boolean;
  onHover: () => void;
  onSelect: (newTab: boolean) => void;
}) {
  const base = `mx-2 flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm ${
    active ? "bg-brand-soft text-ink" : "text-body"
  }`;
  const handlers = {
    "data-index": index,
    role: "option",
    "aria-selected": active,
    onMouseMove: onHover,
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault();
      onSelect(e.ctrlKey || e.metaKey || e.button === 1);
    },
  } as const;

  if (item.kind === "lead") {
    const l = item.lead;
    const name = [l.first_name, l.last_name].filter(Boolean).join(" ") || "Sans nom";
    const place = [l.postal_code, l.city].filter(Boolean).join(" ");
    return (
      <li {...handlers} className={base}>
        <User className="w-4 h-4 text-brand shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink truncate">{name}</div>
          <div className="text-xs text-subtle truncate">
            {[l.phone, place].filter(Boolean).join(" · ")}
          </div>
        </div>
        {l.status && (
          <span className="text-[11px] text-subtle shrink-0">{LEAD_STATUS_LABELS[l.status] ?? l.status}</span>
        )}
      </li>
    );
  }

  const Icon = item.nav.icon;
  return (
    <>
      {header && (
        <li className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint" aria-hidden="true">
          Pages
        </li>
      )}
      <li {...handlers} className={base}>
        <Icon className="w-4 h-4 text-subtle shrink-0" />
        <span className="truncate">{item.nav.label}</span>
      </li>
    </>
  );
}
