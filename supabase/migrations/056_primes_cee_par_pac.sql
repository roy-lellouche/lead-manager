-- Migration 056 : prime CEE selon le modèle de PAC installée.
-- Grille modifiable « modèle de PAC → prime CEE » et modèle posé chez chaque client.
-- Migration additive : aucune donnée existante modifiée.

CREATE TABLE IF NOT EXISTS pac_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- Prime CEE habituelle pour ce modèle (null = pas encore renseignée).
  cee_amount numeric(12, 2) CHECK (cee_amount IS NULL OR cee_amount >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pac_models_name_idx ON pac_models (lower(name));
ALTER TABLE pac_models ENABLE ROW LEVEL SECURITY;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS pac_model_id uuid REFERENCES pac_models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS leads_pac_model_idx ON leads (pac_model_id);

-- Point de départ : les PAC présentes dans le catalogue produits (montants à renseigner).
INSERT INTO pac_models (name)
SELECT DISTINCT ON (lower(trim(p.name))) trim(p.name)
FROM products p
WHERE p.price >= 1000
  AND p.name !~* '(kit|ballon|bts|\mbe\M|litre)'
ON CONFLICT DO NOTHING;

-- Clients dont la fiche matériel contient déjà une (seule) de ces PAC : modèle renseigné.
UPDATE leads l
SET pac_model_id = m.model_id
FROM (
  SELECT lm.lead_id, min(pm.id::text)::uuid AS model_id
  FROM lead_materials lm
  JOIN products p ON p.id = lm.product_id
  JOIN pac_models pm ON lower(pm.name) = lower(trim(p.name))
  GROUP BY lm.lead_id
  HAVING count(DISTINCT pm.id) = 1
) m
WHERE l.id = m.lead_id AND l.pac_model_id IS NULL;
