-- Onglet « DOC CEE » : le responsable CEE demande des documents par mandataire,
-- le secrétariat les dépose (PDF, images…). Nouveau rôle « cee » qui ne voit
-- que cet onglet ; admin et secrétaire y ont aussi accès.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'telepro', 'secretaire', 'stockage', 'cee'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('admin', 'telepro', 'secretaire', 'stockage', 'cee')
        THEN NEW.raw_user_meta_data->>'role'
      ELSE 'telepro'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS cee_doc_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandataire TEXT NOT NULL
    CHECK (mandataire IN ('omega', 'house', 'ace', 'drapo', 'homelior', 'hellio', 'synerciel')),
  client_name TEXT NOT NULL,
  document TEXT NOT NULL,
  -- Commentaire du responsable CEE (demandeur) et réponse du secrétariat.
  request_comment TEXT,
  response_comment TEXT,
  -- [{ path, name, type, size, uploaded_at }] dans le bucket privé cee-docs.
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cee_doc_requests_created_at_idx ON cee_doc_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS cee_doc_requests_created_by_idx ON cee_doc_requests (created_by);

-- RLS sans politique : tout passe par les routes API (service role).
ALTER TABLE cee_doc_requests ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('cee-docs', 'cee-docs', false)
ON CONFLICT (id) DO NOTHING;
