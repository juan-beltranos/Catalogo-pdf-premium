import React, { useMemo, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getImageUrl } from '@/helper/imageDB';
import { groupByCategory, slug } from "../helper/catalog";
import { Product } from '@/types';
import { normalizeWaNumber } from '@/helper/social';
import { formatCurrency } from '@/constants';

interface ExportButtonProps {
  targetRef: React.RefObject<HTMLDivElement | null>;
  fileName: string;
  products: Product[];
  businessWhatsapp: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ targetRef, fileName, products, businessWhatsapp }) => {

  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("__ALL__");
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  const categories = useMemo(() => {
    const groups = groupByCategory(products);
    return groups.map(([cat]) => cat);
  }, [products]);

  const generatePdf = async (
    opts?: { category?: string; overrideFileName?: string }
  ): Promise<{ blob: Blob; fileName: string }> => {
    if (!targetRef.current) throw new Error("targetRef is null");

    const EXPORT_WIDTH_PX = 800;
    const PDF_MARGIN_MM = 10;

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    const encodeWaText = (t: string) => encodeURIComponent(t);

    const waitTwoFrames = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve())
        )
      );

    const waitLoad = (img: HTMLImageElement) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((res) => {
          img.onload = () => res();
          img.onerror = () => res();
        });

    const printRoot = document.createElement("div");
    printRoot.style.position = "fixed";
    printRoot.style.left = "0";
    printRoot.style.top = "0";
    printRoot.style.width = `${EXPORT_WIDTH_PX}px`;
    printRoot.style.background = "#ffffff";
    printRoot.style.opacity = "0";
    printRoot.style.pointerEvents = "none";
    printRoot.style.zIndex = "2147483647";
    document.body.appendChild(printRoot);

    const objectUrlsToRevoke: string[] = [];

    try {
      const original = targetRef.current;

      const clone = original.cloneNode(true) as HTMLElement;
      clone.classList.add("pdf-mode");
      clone.style.width = `${EXPORT_WIDTH_PX}px`;
      clone.style.maxWidth = `${EXPORT_WIDTH_PX}px`;
      clone.style.margin = "0";
      clone.style.background = "#ffffff";

      clone.querySelectorAll('[data-hide-on-pdf="true"]').forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });

      // =========================
      // FILTRO CATEGORÍA
      // =========================
      if (opts?.category) {
        const wanted = opts.category;

        const cards = Array.from(
          clone.querySelectorAll(".product-pdf")
        ) as HTMLElement[];

        cards.forEach((card) => {
          const cat = (card.dataset.category || "").trim() || "Sin categoría";
          if (cat.toLowerCase() !== wanted.toLowerCase()) {
            card.remove();
          }
        });
      }

      // =========================
      // ASEGURAR IMÁGENES
      // =========================
      const imgs = Array.from(clone.querySelectorAll("img")) as HTMLImageElement[];

      await Promise.all(
        imgs.map(async (img) => {
          const id = img.dataset.imgid;
          if (!img.src && id) {
            const url = await getImageUrl(id);
            if (url) img.src = url;
          }

          if (img.src.startsWith("http")) {
            img.crossOrigin = "anonymous";
          }
        })
      );

      await Promise.all(imgs.map(waitLoad));

      // =========================
      // CAPTURA DOM
      // =========================
      const viewport = document.createElement("div");
      viewport.style.position = "relative";
      viewport.style.width = `${EXPORT_WIDTH_PX}px`;
      viewport.appendChild(clone);
      printRoot.appendChild(viewport);

      await waitTwoFrames();

      // =========================
      // LINKS
      // =========================
      type LinkArea = {
        url: string;
        left: number;
        top: number;
        width: number;
        height: number;
      };

      const linkAreasCss: LinkArea[] = [];
      const rootRectForLinks = clone.getBoundingClientRect();

      const waFromDom =
        clone.querySelector('[data-store-whatsapp="true"]')?.textContent || "";

      const businessWa = normalizeWaNumber(businessWhatsapp || waFromDom, "57");

      const productTargets = Array.from(
        clone.querySelectorAll('[data-pdf-link="product"]')
      ) as HTMLElement[];

      if (businessWa) {
        for (const el of productTargets) {
          const name = (el.dataset.productName || "").trim();
          const price = (el.dataset.productPrice || "").trim();
          if (!name) continue;

          const msg =
            `Hola 👋, quiero hacer un pedido:\n` +
            `• Producto: ${name}\n` +
            `• Precio: ${price}`;

          const url = `https://api.whatsapp.com/send?phone=${businessWa}&text=${encodeWaText(msg)}`;

          const rect = el.getBoundingClientRect();

          linkAreasCss.push({
            url,
            left: rect.left - rootRectForLinks.left,
            top: rect.top - rootRectForLinks.top,
            width: rect.width,
            height: rect.height,
          });
        }
      }

      // =========================
      // PDF DIMENSIONES
      // =========================
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const usableWmm = pageW - PDF_MARGIN_MM * 2;
      const usableHmm = pageH - PDF_MARGIN_MM * 2;

      const rootRect = clone.getBoundingClientRect();
      const domWidthCss = Math.ceil(rootRect.width);
      const totalHeightCss = Math.ceil(rootRect.height);

      const pxPerMmCss = domWidthCss / usableWmm;
      const pageHeightCss = Math.floor(usableHmm * pxPerMmCss);

      // =========================
      // DETECTAR FILAS
      // =========================
      const cards = Array.from(
        clone.querySelectorAll(".product-pdf")
      ) as HTMLElement[];

      const rows: { top: number; bottom: number }[] = [];
      const tolerance = 6;

      for (const card of cards) {
        const r = card.getBoundingClientRect();
        const top = Math.round(r.top - rootRect.top);
        const bottom = Math.round(r.bottom - rootRect.top);

        const last = rows[rows.length - 1];

        if (!last || Math.abs(last.top - top) > tolerance) {
          rows.push({ top, bottom });
        } else {
          last.bottom = Math.max(last.bottom, bottom);
        }
      }

      const safety = isIOS ? 14 : 4;
      const effectivePageHeight = pageHeightCss - safety;

      const pageRanges: { startY: number; endY: number }[] = [];

      let offsetY = 0;

      while (offsetY < totalHeightCss) {
        const idealEnd = Math.min(offsetY + effectivePageHeight, totalHeightCss);

        let endY = idealEnd;

        for (const row of rows) {
          if (row.top >= offsetY && row.top < idealEnd) {
            if (row.bottom > idealEnd) {
              endY = row.top;
              break;
            }
          }
        }

        if (endY <= offsetY) endY = idealEnd;

        pageRanges.push({ startY: offsetY, endY });

        offsetY = endY;
      }

      // =========================
      // RENDER
      // =========================
      const scale = isIOS ? 1 : Math.min(2, window.devicePixelRatio || 1);

      for (let i = 0; i < pageRanges.length; i++) {
        const { startY, endY } = pageRanges[i];
        const sliceHeightCss = endY - startY;

        viewport.style.height = `${sliceHeightCss}px`;
        clone.style.transform = `translateY(-${startY}px)`;

        await waitTwoFrames();

        const canvas = await html2canvas(viewport, {
          scale,
          useCORS: true,
          backgroundColor: "#ffffff",
          width: EXPORT_WIDTH_PX,
          height: sliceHeightCss,
          windowWidth: EXPORT_WIDTH_PX,
          windowHeight: sliceHeightCss,
        });

        const img = canvas.toDataURL("image/jpeg", isIOS ? 0.82 : 0.92);

        const sliceHmm = sliceHeightCss / pxPerMmCss;

        if (i > 0) pdf.addPage();

        pdf.addImage(
          img,
          "JPEG",
          PDF_MARGIN_MM,
          PDF_MARGIN_MM,
          usableWmm,
          sliceHmm,
          undefined,
          "FAST"
        );

        for (const la of linkAreasCss) {
          const visibleTop = Math.max(la.top, startY);
          const visibleBottom = Math.min(la.top + la.height, endY);

          if (visibleBottom <= visibleTop) continue;

          const xMm = PDF_MARGIN_MM + la.left / pxPerMmCss;
          const yMm = PDF_MARGIN_MM + (visibleTop - startY) / pxPerMmCss;

          const wMm = la.width / pxPerMmCss;
          const hMm = (visibleBottom - visibleTop) / pxPerMmCss;

          pdf.link(xMm, yMm, wMm, hMm, { url: la.url });
        }
      }

      clone.style.transform = "none";

      const safeFileName =
        (opts?.overrideFileName || fileName)
          .replace(/[^\w\s-]/gi, "")
          .replace(/\s+/g, "-")
          .toLowerCase() || "catalogo";

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
        await navigator.share({ files: [file] });
      } else {
        const msg = encodeURIComponent('Te comparto el catálogo en PDF');
        window.open(`https://wa.me/?text=${msg}`, '_blank');
        alert('Tu navegador no permite compartir archivos directo. Se abrió WhatsApp con el mensaje.');
      }
    } catch (error) {
      console.error(error);

      const errorMessage =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : typeof error === "string"
            ? error
            : JSON.stringify(error, null, 2);

      alert(`Error compartiendo PDF:\n\n${errorMessage}`);
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
