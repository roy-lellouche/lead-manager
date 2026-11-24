-- DOC CEE : la demande peut être assignée à un télépro, qui la voit dans son
-- espace (/telepro/doc-cee) pour récupérer le document auprès du client.
ALTER TABLE cee_doc_requests
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS telepro_comment TEXT;

CREATE INDEX IF NOT EXISTS cee_doc_requests_assigned_to_idx ON cee_doc_requests (assigned_to);
