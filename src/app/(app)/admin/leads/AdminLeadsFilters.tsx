"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { Search } from "lucide-react";
import { LEAD_STATUS_LABELS, LEAD_STATUSES_ADMIN, CHANTIER_STATUS_FIELDS, DELEGATAIRE_GROUPS, LEAD_CATEGORIES, LEAD_CATEGORY_LABELS } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SurfaceFilter } from "@/components/ui-kit/SurfaceFilter";
import { SURFACE_MAX_PARAM, SURFACE_MIN_PARAM } from "@/lib/surface-filter";

interface Telepro {
  id: string;
  full_name?: string | null;
  email: string;
  label?: string;
}

interface AdminLeadsFiltersProps {
  basePath?: string;
  telepros?: Telepro[];
}

export function AdminLeadsFilters({ basePath = "/admin/leads", telepros = [] }: AdminLeadsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");

  const currentStatus = searchParams.get("status") || "";
  const currentCategory = searchParams.get("category") || "";
  const currentTelepro = searchParams.get("telepro") || "";
  const currentChantier = searchParams.get("chantier") || "";
  const currentDelegataire = searchParams.get("delegataire") || "";
  const currentM2Min = searchParams.get(SURFACE_MIN_PARAM) || "";
  const currentM2Max = searchParams.get(SURFACE_MAX_PARAM) || "";
  const [from, setFrom] = useState(searchParams.get("from") || "");
  const [to, setTo] = useState(searchParams.get("to") || "");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const urlQ = searchParams.get("q") || "";
  const urlFrom = searchParams.get("from") || "";
  const urlTo = searchParams.get("to") || "";

  useEffect(() => {
    if (document.activeElement !== searchInputRef.current) {
      setSearch(urlQ);
    }
  }, [urlQ]);

  useEffect(() => {
    setFrom(urlFrom);
    setTo(urlTo);
  }, [urlFrom, urlTo]);

  const buildParams = useCallback((overrides?: { status?: string; telepro?: string; chantier?: string; delegataire?: string; q?: string; from?: string; to?: string; category?: string; m2Min?: string; m2Max?: string }) => {
    const params = new URLSearchParams();
    const s = overrides?.status ?? currentStatus;
    const t = overrides?.telepro ?? currentTelepro;
    const c = overrides?.chantier ?? currentChantier;
    const d = overrides?.delegataire ?? currentDelegataire;
    const cat = overrides?.category ?? currentCategory;
    const q = overrides?.q ?? search.trim();
    const f = overrides?.from ?? from;
    const toVal = overrides?.to ?? to;
    const m2Min = overrides?.m2Min ?? currentM2Min;
    const m2Max = overrides?.m2Max ?? currentM2Max;
    if (s) params.set("status", s);
    if (t) params.set("telepro", t);
    if (c) params.set("chantier", c);
    if (d) params.set("delegataire", d);
    if (cat) params.set("category", cat);
    if (q) params.set("q", q);
    if (f) params.set("from", f);
    if (toVal) params.set("to", toVal);
    if (m2Min) params.set(SURFACE_MIN_PARAM, m2Min);
    if (m2Max) params.set(SURFACE_MAX_PARAM, m2Max);
    // Préservés à travers les changements de filtre.
    // `installation_type` n'a pas de contrôle dans ce panneau, mais la page le lit et filtre
    // dessus : les liens des stats (/admin/stats) arrivent avec. Sans cette préservation, il
    // disparaissait silencieusement dès le premier changement de filtre.
    const installationType = searchParams.get("installation_type");
    if (installationType) params.set("installation_type", installationType);
    const per = searchParams.get("per");
    if (per) params.set("per", per);
    const sort = searchParams.get("sort");
    if (sort) params.set("sort", sort);
    const dir = searchParams.get("dir");
    if (dir) params.set("dir", dir);
    // `page` est volontairement omis : changer un filtre ramène en page 1.
    return params;
  }, [currentStatus, currentTelepro, currentChantier, currentDelegataire, search, from, to, currentCategory, currentM2Min, currentM2Max, searchParams]);

  // Recherche automatique avec debounce (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = search.trim();
      const currentQ = searchParams.get("q") || "";
      if (q !== currentQ) {
        router.push(`${basePath}?${buildParams({ q }).toString()}`);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, basePath, router, buildParams, searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`${basePath}?${buildParams().toString()}`);
  };

  const handleStatusChange = (status: string) => {
    router.push(`${basePath}?${buildParams({ status }).toString()}`);
  };

  const handleCategoryChange = (category: string) => {
    router.push(`${basePath}?${buildParams({ category }).toString()}`);
  };

  const handleTeleproChange = (teleproId: string) => {
    router.push(`${basePath}?${buildParams({ telepro: teleproId }).toString()}`);
  };

  const handleChantierChange = (chantier: string) => {
    router.push(`${basePath}?${buildParams({ chantier }).toString()}`);
  };

  const handleDateApply = () => {
    router.push(`${basePath}?${buildParams().toString()}`);
  };

  return (
    <div className="rounded-[14px] border border-line bg-white shadow-card p-4 flex flex-col gap-4">
      <form onSubmit={handleSearch} className="w-full flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
          <Input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, prénom, téléphone ou email..."
            className="pl-9 h-9 border-line rounded-[9px] text-ink placeholder:text-subtle"
            data-testid="filter-search"
          />
        </div>
        <Button type="submit" size="sm" className="h-9 shrink-0">
          Rechercher
        </Button>
      </form>
      {basePath === "/admin/leads" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Catégorie</label>
            <select
              value={currentCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full h-9 px-3 py-1.5 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
              data-testid="filter-category"
            >
              <option value="">Toutes les catégories</option>
              {LEAD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {LEAD_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Statut</label>
            <select
              value={currentStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full h-9 px-3 py-1.5 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
              data-testid="filter-status"
            >
              <option value="">Tous les statuts</option>
              {LEAD_STATUSES_ADMIN.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Télépro</label>
            <select
              value={currentTelepro}
              onChange={(e) => handleTeleproChange(e.target.value)}
              className="w-full h-9 px-3 py-1.5 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
            >
              <option value="">Tous les télépros</option>
              {telepros.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label ?? t.full_name ?? t.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Chantier</label>
            <select
              value={currentChantier}
              onChange={(e) => handleChantierChange(e.target.value)}
              className="w-full h-9 px-3 py-1.5 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
            >
              <option value="">Statut chantier</option>
              {CHANTIER_STATUS_FIELDS.map(({ field, label }) => (
                <option key={field} value={field}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Mandataire</label>
            <select
              value={currentDelegataire}
              onChange={(e) => router.push(`${basePath}?${buildParams({ delegataire: e.target.value }).toString()}`)}
              className="w-full h-9 px-3 py-1.5 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
            >
              <option value="">Tous les mandataires</option>
              {DELEGATAIRE_GROUPS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              <option value="__non_assigne__">Non assigné</option>
            </select>
          </div>
          <SurfaceFilter
            min={currentM2Min}
            max={currentM2Max}
            onApply={(m2Min, m2Max) => router.push(`${basePath}?${buildParams({ m2Min, m2Max }).toString()}`)}
          />
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Du</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 border-line rounded-[9px] text-ink"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Au</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 border-line rounded-[9px] text-ink"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleDateApply}
              className="w-full h-9"
            >
              Appliquer dates
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
