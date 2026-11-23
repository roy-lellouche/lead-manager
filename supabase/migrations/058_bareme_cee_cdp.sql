-- Migration 058 : prime CEE calculée selon le barème « Coup de pouce » 2026
-- (PAC air/eau en maison individuelle, opérations engagées à partir du 01/01/2026).
-- Prime = kWhc (selon l'ETAS) × facteur zone × facteur surface × bonification CDP
--         × prix du MWhc cumac (selon la catégorie de revenus du foyer).

-- Tranche d'ETAS du modèle de PAC : '111_140' (111 % ≤ ETAS < 140 %) ou '140_plus' (ETAS ≥ 140 %).
ALTER TABLE pac_models ADD COLUMN IF NOT EXISTS etas_band text
  CHECK (etas_band IS NULL OR etas_band IN ('111_140', '140_plus'));

-- Atlantic Alfea Excellia S9/S12/S14 : ETAS ≥ 140 % (indiqué par RS Écologie).
-- Domusa : même prime communiquée que l'Atlantic → ETAS ≥ 140 % (modifiable dans la fiche).
UPDATE pac_models SET etas_band = '140_plus'
WHERE etas_band IS NULL AND (name ILIKE 'Atlantic Alfea Excellia S%' OR name ILIKE 'Domusa %');

-- Paramètres du barème (prix du MWhc modifiables depuis le suivi des dossiers).
INSERT INTO financial_settings (key, value) VALUES (
  'cee_cdp_bareme',
  '{
    "kwhc": {"111_140": 90900, "140_plus": 109200},
    "zone_factor": {"H1": 1.2, "H2": 1, "H3": 0.7},
    "shab": {"lt70": 0.5, "70_90": 0.7, "gte90": 1},
    "cdp_multiplier": 5,
    "price_mwhc": {"TMO": 14, "MO": 7.5, "IT": 7.5, "CL": 7.5}
  }'
) ON CONFLICT (key) DO NOTHING;
