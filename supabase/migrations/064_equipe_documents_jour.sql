-- Onglet « Équipe » : documents par jour et par équipe (PDF à signer, photos
-- du chantier…) et note libre rédigée par l'utilisateur.

CREATE TABLE IF NOT EXISTS team_day_notes (
  team SMALLINT NOT NULL CHECK (team BETWEEN 1 AND 4),
  day DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team, day)
);

CREATE TABLE IF NOT EXISTS team_day_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team SMALLINT NOT NULL CHECK (team BETWEEN 1 AND 4),
  day DATE NOT NULL,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size BIGINT NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_day_files_day_idx ON team_day_files (day, team);
CREATE INDEX IF NOT EXISTS team_day_files_uploaded_by_idx ON team_day_files (uploaded_by);
CREATE INDEX IF NOT EXISTS team_day_notes_updated_by_idx ON team_day_notes (updated_by);

-- RLS sans politique : tout passe par les routes API (service role).
ALTER TABLE team_day_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_day_files ENABLE ROW LEVEL SECURITY;

-- Bucket privé ; l'envoi se fait par URL signée émise par l'API.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('equipe-docs', 'equipe-docs', false, 52428800)
ON CONFLICT (id) DO NOTHING;
