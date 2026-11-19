-- Migration 052 : suivi des factures fournisseurs
-- Chaque facture reçue est déposée (PDF / photo), lue automatiquement par IA,
-- rattachée à un fournisseur (table suppliers existante) et suivie jusqu'au paiement.

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  -- Nom lu sur la facture : conservé si le fournisseur est supprimé.
  supplier_name text,
  invoice_number text,
  invoice_date date,
  due_date date,
  amount_ht numeric(12, 2),
  amount_tva numeric(12, 2),
  amount_ttc numeric(12, 2),
  amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
  paid_at date,
  description text,
  notes text,
  -- true tant qu'un humain n'a pas vérifié une lecture incomplète ou en échec.
  needs_review boolean NOT NULL DEFAULT false,
  extraction jsonb,
  file_name text,
  storage_path text,
  file_size integer,
  mime_type text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_invoices_supplier_idx ON supplier_invoices (supplier_id);
CREATE INDEX IF NOT EXISTS supplier_invoices_due_idx ON supplier_invoices (due_date);
CREATE INDEX IF NOT EXISTS supplier_invoices_created_by_idx ON supplier_invoices (created_by);

-- Accès uniquement via les routes serveur (service role) réservées à l'admin.
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;

-- Fichiers : bucket privé, lecture par URLs signées générées côté serveur.
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-invoices', 'supplier-invoices', false)
ON CONFLICT (id) DO NOTHING;
