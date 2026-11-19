-- Migration 054 : détail ligne par ligne des factures fournisseurs
CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  position integer NOT NULL,
  reference text,
  description text NOT NULL,
  quantity numeric(12, 3),
  unit_price numeric(12, 4),
  amount numeric(12, 2),
  -- Ligne de commentaire (ex. « CLIENT BAROUDI 60 ») : pas de montant.
  is_comment boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS supplier_invoice_lines_invoice_idx ON supplier_invoice_lines (invoice_id, position);
ALTER TABLE supplier_invoice_lines ENABLE ROW LEVEL SECURITY;

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS delivery_date date,
  -- texte : lu directement dans le PDF · ia : lu par IA · manuel : saisi à la main
  ADD COLUMN IF NOT EXISTS parse_source text;
