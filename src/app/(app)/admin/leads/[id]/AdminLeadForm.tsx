"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LEAD_STATUS_LABELS,
  LEAD_COLOR_LABELS,
  INSTALLATION_TYPE_LABELS,
  ELECTRICITY_TYPE_LABELS,
  HEATING_MODE_LABELS,
  RADIATOR_TYPE_LABELS,
  RADIATOR_TYPE_OPTIONS,
  LEAD_COLOR_MPR,
  DELEGATAIRE_GROUPS,
  CHANTIER_STATUS_FIELDS,
  INSTALLATEUR_OPTIONS,
  LEAD_CATEGORIES,
  LEAD_CATEGORY_LABELS,
  type LeadStatus,
  type LeadColor,
  type InstallationType,
  type ElectricityType,
  type HeatingMode,
} from "@/lib/types";
import { usePostalCodeToCity } from "@/hooks/usePostalCodeToCity";
import {
  toDatetimeLocalValueParis,
  fromDatetimeLocalValueParis,
} from "@/lib/date";
import { MaterialCostSection, type SelectedMaterial } from "./MaterialCostSection";
import { useSaveOnLeave } from "@/contexts/SaveOnLeaveContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface AdminLeadFormProps {
  lead: Record<string, unknown>;
}

function buildUpdates(lead: Record<string, unknown>) {
  return {
    first_name: lead.first_name,
    last_name: lead.last_name,
    phone: lead.phone,
    email: lead.email,
    status: lead.status,
    callback_at: lead.status === "a_rappeler" && lead.callback_at ? lead.callback_at : null,
    surface_m2: lead.surface_m2 ? Number(lead.surface_m2) : null,
    revenu_fiscal_ref: lead.revenu_fiscal_ref ? Number(lead.revenu_fiscal_ref) : null,
    numero_fiscal: lead.numero_fiscal || null,
    date_of_birth: lead.date_of_birth || null,
    address: lead.address,
    postal_code: lead.postal_code,
    city: lead.city,
    heating_mode: lead.heating_mode,
    radiator_type: lead.radiator_type,
    color: lead.color,
    category: lead.category,
    is_owner: lead.is_owner,
    installation_type: lead.installation_type,
    electricity_type: lead.electricity_type,
    commentaire: lead.commentaire,
    doc_status: lead.doc_status,
    is_installe: lead.is_installe,
    is_depot_mpr: lead.is_depot_mpr,
    is_cee_paye: lead.is_cee_paye,
    is_mpe_paye: lead.is_mpe_paye,
    is_ssc_cee: lead.is_ssc_cee,
    is_pac_cee: lead.is_pac_cee,
    is_code_envoye: lead.is_code_envoye,
    is_depose: lead.is_depose,
    is_controle_veritas: lead.is_controle_veritas,
    is_paye: lead.is_paye,
    is_compte_bloque: lead.is_compte_bloque,
    is_rejete: lead.is_rejete,
    installation_cost: lead.installation_cost ? Number(lead.installation_cost) : null,
    material_cost: lead.material_cost ? Number(lead.material_cost) : null,
    material_cost_comment: lead.material_cost_comment,
    regie_cost: lead.regie_cost ? Number(lead.regie_cost) : 0,
    benefit_cee: lead.benefit_cee ? Number(lead.benefit_cee) : null,
    benefit_mpr: lead.benefit_mpr ? Number(lead.benefit_mpr) : null,
    benefit_apporteur_affaires: lead.benefit_apporteur_affaires ? Number(lead.benefit_apporteur_affaires) : null,
    profitability: lead.profitability ? Number(lead.profitability) : null,
    chantier_comment: lead.chantier_comment,
    delegataire_group: lead.delegataire_group,
    installateur: lead.installateur,
    updated_at: new Date().toISOString(),
  };
}

const SELECT_CLS =
  "h-9 w-full px-3 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40";

const CARD_CLS =
  "rounded-[14px] border border-line bg-white shadow-card p-5";

const SECTION_TITLE_CLS =
  "text-xs font-semibold text-subtle uppercase tracking-wide mb-4";

const LABEL_CLS = "block text-sm font-medium text-ink mb-1.5";

