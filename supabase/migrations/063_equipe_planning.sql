-- Onglet « Équipe » : planning hebdomadaire des 4 équipes de pose.
-- Chaque créneau peut être relié à un produit du stockage. Si le matériel est
-- « pris du stock », la quantité est retirée de products.quantity ; sinon il
-- est marqué « à commander » (ou « commandé ») et le stock n'est pas touché.

CREATE TABLE IF NOT EXISTS team_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team SMALLINT NOT NULL CHECK (team BETWEEN 1 AND 4),
  install_date DATE NOT NULL,
  client_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  notes TEXT,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  -- Libellé libre (ou copie du nom du produit) : reste lisible même si le
  -- produit est supprimé du stockage ou n'y a jamais existé.
  product_label TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  stock_status TEXT NOT NULL DEFAULT 'stock'
    CHECK (stock_status IN ('stock', 'a_commander', 'commande')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_installations_date_idx ON team_installations (install_date, team);
CREATE INDEX IF NOT EXISTS team_installations_product_idx ON team_installations (product_id);
CREATE INDEX IF NOT EXISTS team_installations_created_by_idx ON team_installations (created_by);

-- RLS sans politique : tout passe par les routes API (service role).
ALTER TABLE team_installations ENABLE ROW LEVEL SECURITY;

-- Ajustement atomique du stock : refuse de passer sous zéro.
CREATE OR REPLACE FUNCTION public.adjust_product_stock(p_product_id UUID, p_delta INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_qty INTEGER;
BEGIN
  UPDATE products
     SET quantity = quantity + p_delta,
         updated_at = now()
   WHERE id = p_product_id
     AND quantity + p_delta >= 0
  RETURNING quantity INTO new_qty;

  IF new_qty IS NULL THEN
    RAISE EXCEPTION 'STOCK_INSUFFISANT';
  END IF;
  RETURN new_qty;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_product_stock(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(UUID, INTEGER) TO service_role;
