-- Module financier : rentabilité automatique des chantiers.
-- Migration purement additive : aucune donnée existante n'est modifiée ni supprimée.
-- Montants en euros TTC.

-- 1. Date déterminant le barème CEE : signature du devis (date d'engagement de l'opération)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS devis_signed_at DATE;

-- 2. Méthodes économiques (extensible : ajouter une ligne, pas de code à reconstruire)
CREATE TABLE IF NOT EXISTS economic_methods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_configured BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Coûts standards par méthode
CREATE TABLE IF NOT EXISTS method_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id TEXT NOT NULL REFERENCES economic_methods(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('materiel', 'fournitures', 'main_oeuvre', 'dossier', 'autres')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (method_id, code)
);

-- 4. Barèmes CEE (par méthode, année, zone, période de validité)
CREATE TABLE IF NOT EXISTS cee_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id TEXT NOT NULL REFERENCES economic_methods(id) ON DELETE CASCADE,
  scale_year INTEGER NOT NULL,
  climate_zone TEXT NOT NULL CHECK (climate_zone IN ('H1', 'H2', 'H3')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  valid_from DATE NOT NULL,
  valid_to DATE,
  conditions TEXT,
  validated BOOLEAN NOT NULL DEFAULT FALSE,
  validated_at TIMESTAMPTZ,
  validated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (method_id, scale_year, climate_zone),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_cee_scales_validated_by ON cee_scales(validated_by);

-- 5. Paramètres divers (seuils d'alerte…)
CREATE TABLE IF NOT EXISTS financial_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_financial_settings_updated_by ON financial_settings(updated_by);

-- 6. Historique des modifications des paramètres (date, utilisateur, ancienne/nouvelle valeur)
CREATE TABLE IF NOT EXISTS financial_settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_label TEXT,
  field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_financial_settings_history_changed_at ON financial_settings_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_settings_history_changed_by ON financial_settings_history(changed_by);

-- 7. Rentabilité par chantier (une seule ligne par lead : pas de doublon lors des recalculs)
CREATE TABLE IF NOT EXISTS lead_financials (
  lead_id UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  method_id TEXT REFERENCES economic_methods(id) ON DELETE SET NULL,
  calc_status TEXT NOT NULL DEFAULT 'en_attente' CHECK (calc_status IN ('calcule', 'en_attente')),
  pending_reasons TEXT[] NOT NULL DEFAULT '{}',
  -- Zone climatique
  climate_zone TEXT CHECK (climate_zone IN ('H1', 'H2', 'H3')),
  zone_source TEXT CHECK (zone_source IN ('auto', 'manuel', 'a_confirmer', 'introuvable')),
  zone_message TEXT,
  zone_candidates JSONB,
  zone_postal_code TEXT,
  zone_city TEXT,
  insee_code TEXT,
  department_code TEXT,
  -- Barème
  scale_id UUID REFERENCES cee_scales(id) ON DELETE SET NULL,
  scale_year INTEGER,
  scale_validated BOOLEAN,
  cee_scale_amount NUMERIC(12,2),
  cee_confirmed NUMERIC(12,2),
  cee_forecast NUMERIC(12,2),
  -- Coûts prévisionnels (coûts standards figés à la date du premier calcul)
  standard_costs JSONB,
  standard_costs_at TIMESTAMPTZ,
  cost_overrides JSONB NOT NULL DEFAULT '{}',
  other_costs NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_lines JSONB,
  cost_materiel NUMERIC(12,2),
  cost_fournitures NUMERIC(12,2),
  cost_main_oeuvre NUMERIC(12,2),
  cost_dossier NUMERIC(12,2),
  cost_autres NUMERIC(12,2),
  total_cost NUMERIC(12,2),
  -- Recettes et résultat prévisionnels
  reste_a_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2),
  gross_margin NUMERIC(12,2),
  margin_rate NUMERIC(7,2),
  -- Réel (jamais modifié par un recalcul)
  real_cost NUMERIC(12,2),
  real_cost_validated BOOLEAN NOT NULL DEFAULT FALSE,
  real_cost_validated_at TIMESTAMPTZ,
  real_cost_validated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cee_received NUMERIC(12,2),
  rac_received NUMERIC(12,2),
  calculated_at TIMESTAMPTZ,
  calculated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_financials_method_id ON lead_financials(method_id);
CREATE INDEX IF NOT EXISTS idx_lead_financials_scale_id ON lead_financials(scale_id);
CREATE INDEX IF NOT EXISTS idx_lead_financials_real_cost_validated_by ON lead_financials(real_cost_validated_by);
CREATE INDEX IF NOT EXISTS idx_lead_financials_calculated_by ON lead_financials(calculated_by);

-- 8. Historique des calculs (une entrée seulement quand le résultat change)
CREATE TABLE IF NOT EXISTS lead_financial_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL,
  result_hash TEXT NOT NULL,
  snapshot JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lead_financial_calculations_lead ON lead_financial_calculations(lead_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_financial_calculations_by ON lead_financial_calculations(calculated_by);

-- 9. RLS : l'application passe par le service role côté serveur ; ces règles
--    ferment l'accès direct (clé anon) : lecture admin/secrétaire, écriture admin.
ALTER TABLE economic_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE method_cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cee_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_settings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_financial_calculations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['economic_methods','method_cost_items','cee_scales','financial_settings','financial_settings_history']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON %1$I', t);
    EXECUTE format($p$CREATE POLICY "Admins manage %1$s" ON %1$I FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'))$p$, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['economic_methods','method_cost_items','cee_scales','financial_settings']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Secretaires read %1$s" ON %1$I', t);
    EXECUTE format($p$CREATE POLICY "Secretaires read %1$s" ON %1$I FOR SELECT
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'secretaire'))$p$, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['lead_financials','lead_financial_calculations']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins and secretaires manage %1$s" ON %1$I', t);
    EXECUTE format($p$CREATE POLICY "Admins and secretaires manage %1$s" ON %1$I FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role IN ('admin','secretaire')))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role IN ('admin','secretaire')))$p$, t);
  END LOOP;