export function AdminLeadForm({ lead: initialLead }: AdminLeadFormProps) {
  const [lead, setLead] = useState(initialLead);
  const [selectedMaterials, setSelectedMaterials] = useState<SelectedMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leadRef = useRef(lead);
  const materialsRef = useRef<SelectedMaterial[]>([]);
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    materialsRef.current = selectedMaterials;
  }, [selectedMaterials]);

  useEffect(() => {
    // Navigation vers un autre lead : toujours synchroniser
    if (String(leadRef.current?.id) !== String(initialLead?.id)) {
      setLead(initialLead);
      lastSavedRef.current = JSON.stringify(buildUpdates(initialLead));
      return;
    }
    // Même lead : ne pas écraser si l'utilisateur a des modifications non sauvegardées
    const currentStr = JSON.stringify(buildUpdates(leadRef.current));
    if (currentStr === lastSavedRef.current) {
      setLead(initialLead);
      lastSavedRef.current = JSON.stringify(buildUpdates(initialLead));
    }
  }, [initialLead]);

  useEffect(() => {
    leadRef.current = lead;
  }, [lead]);

  const performSave = useCallback(async () => {
    const updates = buildUpdates(leadRef.current);
    setLoading(true);
    const res = await fetch(`/api/admin/lead/${leadRef.current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Lead-Form-Version": "2" },
      credentials: "include",
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      lastSavedRef.current = JSON.stringify(updates);
      window.dispatchEvent(new Event("lead-saved"));
      const materials = materialsRef.current;
      if (materials.length > 0) {
        await fetch(`/api/admin/leads/${leadRef.current.id}/materials`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Lead-Form-Version": "2" },
          credentials: "include",
          body: JSON.stringify({ materials }),
        });
      } else {
        await fetch(`/api/admin/leads/${leadRef.current.id}/materials`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Lead-Form-Version": "2" },
          credentials: "include",
          body: JSON.stringify({ materials: [] }),
        });
      }
      // Ne pas rappeler performSave() ici : buildUpdates() inclut updated_at: new Date()
      // donc la comparaison serait toujours différente et provoquerait une boucle infinie
      // (PATCH + PUT en continu). L'auto-save (scheduleAutoSave) gère les modifications
      // utilisateur après la fin de l'enregistrement.
    }
    setLoading(false);
  }, []);

  // Debounce 8s pour limiter les requêtes : une sauvegarde après 8s sans modification
  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      const updates = buildUpdates(leadRef.current);
      if (JSON.stringify(updates) !== lastSavedRef.current) {
        performSave();
      }
    }, 8000);
  }, [performSave]);

  useEffect(() => {
    lastSavedRef.current = JSON.stringify(buildUpdates(initialLead));
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const saveOnLeave = useSaveOnLeave();
  useEffect(() => {
    if (!saveOnLeave) return;
    const flush = async () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const updates = buildUpdates(leadRef.current);
      if (JSON.stringify(updates) !== lastSavedRef.current) {
        await performSave();
      }
    };
    return saveOnLeave.registerSaveOnLeave(flush);
  }, [saveOnLeave, performSave]);

  const updateField = (field: string, value: unknown) => {
    setLead((l) => ({ ...l, [field]: value }));
    if (field === "color" && value) {
      const mpr = LEAD_COLOR_MPR[value as LeadColor];
      if (mpr > 0) {
        setLead((l) => ({ ...l, benefit_mpr: mpr }));
      }
    }
    scheduleAutoSave();
  };

  const { fetchCity, isLoading: cityLoading } = usePostalCodeToCity(
    (lead.postal_code as string) || "",
    (city) => updateField("city", city)
  );

  useEffect(() => {
    const inst = (lead.installation_cost as number) || 0;
    const mat = (lead.material_cost as number) || 0;
    const reg = (lead.regie_cost as number) || 0;
    const cee = (lead.benefit_cee as number) || 0;
    const mpr = (lead.benefit_mpr as number) || 0;
    const profit = cee + mpr - inst - mat - reg;
    setLead((l) => ({ ...l, profitability: profit }));
  }, [
    lead.installation_cost,
    lead.material_cost,
    lead.regie_cost,
    lead.benefit_cee,
    lead.benefit_mpr,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const updates = buildUpdates(lead);
    setLoading(true);
    const res = await fetch(`/api/admin/lead/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Lead-Form-Version": "2" },
      credentials: "include",
      body: JSON.stringify(updates),
    });
    setLoading(false);
    if (res.ok) {
      lastSavedRef.current = JSON.stringify(updates);
      window.dispatchEvent(new Event("lead-saved"));
      router.refresh();
    }
  };

  const isDocumentsRecus = lead.status === "documents_recus" || lead.status === "ancien_documents_recus" || lead.status === "installe";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* ── Coordonnées ─────────────────────────────────── */}
      <div className={CARD_CLS}>
        <h2 className={SECTION_TITLE_CLS}>Coordonnées</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Prénom</label>
            <Input
              type="text"
              value={(lead.first_name as string) || ""}
              onChange={(e) => updateField("first_name", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Nom</label>
            <Input
              type="text"
              value={(lead.last_name as string) || ""}
              onChange={(e) => updateField("last_name", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Téléphone</label>
            <Input
              type="tel"
              value={(lead.phone as string) || ""}
              onChange={(e) => updateField("phone", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Email</label>
            <Input
              type="email"
              value={(lead.email as string) || ""}
              onChange={(e) => updateField("email", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Statut ──────────────────────────────────────── */}
      <div className={CARD_CLS}>
        <h2 className={SECTION_TITLE_CLS}>Statut</h2>
        <div className="space-y-3">
          <select
            value={(lead.status as string) || ""}
            onChange={(e) => updateField("status", e.target.value)}
            className="h-9 w-full max-w-xs px-3 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
          >
            {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {lead.status === "a_rappeler" && (
            <div>
              <label className={LABEL_CLS}>
                Date/heure rappel
              </label>
              <Input
                type="datetime-local"
                value={
                  lead.callback_at
                    ? toDatetimeLocalValueParis(lead.callback_at as string)
                    : ""
                }
                onChange={(e) => {
                  const iso = e.target.value ? fromDatetimeLocalValueParis(e.target.value) : "";
                  updateField("callback_at", iso || null);
                }}
                className="max-w-xs"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Profil & Logement ───────────────────────────── */}
      <div className={CARD_CLS}>
        <h2 className={SECTION_TITLE_CLS}>Profil & Logement</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Nombre de m²</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={(lead.surface_m2 as number) ?? ""}
              onChange={(e) =>
                updateField(
                  "surface_m2",
                  e.target.value ? parseFloat(e.target.value) : null
                )
              }
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Revenu fiscal de référence</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={(lead.revenu_fiscal_ref as number) ?? ""}
              onChange={(e) =>
                updateField(
                  "revenu_fiscal_ref",
                  e.target.value ? parseFloat(e.target.value) : null
                )
              }
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Numéro fiscal</label>
            <Input
              type="text"
              value={(lead.numero_fiscal as string) || ""}
              onChange={(e) => updateField("numero_fiscal", e.target.value || null)}
              placeholder="13 chiffres"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Date de naissance</label>
            <Input
              type="date"
              value={(lead.date_of_birth as string) || ""}
              onChange={(e) => updateField("date_of_birth", e.target.value || null)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Code postal</label>
            <Input
              type="text"
              value={(lead.postal_code as string) || ""}
              onChange={(e) => updateField("postal_code", e.target.value)}
              onBlur={fetchCity}
              placeholder="75001"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Ville</label>
            <Input
              type="text"
              value={(lead.city as string) || ""}
              onChange={(e) => updateField("city", e.target.value)}
              placeholder={cityLoading ? "Chargement…" : undefined}
              readOnly={cityLoading}
            />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL_CLS}>Adresse</label>
            <Input
              type="text"
              value={(lead.address as string) || ""}
              onChange={(e) => updateField("address", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Mode chauffage</label>
            <select
              value={(lead.heating_mode as string) || ""}
              onChange={(e) =>
                updateField("heating_mode", e.target.value || null)
              }
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
              data-testid="lead-category-select"
              value={(lead.category as string) || "fenetre"}
              onChange={(e) => updateField("category", e.target.value)}
              className={SELECT_CLS}
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
              value={(lead.color as string) || ""}
              onChange={(e) => updateField("color", e.target.value || null)}
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
            <label className={LABEL_CLS}>
              Propriétaire / Locataire
            </label>
            <select
              value={
                lead.is_owner === null
                  ? ""
                  : lead.is_owner
                  ? "owner"
                  : "tenant"
              }
              onChange={(e) =>
                updateField(
                  "is_owner",
                  e.target.value === "" ? null : e.target.value === "owner"
                )
              }
              className={SELECT_CLS}
            >
              <option value="">—</option>
              <option value="owner">Propriétaire</option>
              <option value="tenant">Locataire</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>
              Type installation
            </label>
            <select
              value={(lead.installation_type as string) || ""}
              onChange={(e) =>
                updateField("installation_type", e.target.value || null)
              }
              className={SELECT_CLS}
            >
              <option value="">—</option>
              {(Object.keys(INSTALLATION_TYPE_LABELS) as InstallationType[]).map(
                (t) => (
                  <option key={t} value={t}>
                    {INSTALLATION_TYPE_LABELS[t]}
                  </option>
                )
              )}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>
              Type d&apos;électricité
            </label>
            <select
              value={(lead.electricity_type as string) || ""}
              onChange={(e) =>
                updateField("electricity_type", e.target.value || null)
              }
              className={SELECT_CLS}
            >
              <option value="">—</option>
              {(Object.keys(ELECTRICITY_TYPE_LABELS) as ElectricityType[]).map(
                (t) => (
                  <option key={t} value={t}>
                    {ELECTRICITY_TYPE_LABELS[t]}
                  </option>
                )
              )}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={LABEL_CLS}>
              Type de radiateur
            </label>
            <div className="flex flex-wrap gap-4">
              {RADIATOR_TYPE_OPTIONS.map((t) => {
                const current = (lead.radiator_type as string[] | null) ?? [];
                const checked = current.includes(t);
                return (
                  <label key={t} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...current.filter((x) => x !== t), t]
                          : current.filter((x) => x !== t);
                        updateField("radiator_type", next.length ? next : null);
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
          value={(lead.commentaire as string) || ""}
          onChange={(e) => updateField("commentaire", e.target.value)}
          rows={3}
        />
      </div>

      {isDocumentsRecus && (
        <>
          {/* ── Statut chantier ─────────────────────────── */}
          <div className={CARD_CLS}>
            <h2 className={SECTION_TITLE_CLS}>
              Statut chantier (cumulables)
            </h2>
            <div className="flex flex-wrap gap-4">
              {CHANTIER_STATUS_FIELDS.map(({ field, label }) => (
                <label key={field} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!(lead[field as keyof typeof lead] as boolean)}
                    onChange={(e) => updateField(field, e.target.checked)}
                    className="rounded border-line accent-brand"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* ── Finances ────────────────────────────────── */}
          <div className={CARD_CLS}>
            <h2 className={SECTION_TITLE_CLS}>Finances</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>
                  Installateur
                </label>
                <select
                  value={(lead.installateur as string) || ""}
                  onChange={(e) => updateField("installateur", e.target.value || null)}
                  className={SELECT_CLS}
                >
                  <option value="">—</option>
                  {INSTALLATEUR_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Coût installation (€)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={(lead.installation_cost as number) || ""}
                  onChange={(e) =>
                    updateField(
                      "installation_cost",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                />
              </div>
              <div className="md:col-span-2">
                <MaterialCostSection
                  leadId={lead.id as string}
                  materialCost={(lead.material_cost as number) ?? null}
                  materialCostComment={(lead.material_cost_comment as string) || ""}
                  onMaterialCostChange={(v) => updateField("material_cost", v)}
                  onMaterialCostCommentChange={(v) =>
                    updateField("material_cost_comment", v)
                  }
                  onMaterialsChange={setSelectedMaterials}
                  selectedMaterials={selectedMaterials}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Coût régie (€)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={(lead.regie_cost as number) ?? 0}
                  onChange={(e) =>
                    updateField(
                      "regie_cost",
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Bénéfice CEE (€)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={(lead.benefit_cee as number) || ""}
                  onChange={(e) =>
                    updateField(
                      "benefit_cee",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                />
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Bénéfice MPR (€)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={(lead.benefit_mpr as number) || ""}
                  onChange={(e) =>
                    updateField(
                      "benefit_mpr",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                />
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Bénéfice apporteur d&apos;affaires (€)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={(lead.benefit_apporteur_affaires as number) || ""}
                  onChange={(e) =>
                    updateField(
                      "benefit_apporteur_affaires",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                />
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Rentabilité (€) — auto
                </label>
                <Input
                  type="text"
                  value={(lead.profitability as number)?.toFixed(2) ?? ""}
                  readOnly
                  className="bg-canvas cursor-default"
                />
              </div>
              <div className="md:col-span-2">
                <label className={LABEL_CLS}>
                  Commentaire chantier
                </label>
                <Textarea
                  value={(lead.chantier_comment as string) || ""}
                  onChange={(e) =>
                    updateField("chantier_comment", e.target.value)
                  }
                  rows={3}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Groupe délégataire
                </label>
                <select
                  value={(lead.delegataire_group as string) || ""}
                  onChange={(e) =>
                    updateField("delegataire_group", e.target.value || null)
                  }
                  className={SELECT_CLS}
                >
                  <option value="">—</option>
                  {DELEGATAIRE_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={loading} size="lg">
          {loading ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
