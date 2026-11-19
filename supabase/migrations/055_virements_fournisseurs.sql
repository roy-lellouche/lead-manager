-- Migration 055 : virements aux fournisseurs
-- Un virement est imputé sur les factures du fournisseur (échéances les plus
-- anciennes d'abord, ou factures choisies). Le reste éventuel est un crédit
-- (avance) chez le fournisseur.

CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  label text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx ON supplier_payments (supplier_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS supplier_payments_created_by_idx ON supplier_payments (created_by);
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS supplier_payment_alloc_payment_idx ON supplier_payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS supplier_payment_alloc_invoice_idx ON supplier_payment_allocations (invoice_id);
ALTER TABLE supplier_payment_allocations ENABLE ROW LEVEL SECURITY;

-- Enregistre un virement et l'impute, dans une seule transaction.
-- p_invoice_ids : factures choisies (null = toutes les factures ouvertes du fournisseur).
-- Ordre d'imputation : échéance la plus ancienne d'abord.
CREATE OR REPLACE FUNCTION record_supplier_payment(
  p_supplier_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_label text,
  p_created_by uuid,
  p_invoice_ids uuid[] DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_left numeric := round(p_amount, 2);
  v_inv record;
  v_alloc numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant invalide';
  END IF;

  INSERT INTO supplier_payments (supplier_id, amount, paid_on, label, created_by)
  VALUES (p_supplier_id, round(p_amount, 2), coalesce(p_paid_on, CURRENT_DATE), nullif(trim(p_label), ''), p_created_by)
  RETURNING id INTO v_payment_id;

  FOR v_inv IN
    SELECT id, amount_ttc, amount_paid
    FROM supplier_invoices
    WHERE supplier_id = p_supplier_id
      AND amount_ttc > 0
      AND amount_paid < amount_ttc
      AND (p_invoice_ids IS NULL OR id = ANY (p_invoice_ids))
    ORDER BY due_date ASC NULLS LAST, invoice_date ASC NULLS LAST, invoice_number ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_alloc := least(v_left, v_inv.amount_ttc - v_inv.amount_paid);
    INSERT INTO supplier_payment_allocations (payment_id, invoice_id, amount)
    VALUES (v_payment_id, v_inv.id, v_alloc);
    UPDATE supplier_invoices
    SET amount_paid = amount_paid + v_alloc,
        paid_at = CASE WHEN amount_paid + v_alloc >= amount_ttc THEN coalesce(p_paid_on, CURRENT_DATE) ELSE NULL END,
        updated_at = now()
    WHERE id = v_inv.id;
    v_left := v_left - v_alloc;
  END LOOP;

  RETURN v_payment_id;
END;
$$;

-- Annule un virement : les montants imputés sont retirés des factures.
CREATE OR REPLACE FUNCTION delete_supplier_payment(p_payment_id uuid) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_a record;
BEGIN
  FOR v_a IN SELECT invoice_id, amount FROM supplier_payment_allocations WHERE payment_id = p_payment_id LOOP
    UPDATE supplier_invoices
    SET amount_paid = greatest(0, amount_paid - v_a.amount),
        paid_at = NULL,
        updated_at = now()
    WHERE id = v_a.invoice_id;
  END LOOP;
  DELETE FROM supplier_payments WHERE id = p_payment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_supplier_payment(uuid, numeric, date, text, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION delete_supplier_payment(uuid) FROM PUBLIC, anon, authenticated;
