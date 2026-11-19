-- Migration 053 : factures fournisseurs rattachées aux chantiers (leads)
-- Un PDF déposé peut contenir plusieurs factures : chacune devient une ligne
-- avec ses pages. La référence client écrite sur la facture (ex. « CLIENT BAROUDI 60 »)
-- sert à retrouver automatiquement le lead correspondant.

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  -- Texte de référence client tel qu'écrit sur la facture.
  ADD COLUMN IF NOT EXISTS client_reference text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_department text,
  -- auto : rattaché automatiquement · manuel : choisi à la main ·
  -- a_associer : référence client trouvée mais lead incertain · stock : pas de client
  ADD COLUMN IF NOT EXISTS lead_match text NOT NULL DEFAULT 'stock'
    CHECK (lead_match IN ('auto', 'manuel', 'a_associer', 'stock')),
  ADD COLUMN IF NOT EXISTS order_reference text,
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS source_pages text;

CREATE INDEX IF NOT EXISTS supplier_invoices_lead_idx ON supplier_invoices (lead_id);
CREATE INDEX IF NOT EXISTS supplier_invoices_number_idx ON supplier_invoices (supplier_id, invoice_number);
