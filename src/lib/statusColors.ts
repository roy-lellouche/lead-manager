import type { LeadStatus } from "@/lib/types";

/**
 * Code couleur unique des statuts de lead, utilisé partout (badges, sélecteurs,
 * boutons, menu, graphiques). Logique par famille :
 *  - À contacter     : Nouveau (bleu) → NRP (jaune) → À rappeler (orange)
 *  - Dossier         : En attente de doc (violet) → Documents reçus (indigo) ; Incomplet (ambre)
 *  - Devis           : Devis à envoyer (rose) → Devis envoyé (fuchsia)
 *  - Gagné           : Validé (vert) → Installé (turquoise) ; Transfert (cyan)
 *  - Bloqué / perdu  : Bloqué MPR (rouge) ; Avis 2025 bloqué (rose foncé) ; Annulé (rouge foncé) ; Pas éligible (pierre)
 *  - Archive         : Ancien documents reçus (gris)
 */
type StatusStyle = {
  /** Couleur pleine (graphiques, pastilles) */
  hex: string;
  /** Classes Tailwind fond + texte + bordure (badge / select / bouton actif) */
  classes: string;
};

export const STATUS_STYLES: Record<LeadStatus, StatusStyle> = {
  nouveau: { hex: "#3b82f6", classes: "bg-blue-100 text-blue-800 border-blue-300" },
  nrp: { hex: "#eab308", classes: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  a_rappeler: { hex: "#f97316", classes: "bg-orange-100 text-orange-800 border-orange-300" },
  en_attente_doc: { hex: "#8b5cf6", classes: "bg-violet-100 text-violet-800 border-violet-300" },
  documents_recus: { hex: "#4f46e5", classes: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  incomplet: { hex: "#d97706", classes: "bg-amber-100 text-amber-800 border-amber-300" },
  devis_a_envoyer: { hex: "#ec4899", classes: "bg-pink-100 text-pink-800 border-pink-300" },
  devis_envoye: { hex: "#c026d3", classes: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300" },
  valide: { hex: "#16a34a", classes: "bg-green-100 text-green-800 border-green-300" },
  installe: { hex: "#0d9488", classes: "bg-teal-100 text-teal-800 border-teal-300" },
  transfert: { hex: "#06b6d4", classes: "bg-cyan-100 text-cyan-800 border-cyan-300" },
  bloque_mpr: { hex: "#dc2626", classes: "bg-red-100 text-red-800 border-red-300" },
  avis_2025_bloque: { hex: "#be123c", classes: "bg-rose-100 text-rose-800 border-rose-300" },
  annule: { hex: "#7f1d1d", classes: "bg-red-200 text-red-900 border-red-400" },
  pas_eligible: { hex: "#78716c", classes: "bg-stone-200 text-stone-700 border-stone-300" },
  ancien_documents_recus: { hex: "#94a3b8", classes: "bg-slate-100 text-slate-500 border-slate-300" },
};

const FALLBACK: StatusStyle = { hex: "#9ca3af", classes: "bg-slate-100 text-slate-700 border-slate-300" };

export function statusClasses(status: string): string {
  return (STATUS_STYLES[status as LeadStatus] ?? FALLBACK).classes;
}

export function statusHex(status: string): string {
  return (STATUS_STYLES[status as LeadStatus] ?? FALLBACK).hex;
}
