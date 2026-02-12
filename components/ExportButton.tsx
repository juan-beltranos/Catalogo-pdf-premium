import React, { useMemo, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getImageUrl } from '@/helper/imageDB';
import { groupByCategory, slug } from "../helper/catalog";
import { Product } from '@/types';

interface ExportButtonProps {
  targetRef: React.RefObject<HTMLDivElement>;
  fileName: string;
  products: Product[];
}

export const ExportButton: React.FC<ExportButtonProps> = ({ targetRef, fileName, products }) => {

  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("__ALL__");

  const categories = useMemo(() => {
    const groups = groupByCategory(products);
    return groups.map(([cat]) => cat);
  }, [products]);

  const generatePdf = async (
    opts?: { category?: string; overrideFileName?: string }
  ): Promise<{ blob: Blob; fileName: string }> => {
    if (!targetRef.current) throw new Error("targetRef is null");

    const EXPORT_WIDTH_PX = 794;

    const printRoot = document.createElement("div");
    printRoot.style.position = "fixed";
    printRoot.style.left = "-10000px";
    printRoot.style.top = "0";
    printRoot.style.width = `${EXPORT_WIDTH_PX}px`;
    printRoot.style.background = "#ffffff";
    printRoot.style.zIndex = "-1";
    printRoot.style.contain = "layout style paint";
    document.body.appendChild(printRoot);

    // Para liberar objectURLs creadas solo para el export
    const objectUrlsToRevoke: string[] = [];

    try {
      const original = targetRef.current;

      const clone = original.cloneNode(true) as HTMLElement;
      clone.classList.add("pdf-mode");
      clone.style.width = `${EXPORT_WIDTH_PX}px`;
      clone.style.maxWidth = `${EXPORT_WIDTH_PX}px`;
      clone.style.margin = "0";
      clone.style.transform = "none";
      clone.style.minHeight = "auto";
      clone.style.height = "auto";

      // Ocultar UI que no quieres en PDF
      clone.querySelectorAll('[data-hide-on-pdf="true"]').forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });

      printRoot.appendChild(clone);

      // ✅ En export: siempre mostrar tag absoluto y ocultar precio móvil (sin depender de sm:)
      clone.querySelectorAll('[data-price-mobile="true"]').forEach((el) => {
        const e = el as HTMLElement;
        e.style.display = "none";
        e.style.visibility = "hidden";
        e.style.height = "0";
        e.style.margin = "0";
        e.style.padding = "0";
      });

      clone.querySelectorAll('[data-price-tag="true"]').forEach((el) => {
        const e = el as HTMLElement;
        e.style.display = "flex";
        e.style.position = "absolute";
        e.style.right = "16px";
        e.style.bottom = "16px";
        e.style.zIndex = "999";
      });

      // =========================
      // 0) FILTRO POR CATEGORÍA (si aplica)
      // =========================
      if (opts?.category) {
        const wanted = opts.category;

        const cards = Array.from(
          clone.querySelectorAll(".product-pdf")
        ) as HTMLElement[];

        cards.forEach((card) => {
          const cat = (card.dataset.category || "").trim() || "Sin categoría";
          const normalize = (s: string) => s.trim().toLowerCase();

          if (normalize(cat) !== normalize(wanted)) {
            card.remove();
          }
        });
      }

      // =========================
      // 1) FORZAR LAYOUT 2 COLUMNAS (html2canvas NO respeta @media print)
      // =========================
      const grid = clone.querySelector(".products-grid") as HTMLElement | null;
      // if (grid) {
      //   grid.style.display = "block";
      // }

      const cards = Array.from(
        clone.querySelectorAll(".product-pdf")
      ) as HTMLElement[];

      cards.forEach((card, idx) => {
        // card.style.display = "inline-block";
        // card.style.verticalAlign = "top";
        // card.style.width = "48%";
        // card.style.marginBottom = "24px";
        // card.style.marginRight = idx % 2 === 0 ? "4%" : "0";

        // (Opcional) hints de no-corte por si luego cambias de estrategia
        card.style.breakInside = "avoid";
        (card.style as any).pageBreakInside = "avoid";
      });

      // =========================
      // 2) PRECIO SIEMPRE ENCIMA (etiqueta absoluta) + ocultar precio móvil
      // =========================
      clone.querySelectorAll(".price-tag").forEach((el) => {
        const e = el as HTMLElement;
        e.style.display = "flex"; // fuerza visible aunque Tailwind lo oculte
        e.style.position = "absolute";
        e.style.right = "16px";
        e.style.bottom = "16px";
        e.style.zIndex = "5";
        e.style.alignItems = "center";
        e.style.justifyContent = "center";
      });

      clone.querySelectorAll(".price-mobile").forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });

      // =========================
      // 3) ASEGURAR QUE TODAS LAS IMÁGENES (URL + IndexedDB) CARGUEN ANTES DE CAPTURAR
      // =========================
      const imgsAll = Array.from(clone.querySelectorAll("img")) as HTMLImageElement[];

      // A) Si hay imágenes por IndexedDB (data-imgid) y no tienen src, llenarlas
      await Promise.all(
        imgsAll.map(async (img) => {
          const hasSrc = !!img.getAttribute("src")?.trim();
          const id = img.dataset.imgid;

          // fuerza eager y crossorigin
          img.setAttribute("loading", "eager");
          img.setAttribute("decoding", "sync");
          img.crossOrigin = "anonymous";
          img.referrerPolicy = "no-referrer";

          if (!hasSrc && id) {
            const url = await getImageUrl(id);
            if (url) {
              img.src = url;
              if (url.startsWith("blob:")) objectUrlsToRevoke.push(url);
            }
          }
        })
      );

      // B) Esperar carga de TODAS las imágenes
      const waitLoad = (img: HTMLImageElement) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res(); // no bloquea
          });

      await Promise.all(imgsAll.map(waitLoad));

      // C) Fallback: si alguna sigue sin cargar, la bajamos como blob y la ponemos como blob URL
      await Promise.all(
        imgsAll.map(async (img) => {
          if (img.naturalWidth > 0) return;
          const src = img.getAttribute("src") || "";
          if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;

          try {
            const resp = await fetch(src, { mode: "cors" });
            const blob = await resp.blob();
            const objUrl = URL.createObjectURL(blob);
            objectUrlsToRevoke.push(objUrl);

            img.crossOrigin = "anonymous";
            img.src = objUrl;
            await waitLoad(img);
          } catch {
            // si no se pudo, lo dejamos sin imagen
          }
        })
      );

      // D) Estilos "contain" para que no se deformen
      imgsAll.forEach((img) => {
        img.style.width = "auto";
        img.style.height = "auto";
        // img.style.maxWidth = "300px";
        // img.style.maxHeight = "100%";
        img.style.objectFit = "contain";
        img.style.objectPosition = "center";
        img.style.display = "block";
      });

      // 🔹 Forzar tamaño de imagen SOLO para PDF
      clone.querySelectorAll("img").forEach((img) => {
        const e = img as HTMLImageElement;
        // e.style.maxWidth = "300px";
        // e.style.width = "100%";
        e.style.height = "auto";
        e.style.objectFit = "contain";
        e.style.margin = "0 auto";
        e.style.display = "block";
      });

      // =========================
      // 4) CAPTURA
      // =========================
      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready;
      }

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: EXPORT_WIDTH_PX,
        windowHeight: clone.scrollHeight,
        scrollX: 0,
        scrollY: 0,
        onclone: (doc) => {
          const el = doc.getElementById("catalog-capture-area");
          el?.classList.add("pdf-mode");
        },
      });


      // =========================
      // 5) PDF PAGINADO (SMART: NO CORTAR TARJETAS) ✅ FIX SCALE + RECT
      // =========================
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;

      const usableWmm = pageW - margin * 2;
      const usableHmm = pageH - margin * 2;

      // Relación px↔mm usando el canvas (esto ya está bien)
      const pxPerMm = canvas.width / usableWmm;
      const pageHeightPx = Math.floor(usableHmm * pxPerMm);

      // 🔥 IMPORTANTE: convertir medidas del DOM (CSS px) a canvas px
      // html2canvas(scale:2) => canvas es más grande que el DOM
      const domHeight = clone.scrollHeight || clone.getBoundingClientRect().height || 1;
      const scaleY = canvas.height / domHeight;

      // Helper para obtener margen bottom real (para no cortar por el borde)
      const getMarginBottom = (el: HTMLElement) => {
        const mb = window.getComputedStyle(el).marginBottom;
        const n = parseFloat(mb || "0");
        return Number.isFinite(n) ? n : 0;
      };

      // Breakpoints (en CANVAS px) donde sí se permite cortar: al final de cada tarjeta
      const bpSet = new Set<number>();
      bpSet.add(0);
      bpSet.add(canvas.height);

      const rootRect = clone.getBoundingClientRect();
      const cardsAfterLayout = Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[];

      for (const card of cardsAfterLayout) {
        const r = card.getBoundingClientRect();

        // bottom en CSS px (relativo al clone)
        const bottomCss =
          (r.bottom - rootRect.top) + getMarginBottom(card);

        // convertir a canvas px
        const bottomCanvas = Math.floor(bottomCss * scaleY);

        // pequeño "gutter" para evitar cortes por rounding (2~6px)
        bpSet.add(Math.max(0, Math.min(canvas.height, bottomCanvas - 4)));
      }

      const breakpoints = Array.from(bpSet)
        .filter((v) => Number.isFinite(v))
        .map((v) => Math.max(0, Math.min(canvas.height, Math.floor(v))))
        .sort((a, b) => a - b);

      // Devuelve el mayor breakpoint <= limit y > offsetY
      const pickBreak = (offsetY: number, limit: number) => {
        let chosen = -1;
        for (let i = 0; i < breakpoints.length; i++) {
          const v = breakpoints[i];
          if (v <= limit && v > offsetY) chosen = v;
          if (v > limit) break;
        }
        return chosen;
      };

      let offsetY = 0;
      let pageIndex = 0;

      while (offsetY < canvas.height) {
        const idealEnd = offsetY + pageHeightPx;
        let endY = pickBreak(offsetY, idealEnd);

        // Fallback: si una tarjeta es más alta que una página, no existe breakpoint dentro
        if (endY === -1) endY = Math.min(idealEnd, canvas.height);

        const sliceHeight = endY - offsetY;
        if (sliceHeight <= 0) break;

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const ctx = pageCanvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

        ctx.drawImage(
          canvas,
          0, offsetY, canvas.width, sliceHeight,
          0, 0, canvas.width, sliceHeight
        );

        const pageImg = pageCanvas.toDataURL("image/jpeg", 0.95);
        const sliceHmm = sliceHeight / pxPerMm;

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(pageImg, "JPEG", margin, margin, usableWmm, sliceHmm, undefined, "FAST");

        offsetY = endY;
        pageIndex++;
      }

      const baseName = opts?.overrideFileName || fileName;
      const safeFileName =
        baseName.replace(/[^\w\s-]/gi, "").replace(/\s+/g, "-").toLowerCase() || "catalogo";

      const blob = pdf.output("blob");
      return { blob, fileName: `${safeFileName}.pdf` };
    } finally {
      objectUrlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
      printRoot.remove();
    }
  };

  const handleDownloadPdfAll = async () => {
    try {
      setLoading(true);
      const { blob, fileName: outName } = await generatePdf({ overrideFileName: fileName });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Error generando/descargando PDF.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdfSelectedCategory = async () => {
    if (selectedCategory === "__ALL__") return;

    try {
      setLoading(true);

      const outBase = `${fileName}-${slug(selectedCategory)}`;
      const { blob, fileName: outName } = await generatePdf({
        category: selectedCategory,
        overrideFileName: outBase,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Error generando/descargando PDF por categoría.");
    } finally {
      setLoading(false);
    }
  };

  const handleShareWhatsApp = async () => {
    try {
      setLoading(true);
      const { blob, fileName } = await generatePdf();

      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'Catálogo',
          text: 'Te comparto el catálogo en PDF',
          files: [file],
        });
      } else {
        const msg = encodeURIComponent('Te comparto el catálogo en PDF');
        window.open(`https://wa.me/?text=${msg}`, '_blank');
        alert('Tu navegador no permite compartir archivos directo. Se abrió WhatsApp con el mensaje.');
      }
    } catch (error) {
      console.error(error);
      alert('Error compartiendo PDF.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-hide-on-pdf="true"
      className="
      fixed inset-x-0 bottom-0 z-50
      px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3
    "
    >
      <div
        className="
        mx-auto max-w-md
        rounded-2xl border border-black/10
        bg-white/85 backdrop-blur
        shadow-lg
        p-2
      "
      >
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={handleShareWhatsApp}
              disabled={loading}
              className="
              flex-1 h-12
              rounded-xl font-semibold text-white
              bg-emerald-600 hover:bg-emerald-700
              active:scale-[0.99] transition
              disabled:opacity-60 disabled:cursor-not-allowed
            "
            >
              {loading ? "Preparando…" : "Compartir WhatsApp"}
            </button>

            <button
              onClick={handleDownloadPdfAll}
              disabled={loading}
              className="
              flex-1 h-12
              rounded-xl font-semibold text-white
              bg-green-600 hover:bg-green-700
              active:scale-[0.99] transition
              disabled:opacity-60 disabled:cursor-not-allowed
            "
            >
              {loading ? "Creando…" : "PDF (Todo)"}
            </button>
          </div>

          {/* Row 2: Selector + PDF Categoría */}
          <div className="flex gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="flex-1 h-12 rounded-xl border border-black/10 bg-white px-3 text-sm"
              disabled={loading}
            >
              <option value="__ALL__">Selecciona categoría…</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <button
              onClick={handleDownloadPdfSelectedCategory}
              disabled={loading || selectedCategory === "__ALL__"}
              className="
              flex-1 h-12
              rounded-xl font-semibold text-white
              bg-blue-600 hover:bg-blue-700
              active:scale-[0.99] transition
              disabled:opacity-60 disabled:cursor-not-allowed
            "
            >
              {loading ? "Creando…" : "PDF (Categoría)"}
            </button>
          </div>

          {/* Row 3: PDF cada categoría */}
          {/* <button
            onClick={handleDownloadPdfAllCategories}
            disabled={loading || categories.length === 0}
            className="
            h-12
            rounded-xl font-semibold text-white
            bg-slate-900 hover:bg-slate-800
            active:scale-[0.99] transition
            disabled:opacity-60 disabled:cursor-not-allowed
          "
          >
            {loading ? "Creando…" : "PDF (Cada categoría)"}
          </button> */}
        </div>
      </div>
    </div>
  );

};
