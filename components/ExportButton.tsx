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

  const generatePdf = async (opts?: { category?: string; overrideFileName?: string })
    : Promise<{ blob: Blob; fileName: string }> => {

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

        const cards = Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[];

        console.log(cards);
        
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
      if (grid) {
        grid.style.display = "block";
      }

      const cards = Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[];
      cards.forEach((card, idx) => {
        card.style.display = "inline-block";
        card.style.verticalAlign = "top";
        card.style.width = "48%";
        card.style.marginBottom = "24px";
        card.style.marginRight = idx % 2 === 0 ? "4%" : "0";
      });

      // =========================
      // 2) PRECIO SIEMPRE ENCIMA (etiqueta absoluta) + ocultar precio móvil
      //    (Requiere que hayas puesto className "price-tag" y "price-mobile" en el JSX)
      // =========================
      clone.querySelectorAll(".price-tag").forEach((el) => {
        const e = el as HTMLElement;
        e.style.display = "flex";          // fuerza visible aunque Tailwind lo oculte
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
      // 3) RE-HIDRATAR IMÁGENES DE INDEXEDDB (data-imgid) Y EVITAR ESTIRADO
      // =========================
      const imgs = Array.from(clone.querySelectorAll("img[data-imgid]")) as HTMLImageElement[];

      // A) Llenar src si está vacío
      await Promise.all(
        imgs.map(async (img) => {
          const hasSrc = !!img.getAttribute("src")?.trim();
          if (hasSrc) return;

          const id = img.dataset.imgid;
          if (!id) return;

          const url = await getImageUrl(id);
          if (url) {
            img.src = url;
            if (url.startsWith("blob:")) objectUrlsToRevoke.push(url);
          }
        })
      );

      // B) Estilos "contain" sin forzar width/height (evita deformación en html2canvas)
      imgs.forEach((img) => {
        img.style.width = "auto";
        img.style.height = "auto";
        img.style.maxWidth = "100%";
        img.style.maxHeight = "100%";
        img.style.objectFit = "contain";
        img.style.objectPosition = "center";
        img.style.display = "block";
      });

      // C) Esperar carga real
      await Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : new Promise<void>((res) => {
              img.onload = () => res();
              img.onerror = () => res();
            })
        )
      );

      // =========================
      // 4) CAPTURA
      // =========================
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
      });

      // =========================
      // 5) PDF PAGINADO
      // =========================
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;

      const usableWmm = pageW - margin * 2;
      const usableHmm = pageH - margin * 2;

      const pxPerMm = canvas.width / usableWmm;
      const pageHeightPx = Math.floor(usableHmm * pxPerMm);

      let offsetY = 0;
      let pageIndex = 0;

      while (offsetY < canvas.height) {
        const sliceHeight = Math.min(pageHeightPx, canvas.height - offsetY);

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const ctx = pageCanvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

        ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

        const pageImg = pageCanvas.toDataURL("image/jpeg", 0.95);
        const sliceHmm = sliceHeight / pxPerMm;

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(pageImg, "JPEG", margin, margin, usableWmm, sliceHmm, undefined, "FAST");

        offsetY += sliceHeight;
        pageIndex++;
      }

      const baseName = (opts?.overrideFileName || fileName);
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

  const handleDownloadPdfAllCategories = async () => {
    try {
      setLoading(true);

      const groups = groupByCategory(products);

      // Descarga 1 PDF por categoría (varios archivos)
      for (const [category] of groups) {
        const outBase = `${fileName}-${slug(category)}`;
        const { blob, fileName: outName } = await generatePdf({
          category,
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

        // pequeño respiro para evitar que algunos navegadores bloqueen múltiples descargas
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (error) {
      console.error(error);
      alert("Error generando/descargando PDFs por categoría.");
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
