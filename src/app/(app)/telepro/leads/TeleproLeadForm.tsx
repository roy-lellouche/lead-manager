"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUSES_TELEPRO_SELECTABLE,
  LEAD_COLOR_LABELS_SIMPLE,
  INSTALLATION_TYPE_LABELS,
  ELECTRICITY_TYPE_LABELS,
  HEATING_MODE_LABELS,
  RADIATOR_TYPE_LABELS,
  RADIATOR_TYPE_OPTIONS,
  LEAD_CATEGORIES,
  LEAD_CATEGORY_LABELS,
  type LeadStatus,
  type LeadColor,
  type InstallationType,
  type ElectricityType,
  type HeatingMode,
} from "@/lib/types";
import {
  toDatetimeLocalValueParis,
  fromDatetimeLocalValueParis,
} from "@/lib/date";
import { usePostalCodeToCity } from "@/hooks/usePostalCodeToCity";
import { useSaveOnLeave } from "@/contexts/SaveOnLeaveContext";
import { TeleproDocumentsSection } from "./TeleproDocumentsSection";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const CARD_CLS =
  "rounded-[14px] border border-line bg-white shadow-card p-5";
const SECTION_TITLE_CLS =
  "text-xs font-semibold text-subtle uppercase tracking-wide mb-4";
const LABEL_CLS = "block text-sm font-medium text-ink mb-1.5";
const SELECT_CLS =
  "h-9 w-full px-3 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40";

interface TeleproDoc {
  id: string;
  type: string;
  file_name: string;
  storage_path: string;
  created_at: string;
}

interface TeleproLeadFormProps {
  lead: Record<string, unknown>;
  leadId: string;
  /** Documents télépro (taxe foncière, avis d'imposition) - affiche la section upload */
  teleproDocuments?: TeleproDoc[];
  /** En mode téléprospection : ID du lead suivant pour navigation */
  nextLeadId?: string | null;
  /** En mode téléprospection : callback après changement de statut */
  onStatusChangeSuccess?: (nextId: string | null) => void;
  /** En mode téléprospection : callback après NRP */
  onNrpClickSuccess?: (nextId: string | null) => void;
  /** Masquer la section statut (affichée ailleurs, ex. mode téléprospection) */
  hideStatusSection?: boolean;
}

