-- Méthode 2 (PAC Atlantic ETAS > 140 %), TVA par poste, sélection automatique par ETAS.
-- Migration additive : aucune colonne ni ligne supprimée. Les chantiers déjà calculés
-- conservent leurs coûts figés (sans TVA) et donc leurs marges historiques.

-- 1. TVA par poste de coût
ALTER TABLE method_cost_items ADD COLUMN IF NOT EXISTS amount_basis TEXT NOT NULL DEFAULT 'TTC';
ALTER TABLE method_cost_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2);
ALTER TABLE method_cost_items ADD COLUMN IF NOT EXISTS vat_recovery_rate NUMERIC(5,2) NOT NULL DEFAULT 100;
DO $$ BEGIN
  ALTER TABLE method_cost_items ADD CONSTRAINT method_cost_items_amount_basis_check CHECK (amount_basis IN ('HT', 'TTC'));
  ALTER TABLE method_cost_items ADD CONSTRAINT method_cost_items_vat_rate_check CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100));
  ALTER TABLE method_cost_items ADD CONSTRAINT method_cost_items_vat_recovery_check CHECK (vat_recovery_rate >= 0 AND vat_recovery_rate <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Configuration par méthode : TVA de la prime CEE, règle ETAS, conditions d'éligibilité
ALTER TABLE economic_methods ADD COLUMN IF NOT EXISTS cee_amount_basis TEXT NOT NULL DEFAULT 'HT';
ALTER TABLE economic_methods ADD COLUMN IF NOT EXISTS cee_vat_share NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE economic_methods ADD COLUMN IF NOT EXISTS cee_vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE economic_methods ADD COLUMN IF NOT EXISTS auto_select BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE economic_methods ADD COLUMN IF NOT EXISTS etas_min_exclusive NUMERIC(6,2);
ALTER TABLE economic_methods ADD COLUMN IF NOT EXISTS etas_max_inclusive NUMERIC(6,2);
ALTER TABLE economic_methods ADD COLUMN IF NOT EXISTS eligibility_conditions JSONB NOT NULL DEFAULT '[]';
DO $$ BEGIN
  ALTER TABLE economic_methods ADD CONSTRAINT economic_methods_cee_basis_check CHECK (cee_amount_basis IN ('HT', 'TTC'));
  ALTER TABLE economic_methods ADD CONSTRAINT economic_methods_cee_share_check CHECK (cee_vat_share >= 0 AND cee_vat_share <= 100);
  ALTER TABLE economic_methods ADD CONSTRAINT economic_methods_cee_rate_check CHECK (cee_vat_rate >= 0 AND cee_vat_rate <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Catalogue : ETAS des PAC Atlantic
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_pac_atlantic BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS etas NUMERIC(6,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS etas_validated BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Chantier : sélection de méthode, TVA, trésorerie
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS method_source TEXT;
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS suggested_method_id TEXT REFERENCES economic_methods(id) ON DELETE SET NULL;
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS selection_message TEXT;
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS eligibility_checks JSONB NOT NULL DEFAULT '{}';
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS etas_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS etas_product_name TEXT;
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS etas_value NUMERIC(6,2);
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS standard_costs_method_id TEXT;
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS raw_total_cost NUMERIC(12,2);
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS total_cost_ht NUMERIC(12,2);
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS total_cost_ttc NUMERIC(12,2);
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS total_vat NUMERIC(12,2);
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS recoverable_vat NUMERIC(12,2);
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS cee_ht NUMERIC(12,2);
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS cee_vat NUMERIC(12,2);
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS cee_ttc NUMERIC(12,2);
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS cash_out_ttc NUMERIC(12,2);
ALTER TABLE lead_financials ADD COLUMN IF NOT EXISTS cash_in_ttc NUMERIC(12,2);
DO $$ BEGIN
  ALTER TABLE lead_financials ADD CONSTRAINT lead_financials_method_source_check CHECK (method_source IS NULL OR method_source IN ('manuel', 'auto'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_lead_financials_suggested_method_id ON lead_financials(suggested_method_id);
CREATE INDEX IF NOT EXISTS idx_lead_financials_etas_product_id ON lead_financials(etas_product_id);

-- Chantiers existants : leur méthode avait été choisie à la main, on le garde.
UPDATE lead_financials
SET method_source = 'manuel', standard_costs_method_id = method_id
WHERE method_id IS NOT NULL AND method_source IS NULL;

-- 5. Méthode 1 : même traitement de TVA (20 %, récupérable) pour les NOUVEAUX chantiers
UPDATE method_cost_items SET amount_basis = 'TTC', vat_rate = 20, vat_recovery_rate = 100
WHERE method_id = 'pac_atlantic_cee' AND vat_rate IS NULL;
UPDATE economic_methods SET
  cee_amount_basis = 'HT', cee_vat_share = 50, cee_vat_rate = 20,
  auto_select = TRUE, etas_max_inclusive = 140,
  eligibility_conditions = '["Éligibilité CEE du dossier vérifiée (conditions du délégataire)"]'
WHERE id = 'pac_atlantic_cee' AND auto_select = FALSE;

-- 6. Méthode 2 : PAC Atlantic ETAS > 140 % — CEE 2026
UPDATE economic_methods SET
  name = 'PAC Atlantic ETAS > 140 %',
  description = 'Méthode 2 — PAC Atlantic ETAS supérieur à 140 %, barèmes CEE 2026',
  is_configured = TRUE,
  cee_amount_basis = 'HT', cee_vat_share = 50, cee_vat_rate = 20,
  auto_select = TRUE, etas_min_exclusive = 140,
  eligibility_conditions = '["Éligibilité CEE du dossier vérifiée (conditions du délégataire)", "ETAS > 140 % confirmé sur la fiche technique de la PAC installée"]',
  updated_at = NOW()
WHERE id = 'methode_2' AND is_configured = FALSE;

INSERT INTO method_cost_items (method_id, code, label, category, amount, amount_basis, vat_rate, vat_recovery_rate, display_order) VALUES
  ('methode_2', 'pac_materiel', 'Pompe à chaleur Atlantic + kit accessoires + ballon électrique 200 L', 'materiel', 3200, 'HT', 20, 100, 1),
  ('methode_2', 'petites_fournitures', 'Petites fournitures', 'fournitures', 700, 'TTC', 20, 100, 2),
  ('methode_2', 'main_oeuvre', 'Main-d''œuvre ouvriers', 'main_oeuvre', 700, 'TTC', 20, 100, 3),
  ('methode_2', 'frais_dossier_cee', 'Frais de dossier CEE', 'dossier', 70, 'HT', 20, 100, 4),
  ('methode_2', 'installation_employe', 'Frais d''installation avec employé', 'autres', 200, 'HT', 20, 100, 5)
ON CONFLICT (method_id, code) DO NOTHING;

-- Références commerciales internes : à valider, non garanties réglementairement.
INSERT INTO cee_scales (method_id, scale_year, climate_zone, amount, valid_from, valid_to, conditions) VALUES
  ('methode_2', 2026, 'H1', 9500, '2026-01-01', '2026-12-31', 'Référence commerciale interne RS Écologie'),
  ('methode_2', 2026, 'H2', 7917, '2026-01-01', '2026-12-31', 'Référence commerciale interne RS Écologie'),
  ('methode_2', 2026, 'H3', 5541, '2026-01-01', '2026-12-31', 'Référence commerciale interne RS Écologie')
ON CONFLICT (method_id, scale_year, climate_zone) DO NOTHING;

-- 7. Traçabilité dans l'historique des paramètres
INSERT INTO financial_settings_history (entity, entity_id, entity_label, field, old_value, new_value)
SELECT 'economic_methods', 'pac_atlantic_cee', 'Méthode « PAC Atlantic CEE »', 'TVA des postes',
       '"sans TVA (montants TTC pris tels quels)"', '"TTC, TVA 20 %, récupérable 100 % — nouveaux chantiers uniquement"'
WHERE NOT EXISTS (SELECT 1 FROM financial_settings_history WHERE entity_id = 'pac_atlantic_cee' AND field = 'TVA des postes');
INSERT INTO financial_settings_history (entity, entity_id, entity_label, field, old_value, new_value)
SELECT 'economic_methods', 'methode_2', 'Méthode 2', 'création',
       NULL, '"PAC Atlantic ETAS > 140 % : 5 postes de coût, barèmes 2026 H1/H2/H3"'
WHERE NOT EXISTS (SELECT 1 FROM financial_settings_history WHERE entity_id = 'methode_2' AND field = 'création');
