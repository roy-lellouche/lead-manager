-- DOC CEE : le dossier passe « complet » sur action explicite du secrétariat
-- ou du télépro (completed_at / completed_by), ce qui déclenche l'email de
-- notification. Déposer un document ne suffit plus : la demande passe orange.
ALTER TABLE cee_doc_requests
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cee_doc_requests_completed_by_idx ON cee_doc_requests (completed_by);
