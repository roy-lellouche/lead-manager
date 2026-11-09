export type UserRole = 'admin' | 'telepro' | 'secretaire' | 'stockage';

export type LeadStatus =
  | 'nouveau'
  | 'nrp'
  | 'a_rappeler'
  | 'en_attente_doc'
  | 'documents_recus'
  | 'devis_a_envoyer'
  | 'devis_envoye'
  | 'incomplet'
  | 'bloque_mpr'
  | 'avis_2025_bloque'
  | 'pas_eligible'
  | 'valide'
  | 'installe'
  | 'ancien_documents_recus'
  | 'transfert'
  | 'annule';

/** Tous les statuts (accessibles par tous les rôles, partout) */
export const LEAD_STATUSES_ADMIN: LeadStatus[] = [
  'nouveau', 'nrp', 'a_rappeler', 'en_attente_doc', 'documents_recus', 'devis_a_envoyer', 'devis_envoye', 'incomplet', 'bloque_mpr', 'avis_2025_bloque', 'pas_eligible', 'valide', 'installe', 'ancien_documents_recus', 'transfert', 'annule',
];

/** Tous les statuts sont désormais accessibles par tous les rôles : ces alias pointent sur la liste complète. */
export const LEAD_STATUSES_TELEPRO: LeadStatus[] = LEAD_STATUSES_ADMIN;
export const LEAD_STATUSES_TELEPRO_SELECTABLE: LeadStatus[] = LEAD_STATUSES_ADMIN;

export type LeadCategory = 'fenetre' | 'clim_1euro' | 'video_pac_atlantic_990' | 'clim_3990euros';

export const LEAD_CATEGORIES: LeadCategory[] = ['fenetre', 'clim_1euro', 'video_pac_atlantic_990', 'clim_3990euros'];

export const LEAD_CATEGORY_LABELS: Record<LeadCategory, string> = {
  fenetre: 'Fenêtre',
  clim_1euro: 'PAC image Atlantic 990 €',
  video_pac_atlantic_990: 'Vidéo PAC Atlantic 990 €',
  clim_3990euros: 'Clim 3990 €',
};

export type LeadColor = 'bleu' | 'jaune' | 'violet' | 'rose';

export type InstallationType = 'pac' | 'pac_ballon' | 'pac_ssc' | 'pac_ssc_jaune' | 'ssc' | 'ssc_jaune' | 'ballon_solaire';

export type ElectricityType = 'monophase' | 'triphase';

export type DocumentType =
  | 'devis'
  | 'facture'
  | 'facture_materiel'
  | 'facture_sous_traitant'
  | 'taxe_fonciere'
  | 'avis_imposition';

export type DocStatus = 'en_cours' | 'installe' | 'depot_mpr' | 'cee_paye' | 'mpr_paye';

/** Statuts chantier cumulables - chaque statut a une colonne booléenne is_* */
export const CHANTIER_STATUS_FIELDS = [
  { field: 'is_installe', label: 'Installé' },
  { field: 'is_depot_mpr', label: 'Dépôt MPR' },
  { field: 'is_cee_paye', label: 'CEE payé' },
  { field: 'is_mpe_paye', label: 'MPR payé' },
  { field: 'is_ssc_cee', label: 'SSC CEE' },
  { field: 'is_pac_cee', label: 'PAC CEE' },
  { field: 'is_code_envoye', label: 'Code envoyé' },
  { field: 'is_depose', label: 'Déposé' },
  { field: 'is_controle_veritas', label: 'Contrôle Veritas' },
  { field: 'is_paye', label: 'Payé' },
  { field: 'is_compte_bloque', label: 'Compte bloqué' },
  { field: 'is_rejete', label: 'Rejeté' },
] as const;

export type ChantierStatusField = (typeof CHANTIER_STATUS_FIELDS)[number]['field'];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  nouveau: 'Nouveau',
  nrp: 'NRP',
  a_rappeler: 'À rappeler',
  en_attente_doc: 'En attente de doc',
  documents_recus: 'Documents reçus',
  devis_a_envoyer: 'Devis à envoyer',
  devis_envoye: 'Devis envoyé',
  incomplet: 'Incomplet',
  bloque_mpr: 'Bloqué MPR',
  avis_2025_bloque: 'Avis 2025 bloqué',
  pas_eligible: 'Pas éligible',
  valide: 'Validé',
  installe: 'Installé',
  ancien_documents_recus: 'Ancien documents reçus',
  transfert: 'Transfert',
  annule: 'Annulé',
};

/** Couleurs des camemberts par statut (uniquement pour les graphiques) */
export const STATUS_CHART_COLORS: Record<LeadStatus, string> = {
  annule: '#ef4444',        // rouge
  nouveau: '#d4b896',       // beige
  nrp: '#eab308',           // jaune
  a_rappeler: '#f97316',    // orange
  en_attente_doc: '#8b5cf6', // violet
  documents_recus: '#22c55e', // vert
  devis_a_envoyer: '#a855f7', // violet/purple
  devis_envoye: '#db2777',  // fuchsia
  incomplet: '#f59e0b',     // amber
  bloque_mpr: '#dc2626',    // red-600
  avis_2025_bloque: '#9f1239', // rose-800 (avis 2025 bloqué)
  pas_eligible: '#57534e',  // stone-600 (pas éligible)
  valide: '#10b981',        // emerald-500
  installe: '#0ABAB5',      // Bleu Tiffany
  ancien_documents_recus: '#64748b', // slate (archivé)
  transfert: '#0ea5e9',     // sky-500
};

