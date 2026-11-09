"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { DELEGATAIRE_GROUPS, CHANTIER_STATUS_FIELDS } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function DocumentsRecusFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [from, setFrom] = useState(searchParams.get("from") || "");
  const [to, setTo] = useState(searchParams.get("to") || "");

  const selectedDelegataires = searchParams.getAll("delegataire");
  const currentChantier = searchParams.get("chantier") || "";

  const buildParams = (overrides?: { delegataires?: string[]; chantier?: string; q?: string; from?: string; to?: string }) => {
    const params = new URLSearchParams();
    const delegataires = overrides?.delegataires ?? selectedDelegataires;
    const c = overrides?.chantier ?? currentChantier;
    const q = overrides?.q ?? search.trim();
    const f = overrides?.from ?? from;
    const t = overrides?.to ?? to;
    delegataires.forEach((d) => params.append("delegataire", d));
    if (c) params.set("chantier", c);
    if (q) params.set("q", q);
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    // Préservés à travers les changements de filtre ; `page` volontairement omis (retour page 1).
    const per = searchParams.get("per");
    if (per) params.set("per", per);
    return params;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/admin/documents-recus?${buildParams().toString()}`);
  };

  const handleDelegataireToggle = (delegataire: string) => {
    const newSelection = selectedDelegataires.includes(delegataire)
      ? selectedDelegataires.filter((d) => d !== delegataire)
      : [...selectedDelegataires, delegataire];
    router.push(`/admin/documents-recus?${buildParams({ delegataires: newSelection }).toString()}`);
  };

  const handleChantierChange = (chantier: string) => {
    router.push(`/admin/documents-recus?${buildParams({ chantier }).toString()}`);
  };

  const handleDateApply = () => {
    router.push(`/admin/documents-recus?${buildParams().toString()}`);
  };

  return (
    <div className="rounded-[14px] border border-line bg-white shadow-card p-4 flex flex-col gap-4">
      <form onSubmit={handleSearch} className="w-full flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, prénom ou téléphone..."
            className="pl-9 h-9 border-line rounded-[9px] text-ink placeholder:text-subtle"
          />
        </div>
        <Button type="submit" size="sm" className="h-9 shrink-0">
          Rechercher
        </Button>
      </form>

      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
        <span className="text-xs font-semibold text-subtle uppercase tracking-wide">Mandataire :</span>
        {DELEGATAIRE_GROUPS.map((d) => (
          <label key={d} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedDelegataires.includes(d)}
              onChange={() => handleDelegataireToggle(d)}
              className="rounded border-line text-brand focus:ring-brand/40"
            />
            <span className="text-sm text-ink">{d}</span>
          </label>
        ))}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selectedDelegataires.includes("__non_assigne__")}
            onChange={() => handleDelegataireToggle("__non_assigne__")}
            className="rounded border-line text-brand focus:ring-brand/40"
          />
          <span className="text-sm text-ink">Non assigné</span>
        </label>
        <select
          value={currentChantier}
          onChange={(e) => handleChantierChange(e.target.value)}
          className="h-9 px-3 py-1.5 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
        >
          <option value="">Statut chantier</option>
          {CHANTIER_STATUS_FIELDS.map(({ field, label }) => (
            <option key={field} value={field}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDateApply}
          className="h-9"
        >
          Appliquer dates
        </Button>
      </div>
    </div>
  );
}