END $$;

-- 10. Données initiales (valeurs fournies par RS Écologie ; idempotent)
INSERT INTO economic_methods (id, name, description, is_configured, display_order) VALUES
  ('pac_atlantic_cee', 'PAC Atlantic CEE', 'Méthode 1 — Pompe à chaleur Atlantic, financement CEE', TRUE, 1),
  ('methode_2', 'Méthode 2', 'À définir ultérieurement', FALSE, 2),
  ('methode_3', 'Méthode 3', 'À définir ultérieurement', FALSE, 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO method_cost_items (method_id, code, label, category, amount, display_order) VALUES
  ('pac_atlantic_cee', 'pac_materiel', 'Pompe à chaleur Atlantic + kit accessoires + ballon électrique 200 L', 'materiel', 2000, 1),
  ('pac_atlantic_cee', 'petites_fournitures', 'Petites fournitures', 'fournitures', 700, 2),
  ('pac_atlantic_cee', 'main_oeuvre', 'Main-d''œuvre ouvriers', 'main_oeuvre', 700, 3),
  ('pac_atlantic_cee', 'frais_dossier_cee', 'Frais de dossier CEE', 'dossier', 70, 4),
  ('pac_atlantic_cee', 'installation_employe', 'Frais d''installation avec employé', 'autres', 200, 5)
ON CONFLICT (method_id, code) DO NOTHING;

-- Barèmes commerciaux de référence : à valider par un administrateur
-- (le calcul les utilise mais signale « barème non validé » tant que ce n'est pas fait).
INSERT INTO cee_scales (method_id, scale_year, climate_zone, amount, valid_from, valid_to) VALUES
  ('pac_atlantic_cee', 2025, 'H1', 8400, '2025-01-01', '2025-12-31'),
  ('pac_atlantic_cee', 2025, 'H2', 8400, '2025-01-01', '2025-12-31'),
  ('pac_atlantic_cee', 2025, 'H3', 8400, '2025-01-01', '2025-12-31'),
  ('pac_atlantic_cee', 2026, 'H1', 7908, '2026-01-01', '2026-12-31'),
  ('pac_atlantic_cee', 2026, 'H2', 6590, '2026-01-01', '2026-12-31'),
  ('pac_atlantic_cee', 2026, 'H3', 4613, '2026-01-01', '2026-12-31')
ON CONFLICT (method_id, scale_year, climate_zone) DO NOTHING;

INSERT INTO financial_settings (key, value) VALUES
  ('alert_thresholds', '{"red_below": 1000, "orange_below": 2000}')
ON CONFLICT (key) DO NOTHING;
