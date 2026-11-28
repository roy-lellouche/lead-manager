-- Onglet « Équipe » : heure de RDV (ordre de la tournée) et coordonnées
-- géocodées de l'adresse, pour le calcul kilométrique hebdomadaire
-- (départ et retour à Cormeilles-en-Parisis).

ALTER TABLE team_installations ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE team_installations ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE team_installations ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
-- Adresse effectivement géocodée : si elle change, les coordonnées sont recalculées.
ALTER TABLE team_installations ADD COLUMN IF NOT EXISTS geocoded_address TEXT;
