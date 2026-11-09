"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { LEAD_CATEGORIES, LEAD_CATEGORY_LABELS, type LeadCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface Telepro {
  id: string;
  full_name: string | null;
  email: string;
}

interface CsvImportFormProps {
  telepros: Telepro[];
}

export function CsvImportForm({ telepros }: CsvImportFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<LeadCategory>("fenetre");
  const [selectedTelepros, setSelectedTelepros] = useState<Set<string>>(
    new Set(telepros.map((t) => t.id))
  );
  const [teleproPercentages, setTeleproPercentages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported?: number;
    errors?: number;
    details?: string[];
    error?: string;
  } | null>(null);
  const router = useRouter();

  const toggleTelepro = (id: string) => {
    setSelectedTelepros((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setTeleproPercentages((p) => {
          const copy = { ...p };
          delete copy[id];
          return copy;
        });
      } else {
        next.add(id);
      }
      return next;
    });
    setValidationError(null);
  };

  const setPercentage = (id: string, value: string) => {
    setTeleproPercentages((prev) => ({ ...prev, [id]: value }));
    setValidationError(null);
  };

  const selectedList = Array.from(selectedTelepros);
  const hasAnyPercentage = selectedList.some((id) => {
    const v = teleproPercentages[id]?.trim();
    return v !== "" && v !== undefined;
  });

  const validatePercentages = (): Record<string, number> | null => {
    if (!hasAnyPercentage) return null;
    const percentages: Record<string, number> = {};
    let sum = 0;
    for (const id of selectedList) {
      const raw = teleproPercentages[id]?.trim() ?? "";
      const num = parseFloat(raw.replace(",", "."));
      if (raw === "" || isNaN(num) || num < 0 || num > 100) {
        return null;
      }
      percentages[id] = num;
      sum += num;
    }
    if (Math.abs(sum - 100) > 0.01) return null;
    return percentages;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (!file || selectedTelepros.size === 0) return;

    const validatedPercentages = validatePercentages();
    if (hasAnyPercentage && !validatedPercentages) {
      const sum = selectedList.reduce((s, id) => {
        const raw = teleproPercentages[id]?.trim() ?? "";
        const num = parseFloat(raw.replace(",", "."));
        return s + (isNaN(num) ? 0 : num);
      }, 0);
      setValidationError(
        sum === 0
          ? "Si vous utilisez les pourcentages, chaque télépro doit avoir un pourcentage renseigné."
          : `La somme des pourcentages doit être exactement 100% (actuellement ${sum.toFixed(1)}%).`
      );
      return;
    }

    setLoading(true);
    setResult(null);

    const text = await file.text();
    const firstLine = text.split("\n")[0] ?? "";
    const tabCount = (firstLine.match(/\t/g) ?? []).length;
    const commaCount = (firstLine.match(/,/g) ?? []).length;
    const delimiter = tabCount > commaCount ? "\t" : ",";
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter,
    });

    const res = await fetch("/api/import-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        rows: parsed.data,
        teleproIds: selectedList,
        teleproPercentages: validatedPercentages ?? undefined,
        category,
      }),
    });

    const data = await res.json();
    setLoading(false);
    setResult(data);
    router.refresh();

    if (data.error) {
      setValidationError(data.error);
    } else if (data.imported > 0) {
      setFile(null);
    }
  };

  const columnMapping: Record<string, string> = {
    first_name: "Prénom",
    last_name: "Nom",
    phone: "Téléphone",
    email: "Email",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-[14px] border border-line bg-white shadow-card p-6">
        <h2 className="font-semibold text-ink mb-2">
          Fichier CSV (format Meta Ads)
        </h2>
        <p className="text-sm text-subtle mb-4">
          Le fichier doit contenir des colonnes pour le prénom, nom (ou nom complet), téléphone
          et email. Formats supportés : first_name/last_name, full name (Meta Ads), prénom/nom,
          phone_number, email. D&apos;autres variantes sont détectées automatiquement.
        </p>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-subtle file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-soft file:text-brand-hover file:font-medium file:cursor-pointer hover:file:bg-brand-soft transition-colors"
        />
      </div>

      <div className="rounded-[14px] border border-line bg-white shadow-card p-6">
        <h2 className="font-semibold text-ink mb-2">
          Catégorie des leads importés
        </h2>
        <p className="text-sm text-subtle mb-4">
          Tous les leads de ce fichier seront enregistrés dans la catégorie
          choisie.
        </p>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as LeadCategory)}
          className="w-full px-3 py-2 border border-line rounded-lg text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
        >
          {LEAD_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {LEAD_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-[14px] border border-line bg-white shadow-card p-6">
        <h2 className="font-semibold text-ink mb-2">
          Télépros à qui attribuer les leads
        </h2>
        <p className="text-sm text-subtle mb-4">
          Désélectionnez les télépros absents pour ne pas leur attribuer de
          leads. Optionnel : renseignez un pourcentage pour chaque télépro pour
          répartir les leads proportionnellement. Si aucun pourcentage n&apos;est
          renseigné, la répartition est équitable.
        </p>
        {telepros.length === 0 ? (
          <p className="text-amber-600 text-sm">
            Aucun télépro. Créez des comptes télépro depuis l&apos;espace admin.
          </p>
        ) : (
          <div className="space-y-1">
            {telepros.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  selectedTelepros.has(t.id)
                    ? "hover:bg-panel"
                    : "opacity-50"
                }`}
              >
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={selectedTelepros.has(t.id)}
                    onChange={() => toggleTelepro(t.id)}
                    className="rounded border-line-strong accent-brand"
                  />
                  <span className="font-medium text-ink">
                    {t.full_name || t.email}
                  </span>
                  <span className="text-sm text-subtle">{t.email}</span>
                </label>
                {selectedTelepros.has(t.id) && (
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="%"
                      value={teleproPercentages[t.id] ?? ""}
                      onChange={(e) => setPercentage(t.id, e.target.value)}
                      className="w-16 px-2 py-1 text-sm border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
                    />
                    <span className="text-sm text-subtle">%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {hasAnyPercentage && (
          <p className="text-sm text-amber-600 mt-3">
            La somme des pourcentages doit être exactement 100%.
          </p>
        )}
      </div>

      {validationError && (
        <div className="p-4 rounded-lg bg-[#fee2e2] text-[#b91c1c] border border-[#fca5a5]">
          <p className="font-medium text-sm">{validationError}</p>
        </div>
      )}

      {result && !result.error && result.imported !== undefined && (
        <div
          className={`p-4 rounded-lg border ${
            (result.errors ?? 0) > 0
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : "bg-[#dcfce7] text-[#15803d] border-[#86efac]"
          }`}
        >
          <p className="font-medium text-sm">
            {result.imported} lead(s) importé(s)
            {(result.errors ?? 0) > 0 && `, ${result.errors} erreur(s)`}
          </p>
          {result.details && result.details.length > 0 && (
            <ul className="mt-2 text-sm list-disc list-inside">
              {result.details.slice(0, 10).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
              {result.details.length > 10 && (
                <li>... et {result.details.length - 10} autres</li>
              )}
            </ul>
          )}
        </div>
      )}

      <Button
        type="submit"
        disabled={loading || !file || selectedTelepros.size === 0}
        className="px-6"
      >
        {loading ? "Import en cours..." : "Importer"}
      </Button>
    </form>
  );
}
