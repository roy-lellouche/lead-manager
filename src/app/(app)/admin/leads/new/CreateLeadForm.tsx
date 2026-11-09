"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LEAD_COLOR_LABELS,
  INSTALLATION_TYPE_LABELS,
  ELECTRICITY_TYPE_LABELS,
  HEATING_MODE_LABELS,
  RADIATOR_TYPE_LABELS,
  RADIATOR_TYPE_OPTIONS,
  LEAD_CATEGORIES,
  LEAD_CATEGORY_LABELS,
  type LeadColor,
  type InstallationType,
  type ElectricityType,
  type HeatingMode,
} from "@/lib/types";
import { usePostalCodeToCity } from "@/hooks/usePostalCodeToCity";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Telepro {
  id: string;
  full_name?: string | null;
  email: string;
}

interface CreateLeadFormProps {
  telepros: Telepro[];
}

const SELECT_CLS =
  "h-9 w-full px-3 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40";

const CARD_CLS =
  "rounded-[14px] border border-line bg-white shadow-card p-5";

const SECTION_TITLE_CLS =
  "text-xs font-semibold text-subtle uppercase tracking-wide mb-4";

const LABEL_CLS = "block text-sm font-medium text-ink mb-1.5";

export function CreateLeadForm({ telepros }: CreateLeadFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    assigned_to: "",
    address: "",
    postal_code: "",
    city: "",
    surface_m2: "",
    revenu_fiscal_ref: "",
    numero_fiscal: "",
    date_of_birth: "",
    heating_mode: "",
    color: "",
    category: "fenetre",
    is_owner: "",
    installation_type: "",
    electricity_type: "",
    radiator_type: [] as string[],
    commentaire: "",
  });

  const update = (field: string, value: string | string[]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  };

  const { fetchCity, isLoading: cityLoading } = usePostalCodeToCity(
    form.postal_code,
    (city) => update("city", city)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.first_name.trim() || !form.last_name.trim() || !form.phone.trim()) {
      setError("Prénom, nom et téléphone sont requis.");
      return;
    }
    if (!form.assigned_to) {
      setError("Veuillez sélectionner un télépro.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/admin/create-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...form,
        surface_m2: form.surface_m2 ? parseFloat(form.surface_m2) : null,
        revenu_fiscal_ref: form.revenu_fiscal_ref ? parseFloat(form.revenu_fiscal_ref) : null,
        numero_fiscal: form.numero_fiscal?.trim() || null,
        date_of_birth: form.date_of_birth?.trim() || null,
        is_owner: form.is_owner === "" ? null : form.is_owner === "owner",
        radiator_type: Array.isArray(form.radiator_type) && form.radiator_type.length > 0 ? form.radiator_type : null,
      }),
    });
    setLoading(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Erreur lors de la création");
      return;
    }
    router.push(`/admin/leads/${data.id}`);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="lead-create-form">

      {error && (
        <div className="p-3 rounded-[9px] border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ── Télépro assigné ──────────────────────────────── */}
      <div className={CARD_CLS}>
        <h2 className={SECTION_TITLE_CLS}>Télépro assigné *</h2>
        <select
          value={form.assigned_to}
          onChange={(e) => update("assigned_to", e.target.value)}
          className={SELECT_CLS}
          required
          data-testid="lead-assigned-to"
        >
          <option value="">— Sélectionner —</option>
          {telepros.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name || t.email}
            </option>
          ))}
          <option value="__manual_roy">Roy</option>
          <option value="__manual_noemie">Noémie</option>
        </select>
      </div>

      {/* ── Coordonnées ─────────────────────────────────── */}
      <div className={CARD_CLS}>
        <h2 className={SECTION_TITLE_CLS}>Coordonnées</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Prénom *</label>
            <Input
              type="text"
              value={form.first_name}
              onChange={(e) => update("first_name", e.target.value)}
              required
              data-testid="lead-first-name"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Nom *</label>
            <Input
              type="text"
              value={form.last_name}
              onChange={(e) => update("last_name", e.target.value)}
              required
              data-testid="lead-last-name"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Téléphone *</label>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              required
              data-testid="lead-phone"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Email</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Localisation & Profil ───────────────────────── */}
      <div className={CARD_CLS}>
        <h2 className={SECTION_TITLE_CLS}>Localisation &amp; Profil</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Nombre de m²</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.surface_m2}
              onChange={(e) => update("surface_m2", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Revenu fiscal de référence</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.revenu_fiscal_ref}
              onChange={(e) => update("revenu_fiscal_ref", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Numéro fiscal</label>
            <Input
              type="text"
              value={form.numero_fiscal}
              onChange={(e) => update("numero_fiscal", e.target.value)}
              placeholder="13 chiffres"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Date de naissance</label>
            <Input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => update("date_of_birth", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Code postal</label>
            <Input
              type="text"
              value={form.postal_code}
              onChange={(e) => update("postal_code", e.target.value)}
              onBlur={fetchCity}
              placeholder="75001"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Ville</label>
            <Input
              type="text"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder={cityLoading ? "Chargement…" : undefined}
              readOnly={cityLoading}
            />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL_CLS}>Adresse postale</label>
            <Input
              type="text"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Mode chauffage</label>
            <select
              value={form.heating_mode}
              onChange={(e) => update("heating_mode", e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">—</option>
              {(Object.keys(HEATING_MODE_LABELS) as HeatingMode[]).map((m) => (
                <option key={m} value={m}>
                  {HEATING_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Catégorie</label>
            <select
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              className={SELECT_CLS}
              data-testid="lead-category-select"
            >
              {LEAD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {LEAD_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Couleur</label>
            <select
              value={form.color}
              onChange={(e) => update("color", e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">—</option>
              {(Object.keys(LEAD_COLOR_LABELS) as LeadColor[]).map((c) => (
                <option key={c} value={c}>
                  {LEAD_COLOR_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Propriétaire / Locataire</label>
            <select
              value={form.is_owner}
              onChange={(e) => update("is_owner", e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">—</option>
              <option value="owner">Propriétaire</option>
              <option value="tenant">Locataire</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Type d&apos;installation</label>
            <select
              value={form.installation_type}
              onChange={(e) => update("installation_type", e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">—</option>
              {(Object.keys(INSTALLATION_TYPE_LABELS) as InstallationType[]).map((t) => (
                <option key={t} value={t}>
                  {INSTALLATION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Type d&apos;électricité</label>
            <select
              value={form.electricity_type}
              onChange={(e) => update("electricity_type", e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">—</option>
              {(Object.keys(ELECTRICITY_TYPE_LABELS) as ElectricityType[]).map((t) => (
                <option key={t} value={t}>
                  {ELECTRICITY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={LABEL_CLS}>Type de radiateur</label>
            <div className="flex flex-wrap gap-4">
              {RADIATOR_TYPE_OPTIONS.map((t) => {
                const current = form.radiator_type ?? [];
                const checked = current.includes(t);
                return (
                  <label key={t} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...current.filter((x) => x !== t), t]
                          : current.filter((x) => x !== t);
                        update("radiator_type", next);
                      }}
                      className="rounded border-line accent-brand"
                    />
                    {RADIATOR_TYPE_LABELS[t]}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Commentaire ─────────────────────────────────── */}
      <div className={CARD_CLS}>
        <h2 className={SECTION_TITLE_CLS}>Commentaire</h2>
        <Textarea
          value={form.commentaire}
          onChange={(e) => update("commentaire", e.target.value)}
          rows={3}
        />
      </div>

      <Button type="submit" disabled={loading} size="lg">
        {loading ? "Création..." : "Créer le lead"}
      </Button>
    </form>
  );
}
