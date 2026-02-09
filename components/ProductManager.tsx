import React, { useMemo, useState } from 'react';
import { Product } from '../types';
import { Plus, Trash2, Package, Image as ImageIcon, Edit2, X, Check, Tag, GripVertical } from 'lucide-react';
import { compressImage, formatCurrency } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { RichTextEditor } from './RichTextEditor';
import { getImageUrl } from '@/helper/imageDB';
import { ProductThumb } from './ProductThumb';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ProductManagerProps {
  products: Product[];
  onAdd: (product: Product) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Product>) => void;
  onDownloadPdfAll?: () => void;
  onDownloadPdfByCategory?: (category: string) => void;
}

function SortableCard({
  id,
  children,
}: {
  id: string;
  children: (props: {
    dragListeners: any;
    dragAttributes: any;
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.95 : 1,
    touchAction: "none",
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({
        dragListeners: listeners,
        dragAttributes: attributes,
        isDragging,
      })}
    </div>
  );
}

export const ProductManager: React.FC<ProductManagerProps> = ({
  products,
  onAdd,
  onRemove,
  onUpdate,
  onDownloadPdfAll,
  onDownloadPdfByCategory,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    description: '',
    quantity: '',
    image: '',
    imageId: '',
    category: '', // NUEVO
    featured: false,
    hidden: false,
  });

  const [imagePreview, setImagePreview] = useState<string>('');

  const [categoryMode, setCategoryMode] = useState<"select" | "new">("select");
  const [newCategory, setNewCategory] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>('__ALL__');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;

    const ids = orderedProducts.map((p) => p.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));

    if (oldIndex === -1 || newIndex === -1) return;

    const newIds = arrayMove(ids, oldIndex, newIndex);

    newIds.forEach((id, index) => {
      onUpdate(id, { order: index });
    });
  };


  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      const raw = (p.category || "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!map.has(key)) map.set(key, raw);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (categoryFilter === '__ALL__') return products;
    return products.filter((p) => (p.category || '').trim() === categoryFilter);
  }, [products, categoryFilter]);

  const orderedProducts = useMemo(() => {
    const arr = [...filteredProducts];

    arr.sort((a, b) => {
      const ao = typeof a.order === "number" ? a.order : Number(a.id);
      const bo = typeof b.order === "number" ? b.order : Number(b.id);
      return ao - bo;
    });

    return arr;
  }, [filteredProducts]);

  const resetForm = () => {
    setFormData({ name: '', price: '', quantity: '', description: '', image: '', imageId: '', category: '', featured: false, hidden: false });
    setCategoryMode("select");
    setNewCategory("");
    setIsAdding(false);
    setEditingId(null);
    setImagePreview('');
  };


  const handleOpenEdit = async (product: Product) => {
    setFormData({
      name: product.name,
      price: product.price.toString(),
      quantity: product.quantity === undefined || product.quantity === null
        ? ''
        : String(product.quantity),
      description: product.description,
      image: product.image || '',
      imageId: product.imageId || '',
      category: (product.category || '').trim(),
      featured: !!product.featured,
      hidden: !!product.hidden,
    });

    setCategoryMode("select");
    setNewCategory("");

    setEditingId(product.id);
    setIsAdding(false);

    if (product.image) {
      setImagePreview(product.image);
      return;
    }

    if (product.imageId) {
      const url = await getImageUrl(product.imageId);
      setImagePreview(url || '');
    } else {
      setImagePreview('');
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price) return;

    const categoryFinal =
      categoryMode === "new"
        ? newCategory.trim()
        : (formData.category || "").trim();

    const productData: Partial<Product> = {
      name: formData.name,
      price: parseFloat(formData.price) || 0,
      quantity:
        formData.quantity.trim() === ''
          ? undefined
          : Math.max(0, parseInt(formData.quantity, 10) || 0),
      description: formData.description,
      image: formData.image,
      imageId: formData.imageId,
      category: categoryFinal,
      featured: formData.featured,
      hidden: formData.hidden,
    };

    if (editingId) {
      onUpdate(editingId, productData);
    } else {
      onAdd({
        id: Date.now().toString(),
        name: productData.name as string,
        price: productData.price as number,
        quantity: (productData.quantity as number) ?? 0,
        description: productData.description as string,
        image: productData.image as string,
        imageId: productData.imageId as string,
        category: productData.category as string,
        order: products.length,
        featured: !!productData.featured,
        hidden: !!productData.hidden,
      });
    }

    resetForm();
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await compressImage(file);
      setFormData((prev) => ({ ...prev, image: base64, imageId: '' }));
      setImagePreview(base64);
    } catch (err) {
      console.error('Error processing product image', err);
    }
  };

  const isEditing = editingId !== null;

  const DEMO_IMAGE_URL = "/zapato.png";

  const seedProducts = (count = 100) => {
    const baseOrder = products.length;

    for (let i = 0; i < count; i++) {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${i}`;

      onAdd({
        id,
        name: `Producto demo ${baseOrder + i + 1}`,
        price: (i + 1) * 10,
        description: `<p>Demo</p>`,
        image: DEMO_IMAGE_URL,
        imageId: "",
        category: ["Cat A", "Cat B", "Cat C", "Cat D", "Cat E"][i % 5],
        order: baseOrder + i,
        featured: i % 10 === 0,
        hidden: false,
      });
    }
  };


  const importInputRef = React.useRef<HTMLInputElement | null>(null);

  type ImportItem = {
    id?: string;
    name?: string;
    price?: number | string;
    description?: string;
    image?: string;      // URL
    imageId?: string;
    category?: string;
    quantity?: number;
    featured?: boolean;
    hidden?: boolean;
  };

  const normalizeHtml = (s: any) => {
    const str = typeof s === "string" ? s : "";
    // Si viene texto plano, lo envolvemos en <p>...</p> para tu render con dangerouslySetInnerHTML
    if (!str.trim()) return "";
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(str);
    return looksLikeHtml ? str : `<p>${str}</p>`;
  };

  const handleImportJsonFile = async (file: File) => {
    const text = await file.text();

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      alert("El archivo no es un JSON válido.");
      return;
    }

    // Soporta: array directo o {products:[...]}
    const items: ImportItem[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.products)
        ? parsed.products
        : [];

    if (!items.length) {
      alert("No encontré productos. El JSON debe ser un array o tener { products: [] }");
      return;
    }

    const baseOrder = products.length;

    const sorted = [...items].sort((a, b) => {
      const an = (a.name ?? "").toString().trim().toLocaleLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const bn = (b.name ?? "").toString().trim().toLocaleLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return an.localeCompare(bn, "es");
    });

    sorted.forEach((it, idx) => {
      const name = (it.name ?? "").toString().trim();
      if (!name) return;

      const priceNum =
        typeof it.price === "number"
          ? it.price
          : Number(String(it.price ?? "").replace(/[^\d.]/g, "")) || 0;

      const id =
        (it.id && String(it.id)) ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${idx}`);

      onAdd({
        id,
        name,
        price: priceNum,
        quantity: Number.isFinite(it.quantity as any) ? Number(it.quantity) : 0,
        description: normalizeHtml(it.description),
        image: (it.image ?? "").toString().trim(),   // ✅ URL pública aquí
        imageId: (it.imageId ?? "").toString().trim(),
        category: (it.category ?? "").toString().trim(),
        order: baseOrder + idx,
        featured: !!it.featured,
        hidden: !!it.hidden,
      });
    });

    // Limpia el input para poder re-importar el mismo archivo si quieres
    if (importInputRef.current) importInputRef.current.value = "";
  };

  const handleImportJsonClick = () => {
    importInputRef.current?.click();
  };



  return (
    <div className="space-y-4 mb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-600" />
          Tus Productos
        </h2>
        {/* <button
          onClick={() => seedProducts(100)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors"
        >
          Cargar 100 demo
        </button> */}

        {/*
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportJsonFile(f);
          }}
        />
        <button
          onClick={handleImportJsonClick}
          className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
        >
          Importar JSON
        </button>
 */}

        <div className="flex items-center gap-2">
          {/* NUEVO: botones PDF opcionales */}
          {(onDownloadPdfAll || onDownloadPdfByCategory) && (
            <div className="hidden sm:flex items-center gap-2">
              {onDownloadPdfAll && (
                <button
                  onClick={onDownloadPdfAll}
                  className="bg-slate-900 text-white px-3 py-2 rounded-xl text-sm hover:bg-slate-800"
                >
                  PDF (Todo)
                </button>
              )}
              {onDownloadPdfByCategory && (
                <div className="relative">
                  <select
                    className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-sm"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="__ALL__">Todas</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <button
                    disabled={categoryFilter === '__ALL__'}
                    onClick={() => {
                      if (categoryFilter !== '__ALL__') onDownloadPdfByCategory(categoryFilter);
                    }}
                    className="ml-2 bg-blue-600 text-white px-3 py-2 rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Descargar PDF de la categoría seleccionada"
                  >
                    PDF (Categoría)
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => {
              if (isAdding || isEditing) resetForm();
              else setIsAdding(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
          >
            {isAdding || isEditing ? (
              <>
                <X className="w-4 h-4" /> Cancelar
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> Nuevo
              </>
            )}
          </button>
        </div>
      </div>

      {/* NUEVO: filtro visible (si no usas los botones PDF arriba) */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <Tag className="w-4 h-4 text-slate-500" />
          <select
            className="outline-none text-sm bg-transparent"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="__ALL__">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {categoryFilter !== '__ALL__' && (
          <button
            className="text-sm text-slate-600 hover:underline"
            onClick={() => setCategoryFilter('__ALL__')}
          >
            Limpiar filtro
          </button>
        )}
      </div>

      {/* Form */}
      <AnimatePresence>
        {(isAdding || isEditing) && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white p-6 rounded-2xl shadow-sm border-2 border-blue-500 space-y-4"
          >
            <h3 className="font-bold text-lg text-blue-900">{isEditing ? 'Editar Producto' : 'Nuevo Producto'}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Nombre del producto"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                />

                {/* Categoría */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Categoría</label>

                  <div className="flex gap-2">
                    {categoryMode === "select" ? (
                      <>
                        <select
                          className="flex-1 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          value={formData.category}
                          onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                        >
                          <option value="">Sin categoría</option>
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            setCategoryMode("new");
                            setNewCategory("");
                            setFormData((prev) => ({ ...prev, category: "" })); // opcional
                          }}
                          className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm hover:bg-slate-50"
                        >
                          + Nueva
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          autoFocus
                          type="text"
                          placeholder="Escribe la nueva categoría"
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          className="flex-1 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <button
                          type="button"
                          onClick={() => {
                            setCategoryMode("select");
                            setNewCategory("");
                          }}
                          className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm hover:bg-slate-50"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Selecciona una categoría existente o crea una nueva.
                  </p>
                </div>


                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <input
                    type="number"
                    placeholder="Precio"
                    value={formData.price}
                    onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                    className="w-full pl-8 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Stock disponible"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, quantity: e.target.value }))
                    }
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="featured"
                    type="checkbox"
                    checked={!!formData.featured}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, featured: e.target.checked }))
                    }
                    className="w-4 h-4 text-blue-600"
                  />
                  <label htmlFor="featured" className="text-sm text-slate-700 font-medium">
                    Marcar como destacado ⭐
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="hidden"
                    type="checkbox"
                    checked={!!formData.hidden}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, hidden: e.target.checked }))
                    }
                    className="w-4 h-4 text-red-600"
                  />
                  <label htmlFor="hidden" className="text-sm text-slate-700 font-medium">
                    Ocultar producto 👁️‍🗨️
                  </label>
                </div>


                <RichTextEditor
                  value={formData.description}
                  onChange={(html) => setFormData((prev) => ({ ...prev, description: html }))}
                  placeholder="Descripción (opcional)"
                />
              </div>

              {/* Image */}
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 hover:border-blue-400 transition-colors cursor-pointer relative bg-slate-50 min-h-[200px]">
                {imagePreview ? (
                  <div className="relative w-full h-full flex flex-col items-center">
                    <img src={imagePreview} alt="Preview" className="w-full h-40 object-contain rounded-lg mb-2" />
                    <button
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, image: '', imageId: '' }));
                        setImagePreview('');
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Quitar imagen
                    </button>
                  </div>
                ) : (
                  <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
                    <ImageIcon className="w-10 h-10 text-slate-300 mb-2" />
                    <span className="text-sm text-slate-500">Añadir foto del producto</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                )}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={!formData.name || !formData.price}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isEditing ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {isEditing ? 'Guardar Cambios' : 'Crear Producto'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Products grid */}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={orderedProducts.map((p) => p.id)}
          strategy={rectSortingStrategy}
        >
          <p className="text-xs text-slate-400 mb-2">
            Arrastra el ícono <span className="font-semibold">☰</span> para ordenar los productos.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            <AnimatePresence>
              {orderedProducts.map((product) => (
                <SortableCard key={product.id} id={product.id}>
                  {({ dragListeners, dragAttributes, isDragging }) => (
                    <motion.div
                      layout
                      layoutId={product.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={`bg-white rounded-2xl p-4  ${product.hidden ? "opacity-40 grayscale" : ""} shadow-sm border group relative transition-all ${editingId === product.id
                        ? "border-blue-500 ring-2 ring-blue-50"
                        : "border-slate-100"
                        }`}
                    >
                      {/* 🔹 BOTÓN PARA ARRASTRAR */}
                      <button
                        type="button"
                        title="Arrastra para ordenar"
                        className={`absolute top-2 left-2 z-10 p-2 rounded-full
              bg-white/90 backdrop-blur border
              text-slate-500 hover:text-slate-700 hover:bg-slate-100
              cursor-grab active:cursor-grabbing
              transition
              ${isDragging ? "ring-2 ring-blue-300" : "border-slate-200"}
            `}
                        {...dragAttributes}
                        {...dragListeners}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>

                      {/* 🔹 EDITAR / ELIMINAR */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={() => handleOpenEdit(product)}
                          className="bg-blue-100 text-blue-600 p-2 rounded-full shadow-sm border border-blue-200 hover:bg-blue-200"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onRemove(product.id)}
                          className="bg-red-100 text-red-600 p-2 rounded-full shadow-sm border border-red-200 hover:bg-red-200"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 🔹 CONTENIDO */}
                      <div className="flex gap-4">
                        <div className="w-20 h-20 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0 relative">

                          {product.hidden && (
                            <div className="absolute top-2 left-2 text-[11px] bg-slate-700 text-white px-2 py-1 rounded-full">
                              Oculto
                            </div>
                          )}

                          <ProductThumb
                            product={product}
                            className="max-w-full max-h-full object-contain block"
                          />
                          {product.featured && (
                            <div
                              title="Producto destacado"
                              className="absolute top-1 right-1 z-10 flex items-center justify-center
                              w-4 h-4 rounded-full
                              bg-yellow-400 text-white
                              shadow-md ring-2 ring-white"
                            >
                              <span className="text-sm leading-none">★</span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-900 truncate">
                            {product.name}
                          </h3>

                          {product.category?.trim() ? (
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                              <Tag className="w-3 h-3" />
                              <span className="truncate">{product.category}</span>
                            </div>
                          ) : (
                            <div className="mt-1 text-[11px] text-slate-400">
                              Sin categoría
                            </div>
                          )}

                          <p className="text-blue-600 font-semibold mt-1">
                            {formatCurrency(product.price)}
                          </p>

                          <p className="text-xs text-slate-500 mt-1">
                            Cantidad: <span className="font-semibold">{product.quantity ?? 0}</span>
                          </p>

                          <div
                            className="text-xs text-slate-500 line-clamp-2 mt-1 prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{
                              __html:
                                product.description || "<p>Sin descripción</p>",
                            }}
                          />
                        </div>
                      </div>

                    </motion.div>
                  )}
                </SortableCard>
              ))}
            </AnimatePresence>

            {orderedProducts.length === 0 && !isAdding && !isEditing && (
              <div className="col-span-full py-20 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400">
                  {categoryFilter === "__ALL__"
                    ? "Aún no tienes productos. ¡Agrega el primero!"
                    : "No hay productos en esta categoría."}
                </p>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

    </div>
  );
};
