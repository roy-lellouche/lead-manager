"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, Package, Layers, Euro, GripVertical, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

const INPUT_CLS =
  "w-full px-3 py-2 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40";
const SELECT_CLS =
  "w-full px-3 py-2 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40";
const LABEL_CLS = "block text-sm font-medium text-ink mb-1.5";

interface ProductType {
  id: string;
  name: string;
  display_order?: number;
}

interface Supplier {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
  product_type_id: string;
  product_types: ProductType | null;
  color: string | null;
  supplier_id: string | null;
  suppliers: Supplier | null;
  display_order: number;
}

interface StockageClientProps {
  initialProducts: Product[];
  initialProductTypes: ProductType[];
  initialSuppliers: Supplier[];
}

export function StockageClient({
  initialProducts,
  initialProductTypes,
  initialSuppliers,
}: StockageClientProps) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [productTypes, setProductTypes] = useState<ProductType[]>(initialProductTypes);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductTypeId, setNewProductTypeId] = useState("");
  const [newProductColor, setNewProductColor] = useState("");
  const [newProductSupplierId, setNewProductSupplierId] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [showNewTypeInput, setShowNewTypeInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editTypeId, setEditTypeId] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editSupplierId, setEditSupplierId] = useState("");
  const [editingType, setEditingType] = useState<ProductType | null>(null);
  const [editTypeName, setEditTypeName] = useState("");
  const [showSuppliersModal, setShowSuppliersModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const quantitySaveTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (productTypes.length > 0 && !newProductTypeId) {
      setNewProductTypeId(productTypes[0].id);
    }
  }, [productTypes, newProductTypeId]);

  useEffect(() => {
    return () => {
      Object.values(quantitySaveTimeoutsRef.current).forEach(clearTimeout);
      quantitySaveTimeoutsRef.current = {};
    };
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim() || !newProductTypeId) return;
    const price = parseFloat(newProductPrice);
    if (isNaN(price) || price < 0) return;

    setLoading(true);
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newProductName.trim(),
        price,
        product_type_id: newProductTypeId,
        quantity: 0,
        color: newProductColor || null,
        supplier_id: newProductSupplierId || null,
      }),
    });
    setLoading(false);

    if (res.ok) {
      const created = await res.json();
      setProducts((prev) => [...prev, created]);
      setNewProductName("");
      setNewProductPrice("");
      setNewProductColor("");
      setNewProductSupplierId("");
      setNewProductTypeId(productTypes[0]?.id || "");
      setShowAddModal(false);
      router.refresh();
    }
  };

  const handleCreateType = async () => {
    if (!newTypeName.trim()) return;

    setLoading(true);
    const res = await fetch("/api/admin/product-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTypeName.trim(),
        display_order: productTypes.length,
      }),
    });
    setLoading(false);

    if (res.ok) {
      const created = await res.json();
      setProductTypes((prev) => [...prev, created]);
      setNewProductTypeId(created.id);
      setNewTypeName("");
      setShowNewTypeInput(false);
      router.refresh();
    }
  };

  const handleUpdateType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingType) return;
    if (!editTypeName.trim()) return;

    setLoading(true);
    const res = await fetch(`/api/admin/product-types/${editingType.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editTypeName.trim() }),
    });
    setLoading(false);

    if (res.ok) {
      const updated = await res.json();
      setProductTypes((prev) =>
        prev.map((t) => (t.id === editingType.id ? updated : t))
      );
      setEditingType(null);
      router.refresh();
    }
  };

  const handleDeleteType = async (type: ProductType, e: React.MouseEvent) => {
    e.stopPropagation();
    const typeProducts = productsByType[type.id] || [];
    if (typeProducts.length > 0) {
      const ok = confirm(
        `Le type « ${type.name} » contient ${typeProducts.length} produit(s). Les supprimer aussi ?`
      );
      if (!ok) return;
    } else if (!confirm(`Supprimer le type « ${type.name} » ?`)) {
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/admin/product-types/${type.id}`, {
      method: "DELETE",
    });
    setLoading(false);

    if (res.ok) {
      setProductTypes((prev) => prev.filter((t) => t.id !== type.id));
      setProducts((prev) => prev.filter((p) => p.product_type_id !== type.id));
      if (editingType?.id === type.id) setEditingType(null);
      if (newProductTypeId === type.id) {
        const remaining = productTypes.filter((t) => t.id !== type.id);
        setNewProductTypeId(remaining[0]?.id || "");
      }
      router.refresh();
    }
  };

  const handleUpdateQuantity = async (productId: string, quantity: number) => {
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: Math.max(0, quantity) }),
    });

    if (res.ok) {
      const updated = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? updated : p))
      );
      router.refresh();
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!editName.trim() || !editTypeId) return;
    const price = parseFloat(editPrice);
    if (isNaN(price) || price < 0) return;

    setLoading(true);
    const res = await fetch(`/api/admin/products/${editingProduct.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        price,
        product_type_id: editTypeId,
        color: editColor || null,
        supplier_id: editSupplierId || null,
      }),
    });
    setLoading(false);

    if (res.ok) {
      const updated = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === editingProduct.id ? updated : p))
      );
      setEditingProduct(null);
      router.refresh();
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditName(product.name);
    setEditPrice(String(product.price));
    setEditTypeId(product.product_type_id);
    setEditColor(product.color || "");
    setEditSupplierId(product.supplier_id || "");
  };

  const handleDeleteProduct = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Supprimer le produit « ${product.name} » ?`)) return;

    setLoading(true);
    const res = await fetch(`/api/admin/products/${product.id}`, {
      method: "DELETE",
    });
    setLoading(false);

    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      if (editingProduct?.id === product.id) setEditingProduct(null);
      router.refresh();
    }
  };

  const openEditTypeModal = (type: ProductType) => {
    setEditingType(type);
    setEditTypeName(type.name);
  };

  // Suppliers
  const handleCreateSupplier = async () => {
    if (!newSupplierName.trim()) return;
    setLoading(true);
    const res = await fetch("/api/admin/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSupplierName.trim() }),
    });
    setLoading(false);
    if (res.ok) {
      const created = await res.json();
      setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSupplierName("");
    }
  };

  const handleDeleteSupplier = async (supplier: Supplier) => {
    if (!confirm(`Supprimer le fournisseur « ${supplier.name} » ?`)) return;
    setLoading(true);
    const res = await fetch(`/api/admin/suppliers/${supplier.id}`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) {
      setSuppliers((prev) => prev.filter((s) => s.id !== supplier.id));
      setProducts((prev) =>
        prev.map((p) => p.supplier_id === supplier.id ? { ...p, supplier_id: null, suppliers: null } : p)
      );
    }
  };

  // Drag and drop
  const handleDragStart = useCallback((e: React.DragEvent, productId: string) => {
    setDraggedProductId(productId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", productId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetProductId: string) => {
    e.preventDefault();
    if (!draggedProductId || draggedProductId === targetProductId) {
      setDraggedProductId(null);
      return;
    }

    const newProducts = [...products];
    const draggedIndex = newProducts.findIndex((p) => p.id === draggedProductId);
    const targetIndex = newProducts.findIndex((p) => p.id === targetProductId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedProductId(null);
      return;
    }

    const [removed] = newProducts.splice(draggedIndex, 1);
    newProducts.splice(targetIndex, 0, removed);

    const reordered = newProducts.map((p, i) => ({ ...p, display_order: i }));
    setProducts(reordered);
    setDraggedProductId(null);

    await fetch("/api/admin/products/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: reordered.map((p) => ({ id: p.id, display_order: p.display_order })),
      }),
    });
  }, [draggedProductId, products]);

  const handleDragEnd = useCallback(() => {
    setDraggedProductId(null);
  }, []);

  const productsByType = productTypes.reduce<Record<string, Product[]>>(
    (acc, type) => {
      acc[type.id] = products.filter((p) => p.product_type_id === type.id);
      return acc;
    },
    {}
  );

  const totalQuantity = products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
  const totalAmount = products.reduce(
    (sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.price) || 0),
    0
  );

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[14px] border border-line bg-white shadow-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-[9px] bg-line-soft p-3">
              <Package className="w-6 h-6 text-ink" />
            </div>
            <div>
              <p className="text-sm font-medium text-subtle">Produits différents</p>
              <p className="text-2xl font-bold text-ink">{products.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[14px] border border-line bg-white shadow-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-[9px] bg-line-soft p-3">
              <Layers className="w-6 h-6 text-ink" />
            </div>
            <div>
              <p className="text-sm font-medium text-subtle">Quantité totale</p>
              <p className="text-2xl font-bold text-ink">{totalQuantity}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 shadow-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-[9px] bg-emerald-100 p-3">
              <Euro className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-600">Valeur totale</p>
              <p className="text-2xl font-bold text-emerald-800">
                {totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Header + boutons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-semibold text-ink">Catalogue des produits</h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowSuppliersModal(true)}
            className="gap-2 border-line text-ink hover:bg-line-soft"
          >
            <Truck className="w-4 h-4" />
            Fournisseurs
          </Button>
          <Button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="gap-2 bg-brand hover:bg-brand-hover text-white"
          >
            <Plus className="w-4 h-4" />
            Ajouter un produit
          </Button>
        </div>
      </div>

      {/* Grille produits */}
      <div>
        {products.length === 0 ? (
          <div className="rounded-[14px] border-2 border-dashed border-line bg-panel p-12 text-center">
            <Package className="w-12 h-12 text-line-strong mx-auto mb-3" />
            <p className="text-subtle font-medium">Aucun produit</p>
            <p className="text-faint text-sm mt-1">
              Cliquez sur « Ajouter un produit » pour commencer.
            </p>
            <Button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="mt-4 bg-brand hover:bg-brand-hover text-white"
            >
              Ajouter un produit
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {products.map((product) => {
              const typeName = product.product_types?.name || productTypes.find((t) => t.id === product.product_type_id)?.name || "";
              const supplierName = product.suppliers?.name || suppliers.find((s) => s.id === product.supplier_id)?.name || "";
              const isDragging = draggedProductId === product.id;
              return (
                <div
                  key={product.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, product.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, product.id)}
                  onDragEnd={handleDragEnd}
                  className={`rounded-[14px] border bg-white p-3 shadow-card hover:shadow-md transition-all flex flex-col min-w-0 relative ${
                    isDragging ? "opacity-40 border-brand" : "border-line"
                  }`}
                  style={product.color ? { borderLeftWidth: "4px", borderLeftColor: product.color } : undefined}
                >
                  <div className="absolute top-1 left-1 cursor-grab active:cursor-grabbing text-line-strong hover:text-subtle">
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                  {typeName && (
                    <span className="text-[10px] font-medium text-subtle bg-line-soft px-1.5 py-0.5 rounded w-fit mb-1.5 truncate max-w-full ml-3">
                      {typeName}
                    </span>
                  )}
                  {supplierName && (
                    <span className="text-[10px] font-medium text-brand bg-brand-soft px-1.5 py-0.5 rounded w-fit mb-1.5 truncate max-w-full">
                      {supplierName}
                    </span>
                  )}
                  <div className="flex justify-between items-start gap-1 mb-1.5">
                    <h4 className="font-medium text-ink line-clamp-2 text-xs flex-1 min-w-0">{product.name}</h4>
                    <div className="flex items-center shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(product)}
                        className="p-1 rounded hover:bg-line-soft text-subtle hover:text-ink"
                        title="Modifier"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteProduct(product, e)}
                        disabled={loading}
                        className="p-1 rounded hover:bg-red-50 text-subtle hover:text-red-600 disabled:opacity-50"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-ink mb-2">
                    {Number(product.price).toFixed(2)} €
                  </p>
                  <div className="flex items-center gap-1 mt-auto">
                    <label className="text-[10px] text-subtle">Qté</label>
                    <input
                      type="number"
                      min="0"
                      value={product.quantity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v >= 0) {
                          setProducts((prev) =>
                            prev.map((p) =>
                              p.id === product.id ? { ...p, quantity: v } : p
                            )
                          );
                          const pid = product.id;
                          if (quantitySaveTimeoutsRef.current[pid])
                            clearTimeout(quantitySaveTimeoutsRef.current[pid]);
                          quantitySaveTimeoutsRef.current[pid] = setTimeout(() => {
                            delete quantitySaveTimeoutsRef.current[pid];
                            handleUpdateQuantity(pid, v);
                          }, 500);
                        }
                      }}
                      className="w-12 px-1 py-1 border border-line rounded text-center text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section types */}
      {productTypes.length > 0 && (
        <details className="rounded-[14px] border border-line bg-panel p-4">
          <summary className="cursor-pointer font-medium text-subtle text-sm">
            Gérer les types de produits ({productTypes.length})
          </summary>
          <div className="mt-4 flex flex-wrap gap-2">
            {productTypes.map((type) => (
              <div
                key={type.id}
                className="flex items-center gap-1 bg-white rounded-[9px] px-3 py-2 border border-line"
              >
                <span className="text-sm text-ink">{type.name}</span>
                <button
                  type="button"
                  onClick={() => openEditTypeModal(type)}
                  className="p-1 rounded hover:bg-line-soft text-subtle"
                  title="Modifier"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDeleteType(type, e)}
                  disabled={loading}
                  className="p-1 rounded hover:bg-red-50 text-red-500 disabled:opacity-50"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Modal : Ajouter un produit */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="rounded-[14px] border border-line bg-white shadow-[0_4px_24px_rgba(16,24,40,.12)] p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-ink">Nouveau produit</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-[9px] hover:bg-line-soft text-subtle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div>
                <label className={LABEL_CLS}>
                  Nom complet du produit
                </label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="Ex: PAC Daikin 5 kW"
                  className={INPUT_CLS}
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Prix (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newProductPrice}
                  onChange={(e) => setNewProductPrice(e.target.value)}
                  placeholder="0.00"
                  className={INPUT_CLS}
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Type de produit
                </label>
                <div className="flex gap-2">
                  <select
                    value={newProductTypeId}
                    onChange={(e) => setNewProductTypeId(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
                  >
                    {productTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewTypeInput(!showNewTypeInput)}
                    className="px-3 py-2 border border-line rounded-[9px] hover:bg-line-soft text-subtle"
                    title="Ajouter un type"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {showNewTypeInput && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      placeholder="Nouveau type..."
                      className="flex-1 px-3 py-2 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
                      onKeyDown={(e) =>
                        e.key === "Enter" && (e.preventDefault(), handleCreateType())
                      }
                    />
                    <button
                      type="button"
                      onClick={handleCreateType}
                      disabled={!newTypeName.trim() || loading}
                      className="px-4 py-2 bg-ink text-white rounded-[9px] hover:bg-ink-soft disabled:opacity-50 text-sm font-medium"
                    >
                      Créer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewTypeInput(false);
                        setNewTypeName("");
                      }}
                      className="px-3 py-2 border border-line rounded-[9px] hover:bg-line-soft text-subtle"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Fournisseur
                </label>
                <select
                  value={newProductSupplierId}
                  onChange={(e) => setNewProductSupplierId(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="">— Aucun —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Couleur du produit
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newProductColor || "#000000"}
                    onChange={(e) => setNewProductColor(e.target.value)}
                    className="w-10 h-10 rounded-[9px] border border-line cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={newProductColor}
                    onChange={(e) => setNewProductColor(e.target.value)}
                    placeholder="#000000"
                    className="flex-1 px-3 py-2 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
                  />
                  {newProductColor && (
                    <button
                      type="button"
                      onClick={() => setNewProductColor("")}
                      className="text-sm text-subtle hover:text-ink"
                    >
                      Effacer
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 border-line text-subtle hover:bg-line-soft"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !newProductName.trim() || !newProductTypeId}
                  className="flex-1 bg-brand hover:bg-brand-hover text-white disabled:opacity-50"
                >
                  Créer le produit
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Modifier produit */}
      {editingProduct && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setEditingProduct(null)}
        >
          <div
            className="rounded-[14px] border border-line bg-white shadow-[0_4px_24px_rgba(16,24,40,.12)] p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-ink">Modifier le produit</h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-2 rounded-[9px] hover:bg-line-soft text-subtle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateProduct} className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Nom</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={INPUT_CLS}
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Prix (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className={INPUT_CLS}
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Type</label>
                <select
                  value={editTypeId}
                  onChange={(e) => setEditTypeId(e.target.value)}
                  className={SELECT_CLS}
                >
                  {productTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Fournisseur
                </label>
                <select
                  value={editSupplierId}
                  onChange={(e) => setEditSupplierId(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="">— Aucun —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Couleur du produit
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={editColor || "#000000"}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-10 h-10 rounded-[9px] border border-line cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    placeholder="#000000"
                    className="flex-1 px-3 py-2 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
                  />
                  {editColor && (
                    <button
                      type="button"
                      onClick={() => setEditColor("")}
                      className="text-sm text-subtle hover:text-ink"
                    >
                      Effacer
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingProduct(null)}
                  className="flex-1 border-line text-subtle hover:bg-line-soft"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-brand hover:bg-brand-hover text-white disabled:opacity-50"
                >
                  Enregistrer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Modifier type */}
      {editingType && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setEditingType(null)}
        >
          <div
            className="rounded-[14px] border border-line bg-white shadow-[0_4px_24px_rgba(16,24,40,.12)] p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-ink">Modifier le type</h3>
              <button
                type="button"
                onClick={() => setEditingType(null)}
                className="p-2 rounded-[9px] hover:bg-line-soft text-subtle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateType} className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Nom du type</label>
                <input
                  type="text"
                  value={editTypeName}
                  onChange={(e) => setEditTypeName(e.target.value)}
                  className={INPUT_CLS}
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingType(null)}
                  className="flex-1 border-line text-subtle hover:bg-line-soft"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-brand hover:bg-brand-hover text-white disabled:opacity-50"
                >
                  Enregistrer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Gestion des fournisseurs */}
      {showSuppliersModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowSuppliersModal(false)}
        >
          <div
            className="rounded-[14px] border border-line bg-white shadow-[0_4px_24px_rgba(16,24,40,.12)] p-6 max-w-md w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-ink">Fournisseurs</h3>
              <button
                type="button"
                onClick={() => setShowSuppliersModal(false)}
                className="p-2 rounded-[9px] hover:bg-line-soft text-subtle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="Nom du fournisseur..."
                className="flex-1 px-3 py-2 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateSupplier();
                  }
                }}
              />
              <Button
                type="button"
                onClick={handleCreateSupplier}
                disabled={!newSupplierName.trim() || loading}
                className="bg-brand hover:bg-brand-hover text-white disabled:opacity-50"
              >
                Ajouter
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {suppliers.length === 0 ? (
                <p className="text-sm text-subtle text-center py-4">
                  Aucun fournisseur. Ajoutez-en un ci-dessus.
                </p>
              ) : (
                suppliers.map((supplier) => (
                  <div
                    key={supplier.id}
                    className="flex items-center justify-between px-4 py-3 bg-panel rounded-[9px] border border-line"
                  >
                    <span className="text-sm font-medium text-ink">{supplier.name}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteSupplier(supplier)}
                      disabled={loading}
                      className="p-1.5 rounded-[9px] hover:bg-red-50 text-red-500 disabled:opacity-50"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
