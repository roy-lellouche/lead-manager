-- Migration 059 : PAC Atlantic ETAS < 140 % — prime forfaitaire identique en H1, H2 et H3.
-- cee_mode : 'bareme' = prime calculée par le barème Coup de pouce (repli sur le forfait),
--            'forfait' = prime fixe de la fiche, quel que soit le foyer.
ALTER TABLE pac_models ADD COLUMN IF NOT EXISTS cee_mode text NOT NULL DEFAULT 'bareme'
  CHECK (cee_mode IN ('bareme', 'forfait'));

INSERT INTO pac_models (name, etas_band, cee_mode, cee_h1, cee_h2, cee_h3, display_order, cost_items)
SELECT v.name, '111_140', 'forfait', 4000, 4000, 4000, v.ord, '[
    {"label": "PAC Atlantic Excellia AI", "amount": 1500, "basis": "HT", "category": "materiel"},
    {"label": "Kit accessoires", "amount": 500, "basis": "HT", "category": "materiel"},
    {"label": "Installation", "amount": 700, "basis": "HT", "category": "installation"},
    {"label": "Employé chantier", "amount": 600, "basis": "TTC", "category": "installation"},
    {"label": "Régie commerciale", "amount": 300, "basis": "TTC", "category": "regie"},
    {"label": "Secrétariat CEE", "amount": 70, "basis": "TTC", "category": "dossier"},
    {"label": "Coût du lead", "amount": 30, "basis": "HT", "category": "dossier"}
  ]'::jsonb
FROM (VALUES ('Atlantic Excellia AI 11 kW', 21), ('Atlantic Excellia AI 14 kW', 22), ('Atlantic Excellia AI 16 kW', 23)) AS v(name, ord)
ON CONFLICT DO NOTHING;