export const LEAD_COLOR_LABELS: Record<LeadColor, string> = {
  bleu: 'Bleu (5000€)',
  jaune: 'Jaune (4000€)',
  violet: 'Violet (3000€)',
  rose: 'Rose',
};

/** Libellés couleurs sans montant (pour l'espace télépro) */
export const LEAD_COLOR_LABELS_SIMPLE: Record<LeadColor, string> = {
  bleu: 'Bleu',
  jaune: 'Jaune',
  violet: 'Violet',
  rose: 'Rose',
};

export const LEAD_COLOR_MPR: Record<LeadColor, number> = {
  bleu: 5000,
  jaune: 4000,
  violet: 3000,
  rose: 0, // À configurer
};

export const INSTALLATION_TYPE_LABELS: Record<InstallationType, string> = {
  pac: 'PAC',
  pac_ballon: 'PAC + Ballon électrique',
  pac_ssc: 'PAC + SSC',
  pac_ssc_jaune: 'PAC + SSC jaune',
  ssc: 'SSC',
  ssc_jaune: 'SSC jaune',
  ballon_solaire: 'Ballon solaire',
};

/** Couleurs des camemberts par type d'installation */
export const INSTALLATION_CHART_COLORS: Record<InstallationType, string> = {
  pac: '#22c55e',           // vert
  pac_ballon: '#15803d',    // vert foncé
  pac_ssc: '#06b6d4',      // turquoise
  pac_ssc_jaune: '#eab308', // jaune
  ssc: '#f97316',          // orange
  ssc_jaune: '#fef08a',    // jaune pastel
  ballon_solaire: '#92400e', // marron
};

export const INSTALLATION_TYPES: InstallationType[] = [
  'pac', 'pac_ballon', 'pac_ssc', 'pac_ssc_jaune', 'ssc', 'ssc_jaune', 'ballon_solaire',
];

export const ELECTRICITY_TYPE_LABELS: Record<ElectricityType, string> = {
  monophase: 'Monophasé',
  triphase: 'Triphasé',
};

export type HeatingMode = 'gaz' | 'fioul' | 'electricite' | 'bois' | 'pac';

export type RadiatorType = 'fonte' | 'acier' | 'plancher_chauffant';

export const RADIATOR_TYPE_LABELS: Record<RadiatorType, string> = {
  fonte: 'Fonte',
  acier: 'Acier',
  plancher_chauffant: 'Plancher chauffant',
};

export const RADIATOR_TYPE_OPTIONS: RadiatorType[] = ['fonte', 'acier', 'plancher_chauffant'];

export const HEATING_MODE_LABELS: Record<HeatingMode, string> = {
  gaz: 'Gaz',
  fioul: 'Fioul',
  electricite: 'Électricité',
  bois: 'Bois',
  pac: 'PAC',
};

export const DELEGATAIRE_GROUPS = [
  'Dépôt Drapo',
  'Omega',
  'Dast',
  'Ynergie',
  'Synerciel',
  'Premium',
  'Eco negoce',
  'Label Energie',
  'S2EE',
  'Econolia',
  'ADPER',
  'Eco Green',
] as const;

export const INSTALLATEUR_OPTIONS = ['Eco Klim', 'Davitech', 'Shlomo'] as const;

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  assigned_to: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  is_duplicate: boolean;
  meta_lead_id: string | null;
  status: LeadStatus;
  category: LeadCategory;
  callback_at: string | null;
  nrp_count: number;
  surface_m2: number | null;
  revenu_fiscal_ref: number | null;
  numero_fiscal: string | null;
  date_of_birth: string | null;
  department: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  heating_mode: string | null;
  radiator_type: RadiatorType[] | null;
  color: LeadColor | null;
  is_owner: boolean | null;
  installation_type: InstallationType | null;
  electricity_type: string | null;
  commentaire: string | null;
  doc_status: string | null;
  is_installe: boolean;
  is_depot_mpr: boolean;
  is_cee_paye: boolean;
  is_mpe_paye: boolean;
  is_ssc_cee?: boolean;
  is_pac_cee?: boolean;
  is_code_envoye?: boolean;
  is_depose?: boolean;
  is_controle_veritas?: boolean;
  is_paye?: boolean;
  is_compte_bloque?: boolean;
  is_rejete?: boolean;
  installation_cost: number | null;
  material_cost: number | null;
  material_cost_comment: string | null;
  regie_cost: number | null;
  benefit_cee: number | null;
  benefit_mpr: number | null;
  benefit_apporteur_affaires: number | null;
  profitability: number | null;
  chantier_comment: string | null;
  delegataire_group: string | null;
  installateur: string | null;
  status_changed_at: string | null;
  created_at: string;
  updated_at: string;
  added_at: string | null;
  imported_at: string | null;
  import_batch_id: string | null;
  import_order: number | null;
}

export interface LeadLog {
  id: string;
  lead_id: string;
  user_id: string;
  action: string;
  old_status: LeadStatus | null;
  new_status: LeadStatus | null;
  created_at: string;
  profile?: { full_name: string };
}

export interface LeadDocument {
  id: string;
  lead_id: string;
  type: DocumentType;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: string | null;
  read: boolean;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  imported_by: string | null;
  file_name: string | null;
  total_rows: number;
  imported_count: number;
  error_count: number;
  errors: Record<string, string>[] | null;
  created_at: string;
}
