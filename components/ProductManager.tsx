import React, { useEffect, useMemo, useState } from "react";
import { Product } from "../types";
import {
  Plus,
  Trash2,
  Package,
  Image as ImageIcon,
  Edit2,
  X,
  Check,
  Tag,
  GripVertical,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { compressImage, formatCurrency } from "../constants";
import { motion, AnimatePresence } from "framer-motion";
import { RichTextEditor } from "./RichTextEditor";
import { getImageUrl } from "@/helper/imageDB";
import { ProductThumb } from "./ProductThumb";
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
import * as XLSX from "xlsx";

interface ProductManagerProps {
  products: Product[];
  onAdd: (product: Product) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Product>) => void;
  onDownloadPdfAll?: () => void;
  onDownloadPdfByCategory?: (category: string) => void;
}

const PRODUCTS_PER_PAGE = 20;

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

// ─── Tipos para importación Excel ────────────────────────────────────────────

type ExcelRow = Record<string, any>;

/** Normaliza un nombre de columna: minúsculas, sin tildes, sin espacios extra */
const normalizeKey = (key: string) =>
  key
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");

/**
 * Intenta encontrar un valor en una fila buscando por múltiples alias de columna.
 * Por ejemplo: "nombre" | "name" | "producto" | "title"
 */
const getField = (row: ExcelRow, ...aliases: string[]): any => {
  for (const alias of aliases) {
    const key = Object.keys(row).find((k) => normalizeKey(k) === alias);
    if (
      key !== undefined &&
      row[key] !== undefined &&
      row[key] !== null &&
      row[key] !== ""
    )
      return row[key];
  }
  return undefined;
};

const toStr = (v: any): string =>
  v === undefined || v === null ? "" : String(v).trim();

const toNum = (v: any): number => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return isFinite(n) ? n : 0;
};

const normalizeHtml = (s: any): string => {
  const str = toStr(s);
  if (!str) return "";
  return /<\/?[a-z][\s\S]*>/i.test(str) ? str : `<p>${str}</p>`;
};

