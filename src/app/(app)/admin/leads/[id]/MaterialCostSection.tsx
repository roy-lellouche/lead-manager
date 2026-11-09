"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface ProductType {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  product_types?: ProductType | null;
}

interface LeadMaterial {
  id: string;
  product_id: string;
  quantity: number;
  products: Product;
}

export interface SelectedMaterial {
  product_id: string;
  quantity: number;
  product?: { id: string; name: string; price: number };
}

interface MaterialCostSectionProps {
  leadId: string;
  materialCost: number | null;
  materialCostComment: string;
  onMaterialCostChange: (value: number | null) => void;
  onMaterialCostCommentChange: (value: string) => void;
  onMaterialsChange: (materials: SelectedMaterial[]) => void;
  selectedMaterials: SelectedMaterial[];
}

const INPUT_CLS =
  "h-9 w-full px-3 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40";

export function MaterialCostSection({
  leadId,
  materialCost,
  materialCostComment,
  onMaterialCostChange,
  onMaterialCostCommentChange,
  onMaterialsChange,
  selectedMaterials,
}: MaterialCostSectionProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addProductId, setAddProductId] = useState("");

  useEffect(() => {
    async function load() {
      const [productsRes, materialsRes] = await Promise.all([
        fetch("/api/admin/products").then((r) => r.json()),
        fetch(`/api/admin/leads/${leadId}/materials`).then((r) => r.json()),
      ]);

      if (Array.isArray(productsRes)) setProducts(productsRes);

      if (Array.isArray(materialsRes) && materialsRes.length > 0) {
        const mapped: SelectedMaterial[] = materialsRes.map((m: LeadMaterial) => ({
          product_id: m.product_id,
          quantity: m.quantity,
          product: m.products,
        }));
        onMaterialsChange(mapped);
        const sum = mapped.reduce(
          (s, m) => s + (m.product?.price ?? 0) * m.quantity,
          0
        );
        onMaterialCostChange(sum);
      }

      setLoading(false);
    }
    load();
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMaterial = (product: Product, qty = 1) => {
    const existing = selectedMaterials.find((m) => m.product_id === product.id);
    if (existing) {
      updateQuantity(product.id, existing.quantity + qty);
    } else {
      const next = [
        ...selectedMaterials,
        { product_id: product.id, quantity: qty, product },
      ];
      onMaterialsChange(next);
      const sum = next.reduce(
        (s, m) => s + (m.product?.price ?? 0) * m.quantity,
        0
      );
      onMaterialCostChange(sum);
    }
  };

  const removeMaterial = (productId: string) => {
    const next = selectedMaterials.filter((m) => m.product_id !== productId);
    onMaterialsChange(next);
    const sum = next.reduce(
      (s, m) => s + (m.product?.price ?? 0) * m.quantity,
      0
    );
    onMaterialCostChange(sum);
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const qty = Math.max(1, quantity);
    const next = selectedMaterials.map((m) =>
      m.product_id === productId ? { ...m, quantity: qty } : m
    );
    onMaterialsChange(next);
    const sum = next.reduce(
      (s, m) => s + (m.product?.price ?? 0) * m.quantity,
      0
    );
    onMaterialCostChange(sum);
  };

  const calculatedTotal = selectedMaterials.reduce(
    (s, m) => s + (m.product?.price ?? 0) * m.quantity,
    0
  );

  const availableProducts = products.filter(
    (p) => !selectedMaterials.some((m) => m.product_id === p.id)
  );

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-canvas rounded-[9px] mb-2" />
        <div className="h-10 bg-canvas rounded-[9px]" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">
          Matériaux sélectionnés
        </label>
        <div className="flex gap-2 flex-wrap">
          <select
            value={addProductId}
            onChange={(e) => {
              const id = e.target.value;
              setAddProductId("");
              if (id) {
                const p = products.find((x) => x.id === id);
                if (p) addMaterial(p);
              }
            }}
            className="h-9 px-3 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 flex-1 min-w-[200px]"
          >
            <option value="">Ajouter un matériel...</option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({Number(p.price).toFixed(2)} €)
              </option>
            ))}
          </select>
        </div>

        {selectedMaterials.length > 0 && (
          <ul className="mt-2 space-y-2">
            {selectedMaterials.map((m) => (
              <li
                key={m.product_id}
                className="flex items-center gap-2 py-2 px-3 bg-canvas rounded-[9px] border border-line"
              >
                <span className="flex-1 text-sm text-ink">
                  {m.product?.name ?? "—"}
                </span>
                <span className="text-subtle text-sm">
                  {Number(m.product?.price ?? 0).toFixed(2)} € ×
                </span>
                <input
                  type="number"
                  min="1"
                  value={m.quantity}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) updateQuantity(m.product_id, v);
                  }}
                  className="w-14 px-2 py-1 border border-line rounded-[9px] text-center text-sm bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
                <span className="text-ink font-medium text-sm">
                  = {(Number(m.product?.price ?? 0) * m.quantity).toFixed(2)} €
                </span>
                <button
                  type="button"
                  onClick={() => removeMaterial(m.product_id)}
                  className="p-1 rounded-[6px] hover:bg-line transition-colors text-subtle"
                  title="Retirer"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedMaterials.length > 0 && (
          <p className="text-sm text-subtle mt-1.5">
            Total calculé : <span className="font-medium text-ink">{calculatedTotal.toFixed(2)} €</span>
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">
          Coût matériel (€)
        </label>
        <input
          type="number"
          step="0.01"
          value={materialCost ?? ""}
          onChange={(e) =>
            onMaterialCostChange(
              e.target.value ? parseFloat(e.target.value) : null
            )
          }
          className={INPUT_CLS}
        />
        <p className="text-xs text-subtle mt-1">
          Modifiable manuellement si besoin
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">
          Commentaire
        </label>
        <input
          type="text"
          placeholder="Commentaire"
          value={materialCostComment}
          onChange={(e) => onMaterialCostCommentChange(e.target.value)}
          className={INPUT_CLS}
        />
      </div>
    </div>
  );
}
