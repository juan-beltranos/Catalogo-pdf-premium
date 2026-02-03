import { Product } from "../types";

export const normalizeCategory = (p: Product) =>
    (p.category || "Sin categoría").trim() || "Sin categoría";

export const groupByCategory = (products: Product[]) => {
    const map = new Map<string, Product[]>();

    for (const p of products) {
        const key = normalizeCategory(p);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
    }

    // ordenar productos dentro de cada categoría (opcional)
    for (const [k, arr] of map.entries()) {
        arr.sort((a, b) => a.name.localeCompare(b.name));
        map.set(k, arr);
    }

    // ordenar categorías
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
};

export const slug = (text: string) =>
    text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // quita acentos
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
