-- Migration 057 : fiche économique par modèle de PAC
-- Prime CEE par zone climatique (H1/H2/H3) et postes de coût (montant, HT/TTC,
-- rubrique) ; frais de dossier et zone CEE sur la fiche client.

ALTER TABLE pac_models
  ADD COLUMN IF NOT EXISTS cee_h1 numeric(12, 2) CHECK (cee_h1 IS NULL OR cee_h1 >= 0),
  ADD COLUMN IF NOT EXISTS cee_h2 numeric(12, 2) CHECK (cee_h2 IS NULL OR cee_h2 >= 0),
  ADD COLUMN IF NOT EXISTS cee_h3 numeric(12, 2) CHECK (cee_h3 IS NULL OR cee_h3 >= 0),
  -- [{ "label", "amount", "basis": "HT"|"TTC", "category": "materiel"|"installation"|"regie"|"dossier" }]
  ADD COLUMN IF NOT EXISTS cost_items jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 100;

-- Frais de dossier (secrétariat CEE, coût du lead…) : comptés dans la rentabilité.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dossier_cost numeric(12, 2);
-- Zone CEE choisie à la main quand le code postal manque (sinon déduite du département).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cee_zone text CHECK (cee_zone IS NULL OR cee_zone IN ('H1', 'H2', 'H3'));

-- Les modèles provisoires de la migration 056 (jamais utilisés ni renseignés) sont remplacés
-- par les fiches fournies par RS Écologie.
DELETE FROM pac_models m
WHERE m.cee_amount IS NULL AND m.updated_at = m.created_at
  AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.pac_model_id = m.id);

INSERT INTO pac_models (name, cee_h1, cee_h2, display_order, cost_items)
SELECT v.name, 9450, 7800, v.ord, (
  jsonb_build_array(jsonb_build_object('label', 'PAC Atlantic Alfea Excellia', 'amount', 3200, 'basis', 'HT', 'category', 'materiel'))
  || '[
    {"label": "Installation", "amount": 700, "basis": "HT", "category": "installation"},
    {"label": "Employé chantier", "amount": 600, "basis": "TTC", "category": "installation"},
    {"label": "Régie commerciale", "amount": 300, "basis": "TTC", "category": "regie"},
    {"label": "Secrétariat CEE", "amount": 70, "basis": "TTC", "category": "dossier"},
    {"label": "Coût du lead", "amount": 30, "basis": "HT", "category": "dossier"}
  ]'::jsonb)
FROM (VALUES ('Atlantic Alfea Excellia S9', 1), ('Atlantic Alfea Excellia S12', 2), ('Atlantic Alfea Excellia S14', 3)) AS v(name, ord)
ON CONFLICT DO NOTHING;

INSERT INTO pac_models (name, cee_h1, cee_h2, display_order, cost_items)
SELECT v.name, 9450, 7800, v.ord, (
  jsonb_build_array(jsonb_build_object('label', 'PAC ' || v.name, 'amount', v.price, 'basis', 'HT', 'category', 'materiel'))
  || '[
    {"label": "Kit accessoires", "amount": 500, "basis": "HT", "category": "materiel"},
    {"label": "Dégazeur", "amount": 150, "basis": "HT", "category": "materiel"},
    {"label": "Installation", "amount": 700, "basis": "HT", "category": "installation"},
    {"label": "Employé chantier", "amount": 600, "basis": "TTC", "category": "installation"},
    {"label": "Régie commerciale", "amount": 300, "basis": "TTC", "category": "regie"},
    {"label": "Secrétariat CEE", "amount": 70, "basis": "TTC", "category": "dossier"},
    {"label": "Coût du lead", "amount": 30, "basis": "HT", "category": "dossier"}
  ]'::jsonb)
FROM (VALUES ('Domusa 6 kW', 2000, 11), ('Domusa 9 kW', 2150, 12), ('Domusa 12 kW', 2400, 13), ('Domusa 16 kW', 2750, 14)) AS v(name, price, ord)
ON CONFLICT DO NOTHING;