export function TeleproLeadForm({
  lead: initialLead,
  leadId,
  teleproDocuments = [],
  nextLeadId,
  onStatusChangeSuccess,
  onNrpClickSuccess,
  hideStatusSection = false,
}: TeleproLeadFormProps) {
  const [lead, setLead] = useState<Record<string, unknown>>(initialLead);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leadRef = useRef(lead);
  const lastSavedRef = useRef<string>("");
  const pendingSaveRef = useRef(false);
  const savingRef = useRef(false);
  const scheduleAutoSaveRef = useRef<() => void>(() => {});

  const pickLeadFields = (l: Record<string, unknown>) => ({
    first_name: l.first_name,
    last_name: l.last_name,
    phone: l.phone,
    email: l.email,
    surface_m2: l.surface_m2,
    revenu_fiscal_ref: l.revenu_fiscal_ref,
    numero_fiscal: l.numero_fiscal,
    date_of_birth: l.date_of_birth,
    address: l.address,
    postal_code: l.postal_code,
    city: l.city,
    heating_mode: l.heating_mode,
    radiator_type: l.radiator_type,
    color: l.color,
    category: l.category,
    is_owner: l.is_owner,
    installation_type: l.installation_type,
    electricity_type: l.electricity_type,
    commentaire: l.commentaire,
  });

  useEffect(() => {
    if (String(initialLead?.id) !== leadId) return;
    // Navigation vers un autre lead : toujours synchroniser
    if (String(leadRef.current?.id) !== leadId) {
      setLead(initialLead);
      leadRef.current = initialLead;
      lastSavedRef.current = JSON.stringify(pickLeadFields(initialLead));
      return;
    }
    // Même lead : ne pas écraser si l'utilisateur a des modifications non sauvegardées
    const currentStr = JSON.stringify(pickLeadFields(leadRef.current));
    if (currentStr === lastSavedRef.current) {
      setLead(initialLead);
      leadRef.current = initialLead;
      lastSavedRef.current = JSON.stringify(pickLeadFields(initialLead));
    }
  }, [leadId, initialLead]);

  useEffect(() => {
    leadRef.current = lead;
  }, [lead]);

  const handleFieldChange = (field: string, value: unknown) => {
    const newLead = { ...leadRef.current, [field]: value };
    leadRef.current = newLead;
    setLead(newLead);
    scheduleAutoSave();
  };

  const { fetchCity, isLoading: cityLoading } = usePostalCodeToCity(
    (lead.postal_code as string) || "",
    (city) => handleFieldChange("city", city)
  );

  const performSave = useCallback(async (data: Record<string, unknown>, redirectAfter: boolean) => {
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const dataToSave = JSON.stringify(data);
    const res = await fetch(`/api/telepro/lead/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    savingRef.current = false;
    setSaving(false);
    if (res.ok) {
      lastSavedRef.current = dataToSave;
      pendingSaveRef.current = false;
      if (redirectAfter) {
        router.push("/telepro/leads");
      } else {
        router.refresh();
      }
      // Ne pas rappeler performSave ici : une comparaison JSON peut varier (ordre des clés)
      // et provoquer une boucle. L'auto-save et le save-on-leave gèrent les modifications.
    } else if (pendingSaveRef.current) {
      pendingSaveRef.current = false;
      scheduleAutoSaveRef.current();
    }
  }, [leadId, router]);

  // Debounce 8s pour limiter les requêtes : une sauvegarde après 8s sans modification
  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      const data = pickLeadFields(leadRef.current);
      const dataStr = JSON.stringify(data);
      if (dataStr !== lastSavedRef.current) {
        performSave(data, false);
      }
    }, 8000);
  }, [performSave]);

  useEffect(() => {
    scheduleAutoSaveRef.current = scheduleAutoSave;
  }, [scheduleAutoSave]);

  useEffect(() => {
    lastSavedRef.current = JSON.stringify(pickLeadFields(initialLead));
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
      const data = pickLeadFields(leadRef.current);
      if (JSON.stringify(data) !== lastSavedRef.current) {
        await performSave(data, false);
      }
    };
    return saveOnLeave.registerSaveOnLeave(flush);
  }, [saveOnLeave, performSave]);

  const handleStatusChange = async (newStatus: LeadStatus, callbackAt?: string) => {
    if (!lead || saving) return;
    setSaving(true);

    const updates = {
      status: newStatus,
      callback_at: newStatus === "a_rappeler" && callbackAt ? callbackAt : null,
    };

    const res = await fetch(`/api/telepro/lead/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...updates,
        logAction: "Changement de statut",
        logOldStatus: lead.status,
        logNewStatus: newStatus,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setLead((l) => ({ ...l, ...updates }));
      if (onStatusChangeSuccess) {
        onStatusChangeSuccess(nextLeadId ?? null);
      } else {
        router.refresh();
      }
    }
  };

  const handleNrpClick = async () => {
    if (!lead || saving) return;
    setSaving(true);

    const newCount = ((lead.nrp_count as number) || 0) + 1;
    const res = await fetch(`/api/telepro/lead/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        nrp_count: newCount,
        logAction: "NRP - Lead rappelé sans réponse",
        logOldStatus: "nrp",
        logNewStatus: "nrp",
      }),
    });

    setSaving(false);
    if (res.ok) {
      setLead((l) => ({ ...l, nrp_count: newCount }));
      if (onNrpClickSuccess) {
        onNrpClickSuccess(nextLeadId ?? null);
      } else {
        router.refresh();
      }
    }
  };

  const handleSave = async () => {
    if (!lead || saving) return;
    const data = pickLeadFields(lead);
    await performSave(data, true);
  };

  return (
    <div className="space-y-4">

      {/* ── Coordonnées ─────────────────────────────────── */}
      <div className={CARD_CLS}>
        <h2 className={SECTION_TITLE_CLS}>Coordonnées</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Prénom</label>
            <Input
              type="text"
              value={(lead.first_name as string) || ""}
              onChange={(e) => handleFieldChange("first_name", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Nom</label>
            <Input
              type="text"
              value={(lead.last_name as string) || ""}
              onChange={(e) => handleFieldChange("last_name", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Téléphone</label>
            <Input
              type="tel"
              value={(lead.phone as string) || ""}
              onChange={(e) => handleFieldChange("phone", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Email</label>
            <Input
              type="email"
              value={(lead.email as string) || ""}
              onChange={(e) => handleFieldChange("email", e.target.value)}
            />
          </div>
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
                handleFieldChange(
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
                handleFieldChange(
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
              onChange={(e) => handleFieldChange("numero_fiscal", e.target.value || null)}
              placeholder="13 chiffres"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Date de naissance</label>
            <Input
              type="date"
              value={(lead.date_of_birth as string) || ""}
              onChange={(e) => handleFieldChange("date_of_birth", e.target.value || null)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Code postal</label>
            <Input
              type="text"
              value={(lead.postal_code as string) || ""}
              onChange={(e) => handleFieldChange("postal_code", e.target.value)}
              onBlur={fetchCity}
              placeholder="75001"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Ville</label>
            <Input
              type="text"
              value={(lead.city as string) || ""}
              onChange={(e) => handleFieldChange("city", e.target.value)}
              placeholder={cityLoading ? "Chargement…" : undefined}
              readOnly={cityLoading}
            />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL_CLS}>Adresse postale</label>
            <Input
              type="text"
              value={(lead.address as string) || ""}
              onChange={(e) => handleFieldChange("address", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Mode chauffage</label>
            <select
              value={(lead.heating_mode as string) || ""}
              onChange={(e) =>
                handleFieldChange("heating_mode", e.target.value || null)
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
              value={(lead.category as string) || "fenetre"}
              onChange={(e) => handleFieldChange("category", e.target.value)}
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
              onChange={(e) =>
                handleFieldChange("color", e.target.value || null)
              }
              className={SELECT_CLS}
            >
              <option value="">—</option>
              {(Object.keys(LEAD_COLOR_LABELS_SIMPLE) as LeadColor[]).map((c) => (
                <option key={c} value={c}>
                  {LEAD_COLOR_LABELS_SIMPLE[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Propriétaire / Locataire</label>
            <select
              value={
                lead.is_owner === null
                  ? ""
                  : lead.is_owner
                  ? "owner"
                  : "tenant"
              }
              onChange={(e) =>
                handleFieldChange(
                  "is_owner",
                  e.target.value === ""
                    ? null
                    : e.target.value === "owner"
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
            <label className={LABEL_CLS}>Type d&apos;installation</label>
            <select
              value={(lead.installation_type as string) || ""}
              onChange={(e) =>
                handleFieldChange("installation_type", e.target.value || null)
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
            <label className={LABEL_CLS}>Type d&apos;électricité</label>
            <select
              value={(lead.electricity_type as string) || ""}
              onChange={(e) =>
                handleFieldChange("electricity_type", e.target.value || null)
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
            <label className={LABEL_CLS}>Type de radiateur</label>
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
                        handleFieldChange("radiator_type", next.length ? next : null);
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
          onChange={(e) => handleFieldChange("commentaire", e.target.value)}
          rows={3}
        />
      </div>

      {/* ── Statut ──────────────────────────────────────── */}
      {!hideStatusSection && (
        <div className={CARD_CLS}>
          <h2 className={SECTION_TITLE_CLS}>Statut</h2>
          <div className="flex flex-wrap gap-2">
            {LEAD_STATUSES_TELEPRO_SELECTABLE.map((s) => (
              <StatusButton
                key={s}
                status={s}
                currentStatus={lead.status as LeadStatus}
                initialCallbackAt={lead.callback_at as string | null | undefined}
                onSelect={(callbackAt) =>
                  handleStatusChange(s, callbackAt)
                }
                disabled={saving}
              />
            ))}
          </div>
          {(lead.status as string) === "nrp" && (
            <button
              type="button"
              onClick={handleNrpClick}
              disabled={saving}
              className="mt-3 px-4 py-2 bg-[#fef9c3] text-[#a16207] rounded-[9px] hover:bg-[#fef08a] text-sm font-medium disabled:opacity-50"
            >
              Toujours NRP (appelé {(lead.nrp_count as number) || 0} fois)
            </button>
          )}
        </div>
      )}

      <TeleproDocumentsSection
        leadId={leadId}
        documents={teleproDocuments}
      />

      <div className="flex justify-end pt-1">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          size="lg"
        >
          {saving ? "Enregistrement..." : "Enregistrer et retour aux leads"}
        </Button>
      </div>
    </div>
  );
}

function getDefaultCallbackDatetime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  d.setMinutes(0);
  return toDatetimeLocalValueParis(d.toISOString());
}

function getStatusButtonClass(status: LeadStatus, isSelected: boolean): string {
  if (!isSelected) return "border border-line text-subtle hover:border-brand/40 hover:text-brand";
  switch (status) {
    case "nouveau": return "bg-slate-100 text-slate-700 border border-slate-200";
    case "nrp": return "bg-[#fef9c3] text-[#a16207] border border-[#fde68a]";
    case "a_rappeler": return "bg-[#ffedd5] text-[#c2410c] border border-[#fed7aa]";
    case "en_attente_doc": return "bg-[#ede9fe] text-[#6d28d9] border border-[#ddd6fe]";
    case "documents_recus": return "bg-[#e0e7ff] text-[#1a40ad] border border-[#c4d3fb]";
    case "devis_a_envoyer": return "bg-[#f3e8ff] text-[#7e22ce] border border-[#e9d5ff]";
    case "devis_envoye": return "bg-[#fce7f3] text-[#be185d] border border-[#f9a8d4]";
    case "incomplet": return "bg-[#fef3c7] text-[#b45309] border border-[#fde68a]";
    case "bloque_mpr": return "bg-[#fee2e2] text-[#b91c1c] border border-[#fecaca]";
    case "valide": return "bg-[#dcfce7] text-[#15803d] border border-[#bbf7d0]";
    case "installe": return "bg-[#ccfbf1] text-[#0f766e] border border-[#99f6e4]";
    case "ancien_documents_recus": return "bg-slate-100 text-slate-500 border border-slate-200";
    case "transfert": return "bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]";
    case "annule": return "bg-[#fee2e2] text-[#b91c1c] border border-[#fecaca]";
    default: return "bg-slate-100 text-slate-700 border border-slate-200";
  }
}

function StatusButton({
  status,
  currentStatus,
  initialCallbackAt,
  onSelect,
  disabled,
}: {
  status: LeadStatus;
  currentStatus: LeadStatus;
  initialCallbackAt?: string | null;
  onSelect: (callbackAt?: string) => void;
  disabled: boolean;
}) {
  const isAlreadyRappeler = currentStatus === "a_rappeler";
  const [showCallback, setShowCallback] = useState(isAlreadyRappeler);
  const [callbackAt, setCallbackAt] = useState(() =>
    initialCallbackAt ? toDatetimeLocalValueParis(initialCallbackAt) : getDefaultCallbackDatetime()
  );

  useEffect(() => {
    if (initialCallbackAt) {
      setCallbackAt(toDatetimeLocalValueParis(initialCallbackAt));
    }
  }, [initialCallbackAt]);

  const handleSaveCallback = () => {
    if (!callbackAt) return;
    const iso = fromDatetimeLocalValueParis(callbackAt);
    if (!iso) return;
    onSelect(iso);
    setShowCallback(false);
  };

  if (status === "a_rappeler") {
    return (
      <div className="inline-block">
        {showCallback && (
          <div className="flex gap-2 items-center">
            <input
              type="datetime-local"
              value={callbackAt}
              onChange={(e) => setCallbackAt(e.target.value)}
              className="h-9 px-3 border border-line rounded-[9px] text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
            <button
              type="button"
              onClick={handleSaveCallback}
              disabled={disabled || !callbackAt}
              className="px-4 h-9 bg-brand text-white rounded-[9px] text-sm font-medium hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              OK
            </button>
            {!isAlreadyRappeler && (
              <button
                type="button"
                onClick={() => setShowCallback(false)}
                className="text-subtle text-sm hover:text-ink"
              >
                Annuler
              </button>
            )}
          </div>
        )}
        {!showCallback && (
          <button
            type="button"
            onClick={() => setShowCallback(true)}
            disabled={disabled}
            className={`px-4 py-2 rounded-[9px] text-sm font-medium ${getStatusButtonClass(status, currentStatus === status)}`}
          >
            {LEAD_STATUS_LABELS[status]}
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect()}
      disabled={disabled}
      className={`px-4 py-2 rounded-[9px] text-sm font-medium ${getStatusButtonClass(status, currentStatus === status)}`}
    >
      {LEAD_STATUS_LABELS[status]}
    </button>
  );
}