// ─── Componente principal ─────────────────────────────────────────────────────

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
    name: "",
    price: "",
    originalPrice: "",
    description: "",
    quantity: "",
    image: "",
    imageId: "",
    category: "",
    featured: false,
    hidden: false,
  });

  const [imagePreview, setImagePreview] = useState<string>("");
  const formRef = React.useRef<HTMLDivElement>(null);
  const [categoryMode, setCategoryMode] = useState<"select" | "new">("select");
  const [newCategory, setNewCategory] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("__ALL__");
  const [isRenamingCategory, setIsRenamingCategory] = useState(false);
  const [renameCategoryValue, setRenameCategoryValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // ── Paginación ─────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);

  // ── Estado para el modal de preview de Excel ──
  const [excelPreview, setExcelPreview] = useState<{
    rows: ExcelRow[];
    mapped: Partial<Product>[];
    fileName: string;
  } | null>(null);
  const [importingExcel, setImportingExcel] = useState(false);
  const excelInputRef = React.useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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
    const query = searchTerm
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // Si hay búsqueda, busca en TODOS los productos sin importar la categoría
    if (query) {
      return products.filter((p) => {
        const name = (p.name || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        const category = (p.category || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        const description = (p.description || "")
          .replace(/<[^>]*>/g, " ")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        const price = String(p.price || "");

        return (
          name.includes(query) ||
          category.includes(query) ||
          description.includes(query) ||
          price.includes(query)
        );
      });
    }

    // Si no hay búsqueda, funciona el filtro de categoría normal
    if (categoryFilter === "__ALL__") return products;

    return products.filter((p) => (p.category || "").trim() === categoryFilter);
  }, [products, categoryFilter, searchTerm]);

  const orderedProducts = useMemo(() => {
    const arr = [...filteredProducts];
    arr.sort((a, b) => {
      const ao = typeof a.order === "number" ? a.order : Number(a.id);
      const bo = typeof b.order === "number" ? b.order : Number(b.id);
      return ao - bo;
    });
    return arr;
  }, [filteredProducts]);

  const totalProducts = orderedProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE));

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * PRODUCTS_PER_PAGE;
  const pageEnd = pageStart + PRODUCTS_PER_PAGE;

  const paginatedProducts = useMemo(() => {
    return orderedProducts.slice(pageStart, pageEnd);
  }, [orderedProducts, pageStart, pageEnd]);

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const goToPage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(nextPage);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = orderedProducts.map((p) => p.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));

    if (oldIndex === -1 || newIndex === -1) return;

    const newIds = arrayMove(ids, oldIndex, newIndex);

    // Optimización:
    // antes se actualizaban todos los productos cada vez.
    // ahora solo se actualizan los productos cuyo order realmente cambió.
    newIds.forEach((id, index) => {
      if (ids[index] !== id) {
        onUpdate(id, { order: index });
      }
    });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      price: "",
      originalPrice: "",
      quantity: "",
      description: "",
      image: "",
      imageId: "",
      category: "",
      featured: false,
      hidden: false,
    });
    setCategoryMode("select");
    setNewCategory("");
    setIsAdding(false);
    setEditingId(null);
    setImagePreview("");
  };

  const handleOpenEdit = async (product: Product) => {
    setFormData({
      name: product.name,
      price: product.price.toString(),
      originalPrice:
        typeof (product as any).originalPrice === "number" &&
          (product as any).originalPrice > 0
          ? String((product as any).originalPrice)
          : "",
      quantity:
        product.quantity === undefined || product.quantity === null
          ? ""
          : String(product.quantity),
      description: product.description,
      image: product.image || "",
      imageId: product.imageId || "",
      category: (product.category || "").trim(),
      featured: !!product.featured,
      hidden: !!product.hidden,
    });

    setCategoryMode("select");
    setNewCategory("");
    setEditingId(product.id);
    setIsAdding(false);

    if (product.image) {
      setImagePreview(product.image);
    } else if (product.imageId) {
      const url = await getImageUrl(product.imageId);
      setImagePreview(url || "");
    } else {
      setImagePreview("");
    }

    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  };

  const getDiscountPercent = (price: number, originalPrice?: number) => {
    if (
      typeof originalPrice !== "number" ||
      !Number.isFinite(originalPrice) ||
      originalPrice <= 0 ||
      originalPrice <= price
    )
      return null;
    return Math.round(((originalPrice - price) / originalPrice) * 100);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price) return;

    const categoryFinal =
      categoryMode === "new"
        ? newCategory.trim()
        : (formData.category || "").trim();

    const price = parseFloat(formData.price) || 0;
    const parsedOriginalPrice = parseFloat(formData.originalPrice);
    const originalPrice =
      formData.originalPrice.trim() === ""
        ? undefined
        : parsedOriginalPrice > price
          ? parsedOriginalPrice
          : undefined;

    const productData: Partial<Product> = {
      name: formData.name,
      price,
      originalPrice,
      quantity:
        formData.quantity.trim() === ""
          ? undefined
          : Math.max(0, parseInt(formData.quantity, 10) || 0),
      description: formData.description,
      image: formData.image,
      imageId: formData.imageId,
      category: categoryFinal,
      featured: formData.featured,
      hidden: formData.hidden,
    } as Partial<Product>;

    if (editingId) {
      onUpdate(editingId, productData);
    } else {
      onAdd({
        id: Date.now().toString(),
        name: productData.name as string,
        price: productData.price as number,
        originalPrice: productData.originalPrice as number | undefined,
        quantity: (productData.quantity as number) ?? 0,
        description: productData.description as string,
        image: productData.image as string,
        imageId: productData.imageId as string,
        category: productData.category as string,
        order: products.length,
        featured: !!productData.featured,
        hidden: !!productData.hidden,
      } as Product);

      goToPage(totalPages);
    }

    resetForm();
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await compressImage(file);
      setFormData((prev) => ({ ...prev, image: base64, imageId: "" }));
      setImagePreview(base64);
    } catch (err) {
      console.error("Error processing product image", err);
    }
  };

  // ─── IMPORTAR EXCEL ────────────────────────────────────────────────────────

  /**
   * Convierte una fila del Excel (objeto con claves = nombre columna)
   * en un Partial<Product> usando alias flexibles para cada campo.
   *
   * Columnas soportadas (se detectan sin importar mayúsculas/tildes):
   *   nombre | name | producto | title
   *   precio | price | valor | costo | cost
   *   precio_anterior | precio_viejo | old_price | original_price | compare_at_price
   *   descripcion | description | detalle | detail
   *   categoria | category | tipo | type | grupo | group
   *   cantidad | quantity | stock | inventario | inventory
   *   destacado | featured | star
   *   oculto | hidden
   */
  const mapExcelRow = (row: ExcelRow, index: number): Partial<Product> | null => {
    const name = toStr(
      getField(row, "nombre", "name", "producto", "title", "articulo", "item")
    );
    if (!name) return null;

    const price = toNum(
      getField(row, "precio", "price", "valor", "costo", "cost", "precio_actual")
    );

    const rawOriginal = getField(
      row,
      "precio_anterior",
      "precio_viejo",
      "old_price",
      "original_price",
      "compare_at_price",
      "precio_original",
      "precio_tachado",
      "precio_base"
    );

    const originalPriceNum =
      rawOriginal !== undefined ? toNum(rawOriginal) : undefined;

    const originalPrice =
      typeof originalPriceNum === "number" &&
        originalPriceNum > 0 &&
        originalPriceNum > price
        ? originalPriceNum
        : undefined;

    const description = normalizeHtml(
      getField(row, "descripcion", "description", "detalle", "detail", "info")
    );

    const category = toStr(
      getField(
        row,
        "categoria",
        "category",
        "tipo",
        "type",
        "grupo",
        "group",
        "seccion",
        "section"
      )
    );

    const quantityRaw = getField(
      row,
      "cantidad",
      "quantity",
      "stock",
      "inventario",
      "inventory",
      "existencias"
    );

    const quantity =
      quantityRaw !== undefined
        ? Math.max(0, parseInt(String(quantityRaw), 10) || 0)
        : 0;

    const featuredRaw = getField(row, "destacado", "featured", "star", "especial");
    const featured =
      featuredRaw === true ||
      featuredRaw === 1 ||
      toStr(featuredRaw).toLowerCase() === "si" ||
      toStr(featuredRaw).toLowerCase() === "sí" ||
      toStr(featuredRaw).toLowerCase() === "true";

    const hiddenRaw = getField(row, "oculto", "hidden", "inactivo", "inactive");
    const hidden =
      hiddenRaw === true ||
      hiddenRaw === 1 ||
      toStr(hiddenRaw).toLowerCase() === "si" ||
      toStr(hiddenRaw).toLowerCase() === "sí" ||
      toStr(hiddenRaw).toLowerCase() === "true";
    const image = toStr(
      getField(
        row,
        "imagen",
        "image",
        "foto",
        "photo",
        "url_imagen",
        "image_url",
        "url",
        "picture",
        "thumbnail"
      )
    );

    return {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${index}`,
      name,
      price,
      originalPrice,
      description,
      category,
      quantity,
      image,
      imageId: "",
      order: products.length + index,
      featured,
      hidden,
    };
  };

  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (excelInputRef.current) excelInputRef.current.value = "";

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });

      // Usar la primera hoja
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];

      // Convertir a JSON (primera fila = headers)
      const rows: ExcelRow[] = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: false,
      });

      if (!rows.length) {
        alert("El archivo está vacío o no tiene datos en la primera hoja.");
        return;
      }

      // Mapear filas a productos
      const mapped = rows
        .map((row, i) => mapExcelRow(row, i))
        .filter((p): p is Partial<Product> => p !== null && !!p.name);

      if (!mapped.length) {
        alert(
          "No se encontraron productos válidos.\n\nAsegúrate de que el Excel tenga una columna llamada 'nombre' o 'name'."
        );
        return;
      }

      // Mostrar preview antes de confirmar
      setExcelPreview({ rows, mapped, fileName: file.name });
    } catch (err) {
      console.error("Error leyendo Excel:", err);
      alert("No se pudo leer el archivo. Asegúrate de que sea un .xlsx o .xls válido.");
    }
  };

  const handleConfirmExcelImport = () => {
    if (!excelPreview) return;
    setImportingExcel(true);

    try {
      excelPreview.mapped.forEach((p) => {
        onAdd(p as Product);
      });
      setExcelPreview(null);
      setCurrentPage(totalPages);
    } finally {
      setImportingExcel(false);
    }
  };

  // ─── JSON import existente ───────────────────────────────────────────────

  const importInputRef = React.useRef<HTMLInputElement | null>(null);

  type ImportItem = {
    id?: string;
    name?: string;
    price?: number | string;
    originalPrice?: number | string;
    oldPrice?: number | string;
    compareAtPrice?: number | string;
    description?: string;
    image?: string;
    imageId?: string;
    category?: string;
    quantity?: number;
    featured?: boolean;
    hidden?: boolean;
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
      const an = (a.name ?? "")
        .toString()
        .trim()
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const bn = (b.name ?? "")
        .toString()
        .trim()
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return an.localeCompare(bn, "es");
    });

    sorted.forEach((it, idx) => {
      const name = (it.name ?? "").toString().trim();
      if (!name) return;

      const priceNum =
        typeof it.price === "number"
          ? it.price
          : Number(String(it.price ?? "").replace(/[^\d.]/g, "")) || 0;

      const importedOriginalRaw =
        it.originalPrice ?? it.oldPrice ?? it.compareAtPrice;

      const importedOriginalPrice =
        typeof importedOriginalRaw === "number"
          ? importedOriginalRaw
          : Number(String(importedOriginalRaw ?? "").replace(/[^\d.]/g, "")) ||
          undefined;

      const normalizedOriginalPrice =
        typeof importedOriginalPrice === "number" &&
          importedOriginalPrice > priceNum
          ? importedOriginalPrice
          : undefined;

      const id =
        (it.id && String(it.id)) ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${idx}`);

      onAdd({
        id,
        name,
        price: priceNum,
        originalPrice: normalizedOriginalPrice,
        quantity: Number.isFinite(it.quantity as any) ? Number(it.quantity) : 0,
        description: normalizeHtml(it.description),
        image: (it.image ?? "").toString().trim(),
        imageId: (it.imageId ?? "").toString().trim(),
        category: (it.category ?? "").toString().trim(),
        order: baseOrder + idx,
        featured: !!it.featured,
        hidden: !!it.hidden,
      } as Product);
    });

    if (importInputRef.current) importInputRef.current.value = "";
    setCurrentPage(totalPages);
  };

  const handleRenameCategory = () => {
    const oldName = (formData.category || "").trim();
    const newName = renameCategoryValue.trim();
    if (!oldName || !newName) return;

    if (oldName.toLowerCase() === newName.toLowerCase()) {
      setIsRenamingCategory(false);
      setRenameCategoryValue("");
      return;
    }

    const exists = categories.some(
      (c) =>
        c.trim().toLowerCase() === newName.toLowerCase() &&
        c.trim().toLowerCase() !== oldName.toLowerCase()
    );

    if (exists) {
      alert("Ya existe una categoría con ese nombre.");
      return;
    }

    products.forEach((p) => {
      if ((p.category || "").trim().toLowerCase() === oldName.toLowerCase())
        onUpdate(p.id, { category: newName });
    });

    setFormData((prev) => ({ ...prev, category: newName }));

    if (categoryFilter.trim().toLowerCase() === oldName.toLowerCase())
      setCategoryFilter(newName);

    setIsRenamingCategory(false);
    setRenameCategoryValue("");
  };

  const handleDeleteCurrentCategory = () => {
    const currentCategory = (formData.category || "").trim();
    if (!currentCategory) return;

    const confirmed = window.confirm(
      `¿Eliminar la categoría "${currentCategory}"?\n\nLos productos no se borrarán. Solo quedarán sin categoría.`
    );

    if (!confirmed) return;

    products.forEach((p) => {
      if ((p.category || "").trim().toLowerCase() === currentCategory.toLowerCase())
        onUpdate(p.id, { category: "" });
    });

    if (categoryFilter.trim().toLowerCase() === currentCategory.toLowerCase())
      setCategoryFilter("__ALL__");

    setFormData((prev) => ({ ...prev, category: "" }));
    setIsRenamingCategory(false);
    setRenameCategoryValue("");
  };

  const previewPrice = parseFloat(formData.price) || 0;
  const previewOriginalPrice = parseFloat(formData.originalPrice);
  const previewDiscount = getDiscountPercent(
    previewPrice,
    formData.originalPrice.trim() === "" ? undefined : previewOriginalPrice
  );

  const isEditing = editingId !== null;

  const renderPagination = () => {
    if (totalProducts <= PRODUCTS_PER_PAGE) return null;

    const visiblePages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
      (page) =>
        page === 1 ||
        page === totalPages ||
        Math.abs(page - safeCurrentPage) <= 1
    );

    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-100 rounded-2xl px-4 py-3">
        <p className="text-xs text-slate-500">
          Mostrando{" "}
          <span className="font-semibold text-slate-800">
            {totalProducts === 0 ? 0 : pageStart + 1}
          </span>{" "}
          -{" "}
          <span className="font-semibold text-slate-800">
            {Math.min(pageEnd, totalProducts)}
          </span>{" "}
          de{" "}
          <span className="font-semibold text-slate-800">{totalProducts}</span>{" "}
          productos
        </p>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => goToPage(safeCurrentPage - 1)}
            disabled={safeCurrentPage === 1}
            className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </button>

          {visiblePages.map((page, index) => {
            const previousPage = visiblePages[index - 1];
            const showDots = previousPage && page - previousPage > 1;

            return (
              <React.Fragment key={page}>
                {showDots && (
                  <span className="px-2 text-slate-300 text-sm">...</span>
                )}
                <button
                  type="button"
                  onClick={() => goToPage(page)}
                  className={`h-9 min-w-9 px-3 rounded-xl text-sm border transition ${page === safeCurrentPage
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                >
                  {page}
                </button>
              </React.Fragment>
            );
          })}

          <button
            type="button"
            onClick={() => goToPage(safeCurrentPage + 1)}
            disabled={safeCurrentPage === totalPages}
            className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 mb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-600" />
          Tus Productos
        </h2>

        <div className="flex items-center gap-2">
          {/* Botón importar Excel */}
          <button
            onClick={() => excelInputRef.current?.click()}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
            title="Importar productos desde Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Importar Excel</span>
            <span className="sm:hidden">Excel</span>
          </button>

          {/* Input oculto para Excel */}
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleExcelFileChange}
          />

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
                    disabled={categoryFilter === "__ALL__"}
                    onClick={() => {
                      if (categoryFilter !== "__ALL__")
                        onDownloadPdfByCategory(categoryFilter);
                    }}
                    className="ml-2 bg-blue-600 text-white px-3 py-2 rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Filtro de categoría + buscador */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <Tag className="w-4 h-4 text-slate-500" />
          <select
            className="outline-none text-sm bg-transparent"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            disabled={!!searchTerm.trim()}
            title={
              searchTerm.trim()
                ? "El buscador está activo y busca en todos los productos"
                : "Filtrar por categoría"
            }
          >
            <option value="__ALL__">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar producto por nombre, categoría, descripción o precio..."
            className="w-full outline-none text-sm bg-transparent"
          />
          {searchTerm.trim() && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="text-slate-400 hover:text-slate-600"
              title="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {categoryFilter !== "__ALL__" && !searchTerm.trim() && (
          <button
            className="text-sm text-slate-600 hover:underline"
            onClick={() => setCategoryFilter("__ALL__")}
          >
            Limpiar filtro
          </button>
        )}

        {searchTerm.trim() && (
          <p className="w-full text-xs text-blue-600">
            Buscando en todos los productos, sin importar la categoría.
          </p>
        )}
      </div>

      {/* ─── Modal preview de Excel ──────────────────────────────────────── */}
      <AnimatePresence>
        {excelPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4"
            onClick={() => setExcelPreview(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header modal */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    Importar desde Excel
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {excelPreview.fileName}
                  </p>
                </div>
                <button
                  onClick={() => setExcelPreview(null)}
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Info */}
              <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm">
                  {excelPreview.mapped.length}
                </span>
                <p className="text-sm text-emerald-800">
                  productos encontrados listos para importar.
                  {excelPreview.rows.length - excelPreview.mapped.length > 0 && (
                    <span className="text-amber-700 ml-1">
                      ({excelPreview.rows.length - excelPreview.mapped.length} filas
                      sin nombre ignoradas)
                    </span>
                  )}
                </p>
              </div>

              {/* Tabla preview */}
              <div className="overflow-auto flex-1 px-2 py-2">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-3 py-2 font-semibold text-slate-600 rounded-tl-lg">
                        Nombre
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-600">
                        Categoría
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-600">
                        Precio
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-600 rounded-tr-lg">
                        Stock
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {excelPreview.mapped.slice(0, 50).map((p, i) => (
                      <tr
                        key={i}
                        className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-3 py-2 text-slate-900 font-medium max-w-[180px] truncate">
                          {p.name}
                        </td>
                        <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate">
                          {p.category || (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-blue-600 font-semibold whitespace-nowrap">
                          {p.price !== undefined
                            ? `$${Number(p.price).toLocaleString("es-CO")}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {p.quantity ?? 0}
                        </td>
                      </tr>
                    ))}
                    {excelPreview.mapped.length > 50 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-2 text-center text-xs text-slate-400 italic"
                        >
                          … y {excelPreview.mapped.length - 50} más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Tip de columnas */}
              <div className="px-6 py-3 bg-slate-50 border-t border-slate-100">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-500">
                    Columnas detectadas automáticamente:
                  </span>{" "}
                  nombre, precio, precio_anterior, descripcion, categoria, cantidad,imagen,
                  destacado, oculto. También se aceptan sus variantes en inglés
                  (name, price, category, etc.).
                </p>
              </div>

              {/* Acciones */}
              <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  onClick={() => setExcelPreview(null)}
                  className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmExcelImport}
                  disabled={importingExcel}
                  className="flex-1 h-11 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Importar {excelPreview.mapped.length} productos
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form agregar/editar */}
      <AnimatePresence>
        {(isAdding || isEditing) && (
          <motion.div
            ref={formRef}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white p-6 rounded-2xl shadow-sm border-2 border-blue-500 space-y-4"
          >
            <h3 className="font-bold text-lg text-blue-900">
              {isEditing ? "Editar Producto" : "Nuevo Producto"}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Nombre del producto"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                />

                {/* Categoría */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">
                    Categoría
                  </label>

                  <div className="flex gap-2 flex-wrap">
                    {categoryMode === "select" ? (
                      <>
                        <select
                          className="flex-1 min-w-[220px] px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          value={formData.category}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              category: e.target.value,
                            }))
                          }
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
                            setIsRenamingCategory(false);
                            setRenameCategoryValue("");
                            setFormData((prev) => ({ ...prev, category: "" }));
                          }}
                          className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm hover:bg-slate-50"
                        >
                          + Nueva
                        </button>

                        {!!formData.category.trim() && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setIsRenamingCategory((prev) => !prev);
                                setRenameCategoryValue(
                                  (formData.category || "").trim()
                                );
                              }}
                              className="px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-sm hover:bg-amber-100"
                            >
                              Renombrar
                            </button>

                            <button
                              type="button"
                              onClick={handleDeleteCurrentCategory}
                              className="px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-sm text-red-600 hover:bg-red-100"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
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

                  {categoryMode === "select" &&
                    isRenamingCategory &&
                    !!formData.category.trim() && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <input
                          type="text"
                          value={renameCategoryValue}
                          onChange={(e) =>
                            setRenameCategoryValue(e.target.value)
                          }
                          placeholder="Nuevo nombre de categoría"
                          className="flex-1 min-w-[220px] px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
                        />

                        <button
                          type="button"
                          onClick={handleRenameCategory}
                          disabled={!renameCategoryValue.trim()}
                          className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm hover:bg-amber-600 disabled:opacity-50"
                        >
                          Guardar nombre
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsRenamingCategory(false);
                            setRenameCategoryValue("");
                          }}
                          className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm hover:bg-slate-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}

                  <p className="text-[11px] text-slate-400">
                    Selecciona una categoría existente, crea una nueva, o
                    renombra/elimina la seleccionada.
                  </p>
                </div>

                {/* Precio actual */}
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Precio actual"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, price: e.target.value }))
                    }
                    className="w-full pl-8 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Precio anterior */}
                <div className="space-y-2">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Precio anterior (opcional)"
                      value={formData.originalPrice}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          originalPrice: e.target.value,
                        }))
                      }
                      className="w-full pl-8 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    {formData.originalPrice.trim() === "" ? (
                      <span className="text-slate-500">
                        Puedes dejar este campo vacío si el producto no tiene
                        descuento.
                      </span>
                    ) : previewDiscount !== null ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-slate-500 line-through">
                          {formatCurrency(previewOriginalPrice)}
                        </span>
                        <span className="font-semibold text-blue-600">
                          {formatCurrency(previewPrice)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          -{previewDiscount}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-amber-700">
                        El precio anterior debe ser mayor que el precio actual
                        para mostrar descuento.
                      </span>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Stock disponible"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        quantity: e.target.value,
                      }))
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
                      setFormData((prev) => ({
                        ...prev,
                        featured: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 text-blue-600"
                  />
                  <label
                    htmlFor="featured"
                    className="text-sm text-slate-700 font-medium"
                  >
                    Marcar como destacado ⭐
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="hidden"
                    type="checkbox"
                    checked={!!formData.hidden}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        hidden: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 text-red-600"
                  />
                  <label
                    htmlFor="hidden"
                    className="text-sm text-slate-700 font-medium"
                  >
                    Ocultar producto 👁️‍🗨️
                  </label>
                </div>

                <RichTextEditor
                  value={formData.description}
                  onChange={(html) =>
                    setFormData((prev) => ({ ...prev, description: html }))
                  }
                  placeholder="Descripción (opcional)"
                />
              </div>

              {/* Imagen */}
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 hover:border-blue-400 transition-colors cursor-pointer relative bg-slate-50 min-h-[200px]">
                {imagePreview ? (
                  <div className="relative w-full h-full flex flex-col items-center">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-40 object-contain rounded-lg mb-2"
                    />
                    <button
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          image: "",
                          imageId: "",
                        }));
                        setImagePreview("");
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Quitar imagen
                    </button>
                  </div>
                ) : (
                  <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
                    <ImageIcon className="w-10 h-10 text-slate-300 mb-2" />
                    <span className="text-sm text-slate-500">
                      Añadir foto del producto
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageChange}
                    />
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
              {isEditing ? "Guardar Cambios" : "Crear Producto"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paginador superior */}
      {renderPagination()}

      {/* Grid de productos */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={paginatedProducts.map((p) => p.id)}
          strategy={rectSortingStrategy}
        >
          {totalProducts > 0 && (
            <p className="text-xs text-slate-400 mb-2">
              Arrastra el ícono <span className="font-semibold">☰</span> para
              ordenar los productos visibles en esta página.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-[90%] sm:w-full mx-auto">
            <AnimatePresence mode="popLayout">
              {paginatedProducts.map((product) => {
                const originalPrice =
                  typeof (product as any).originalPrice === "number"
                    ? (product as any).originalPrice
                    : undefined;

                const discount = getDiscountPercent(product.price, originalPrice);

                return (
                  <SortableCard key={product.id} id={product.id}>
                    {({ dragListeners, dragAttributes, isDragging }) => (
                      <motion.div
                        layout
                        layoutId={product.id}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className={`bg-white rounded-2xl p-4 ${product.hidden ? "opacity-40 grayscale" : ""
                          } shadow-sm border group relative transition-all ${editingId === product.id
                            ? "border-blue-500 ring-2 ring-blue-50"
                            : "border-slate-100"
                          }`}
                      >
                        {/* Drag handle */}
                        <button
                          type="button"
                          title="Arrastra para ordenar"
                          className={`absolute top-2 left-2 z-10 p-2 rounded-full
                            bg-white/90 backdrop-blur border
                            text-slate-500 hover:text-slate-700 hover:bg-slate-100
                            cursor-grab active:cursor-grabbing transition
                            ${isDragging
                              ? "ring-2 ring-blue-300"
                              : "border-slate-200"
                            }`}
                          {...dragAttributes}
                          {...dragListeners}
                        >
                          <GripVertical className="w-4 h-4" />
                        </button>

                        {/* Editar / Eliminar */}
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

                        <div className="flex gap-4 items-center">
                          <div className="w-20 h-20 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0 relative">
                            {product.hidden && (
                              <div className="absolute top-2 left-2 text-[11px] bg-slate-700 text-white px-2 py-1 rounded-full">
                                Oculto
                              </div>
                            )}

                            {product.image || product.imageId ? (
                              <ProductThumb
                                product={product}
                                className="max-w-full max-h-full object-contain block"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-300">
                                <span className="text-[10px] font-bold text-center leading-tight px-1">
                                  Sin foto
                                </span>
                              </div>
                            )}

                            {product.featured && (
                              <div
                                title="Producto destacado"
                                className="absolute top-1 right-1 z-10 flex items-center justify-center w-4 h-4 rounded-full bg-yellow-400 text-white shadow-md ring-2 ring-white"
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

                            <div className="mt-1">
                              {discount !== null && originalPrice ? (
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-xs text-slate-400 line-through">
                                    {formatCurrency(originalPrice)}
                                  </span>
                                  <p className="text-blue-600 font-semibold">
                                    {formatCurrency(product.price)}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-blue-600 font-semibold">
                                  {formatCurrency(product.price)}
                                </p>
                              )}
                            </div>

                            <p className="text-xs text-slate-500 mt-1">
                              Cantidad:{" "}
                              <span className="font-semibold">
                                {product.quantity ?? 0}
                              </span>
                            </p>

                            <div
                              className="text-xs text-slate-500 line-clamp-2 mt-1 prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{
                                __html: product.description || "<p>Sin descripción</p>",
                              }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </SortableCard>
                );
              })}
            </AnimatePresence>

            {orderedProducts.length === 0 && !isAdding && !isEditing && (
              <div className="col-span-full py-20 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400">
                  {searchTerm.trim()
                    ? "No se encontraron productos con esa búsqueda."
                    : categoryFilter === "__ALL__"
                      ? "Aún no tienes productos. ¡Agrega el primero!"
                      : "No hay productos en esta categoría."}
                </p>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Paginador inferior */}
      {renderPagination()}
    </div>
  );
};