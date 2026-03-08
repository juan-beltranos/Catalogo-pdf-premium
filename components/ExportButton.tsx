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
    const OVERLAP_CSS_PX = 2;

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
    printRoot.style.visibility = "visible";
    printRoot.style.contain = "none";
    document.body.appendChild(printRoot);

    const objectUrlsToRevoke: string[] = [];

    try {
      const original = targetRef.current;

      const clone = original.cloneNode(true) as HTMLElement;
      clone.classList.add("pdf-mode");
      clone.style.width = `${EXPORT_WIDTH_PX}px`;
      clone.style.maxWidth = `${EXPORT_WIDTH_PX}px`;
      clone.style.margin = "0";
      clone.style.minHeight = "auto";
      clone.style.height = "auto";
      clone.style.transform = "none";
      clone.style.transformOrigin = "top left";
      clone.style.willChange = "auto";
      clone.style.background = "#ffffff";
      clone.style.backgroundColor = "#ffffff";
      clone.style.opacity = "1";
      clone.style.filter = "none";
      (clone.style as any).backdropFilter = "none";
      (clone.style as any).webkitBackdropFilter = "none";
      clone.style.boxShadow = "none";

      clone.querySelectorAll('[data-hide-on-pdf="true"]').forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });

      // Normalización general
      const allNodes = Array.from(clone.querySelectorAll("*")) as HTMLElement[];
      allNodes.forEach((el) => {
        const cs = window.getComputedStyle(el);

        if (cs.filter && cs.filter !== "none") el.style.filter = "none";
        if ((cs as any).backdropFilter && (cs as any).backdropFilter !== "none") {
          (el.style as any).backdropFilter = "none";
          (el.style as any).webkitBackdropFilter = "none";
        }
        if (cs.boxShadow && cs.boxShadow !== "none") el.style.boxShadow = "none";
        if ((cs as any).mixBlendMode && (cs as any).mixBlendMode !== "normal") {
          (el.style as any).mixBlendMode = "normal";
        }
      });

      clone.querySelectorAll('[data-price-inline="true"]').forEach((el) => {
        const e = el as HTMLElement;
        e.style.display = 'inline-flex';
        e.style.alignItems = 'center';
        e.style.justifyContent = 'center';
        e.style.lineHeight = '1';
        e.style.verticalAlign = 'top';
        e.style.paddingTop = '0';
        e.style.paddingBottom = '0';
        e.style.boxSizing = 'border-box';
        e.style.whiteSpace = 'nowrap';
        e.style.minHeight = '36px';
      });

      clone.querySelectorAll('[data-category-badge="true"]').forEach((el) => {
        const e = el as HTMLElement;
        e.style.display = 'inline-flex';
        e.style.alignItems = 'center';
        e.style.justifyContent = 'center';
        e.style.lineHeight = '1';
        e.style.verticalAlign = 'top';
        e.style.paddingTop = '0';
        e.style.paddingBottom = '0';
        e.style.boxSizing = 'border-box';
        e.style.whiteSpace = 'nowrap';
        e.style.minHeight = '24px';
      });

      // =========================
      // 0) FILTRO POR CATEGORÍA
      // =========================
      if (opts?.category) {
        const wanted = opts.category;

        const cards = Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[];
        cards.forEach((card) => {
          const cat = (card.dataset.category || "").trim() || "Sin categoría";
          const normalize = (s: string) => s.trim().toLowerCase();

          if (normalize(cat) !== normalize(wanted)) {
            card.remove();
          }
        });
      }

      // =========================
      // 1) LIMPIEZA VISUAL EXACTA DEL CARD
      // =========================
      const cards = Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[];
      cards.forEach((card) => {
        card.style.breakInside = "avoid";
        (card.style as any).pageBreakInside = "avoid";
        card.style.background = "#ffffff";
        card.style.backgroundColor = "#ffffff";
        card.style.boxShadow = "none";
        card.style.filter = "none";
        card.style.opacity = "1";
      });

      // Contenedor visual del producto: blanco real, sin sombras raras
      clone.querySelectorAll(".product-media").forEach((el) => {
        const e = el as HTMLElement;
        e.style.background = "#ffffff";
        e.style.backgroundColor = "#ffffff";
        e.style.boxShadow = "none";
        e.style.filter = "none";
        e.style.opacity = "1";
        e.style.borderColor = "#e5e7eb";
      });

      // Cualquier wrapper interno del media también blanco
      clone.querySelectorAll(".product-media *").forEach((el) => {
        const e = el as HTMLElement;
        e.style.boxShadow = "none";
        e.style.filter = "none";
        (e.style as any).backdropFilter = "none";
        (e.style as any).webkitBackdropFilter = "none";
      });

      // Placeholder "Sin Foto"
      clone.querySelectorAll(".product-media .bg-slate-50").forEach((el) => {
        const e = el as HTMLElement;
        e.style.background = "#ffffff";
        e.style.backgroundColor = "#ffffff";
        e.style.color = "#cbd5e1";
      });

      // Ocultar overlay hover dentro del producto
      clone.querySelectorAll(".product-media .absolute.inset-0").forEach((el) => {
        const e = el as HTMLElement;
        e.style.display = "none";
      });

      // Badge destacado sin sombra
      clone.querySelectorAll('[data-featured-badge="true"]').forEach((el) => {
        const e = el as HTMLElement;
        e.style.boxShadow = "none";
        e.style.filter = "none";
      });

      // Skeletons / shimmer si existen
      clone
        .querySelectorAll(
          '[data-skeleton="true"], .skeleton, .animate-pulse, .shimmer, [aria-busy="true"]'
        )
        .forEach((el) => {
          (el as HTMLElement).style.display = "none";
        });

      // =========================
      // 2) ASEGURAR IMÁGENES
      // =========================
      const imgsAll = Array.from(clone.querySelectorAll("img")) as HTMLImageElement[];

      await Promise.all(
        imgsAll.map(async (img) => {
          const hasSrc = !!img.getAttribute("src")?.trim();
          const id = img.dataset.imgid;
          const currentSrc = img.getAttribute("src") || "";

          img.setAttribute("loading", "eager");
          img.setAttribute("decoding", "sync");

          if (currentSrc.startsWith("http")) {
            img.crossOrigin = "anonymous";
            img.referrerPolicy = "no-referrer";
          }

          if (!hasSrc && id) {
            const url = await getImageUrl(id);
            if (url) {
              img.src = url;
              if (url.startsWith("blob:")) objectUrlsToRevoke.push(url);
            }
          }
        })
      );

      await Promise.all(imgsAll.map(waitLoad));

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
            // no bloquea
          }
        })
      );

      imgsAll.forEach((img) => {
        img.style.width = "auto";
        img.style.height = "auto";
        img.style.objectFit = "contain";
        img.style.objectPosition = "center";
        img.style.display = "block";
        img.style.background = "#ffffff";
        img.style.backgroundColor = "#ffffff";
        img.style.boxShadow = "none";
        img.style.filter = "none";
        img.style.opacity = "1";
      });

      // =========================
      // 3) HOST DE CAPTURA
      // =========================
      const viewport = document.createElement("div");
      viewport.style.position = "relative";
      viewport.style.width = `${EXPORT_WIDTH_PX}px`;
      viewport.style.overflow = "hidden";
      viewport.style.background = "#ffffff";
      viewport.style.backgroundColor = "#ffffff";
      viewport.style.margin = "0";
      viewport.style.padding = "0";
      viewport.style.boxShadow = "none";
      viewport.style.filter = "none";
      (viewport.style as any).backdropFilter = "none";
      (viewport.style as any).webkitBackdropFilter = "none";

      viewport.appendChild(clone);
      printRoot.appendChild(viewport);

      await waitTwoFrames();

      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready;
      }

      await waitTwoFrames();

      // =========================
      // 4) CAPTURAR LINKS
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

      const socialLinks = Array.from(
        clone.querySelectorAll('a[data-pdf-link="social"]')
      ) as HTMLAnchorElement[];

      for (const a of socialLinks) {
        const href = (a.getAttribute("href") || "").trim();
        if (!href) continue;

        const rect = a.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;

        const left = rect.left - rootRectForLinks.left;
        const top = rect.top - rootRectForLinks.top;
        const url = href.startsWith("http") ? href : `https://${href}`;

        linkAreasCss.push({
          url,
          left,
          top,
          width: rect.width,
          height: rect.height,
        });
      }

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
            `• Precio: ${price}\n` +
            `¿Me confirmas disponibilidad?`;
          
          const url = `https://api.whatsapp.com/send?phone=${businessWa}&text=${encodeWaText(msg)}`;

          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;

          const left = rect.left - rootRectForLinks.left;
          const top = rect.top - rootRectForLinks.top;
          const pad = 2;

          linkAreasCss.push({
            url,
            left: left - pad,
            top: top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          });
        }
      }

      // =========================
      // 5) MEDIDAS PDF / DOM
      // =========================
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const usableWmm = pageW - PDF_MARGIN_MM * 2;
      const usableHmm = pageH - PDF_MARGIN_MM * 2;

      const rootRect = clone.getBoundingClientRect();
      const domWidthCss = Math.ceil(rootRect.width || EXPORT_WIDTH_PX);
      const totalHeightCss = Math.ceil(rootRect.height || clone.scrollHeight || 1);

      const pxPerMmCss = domWidthCss / usableWmm;
      const pageHeightCss = Math.floor(usableHmm * pxPerMmCss);

      // =========================
      // 6) BREAKPOINTS
      // =========================
      const bpSet = new Set<number>();
      bpSet.add(0);
      bpSet.add(totalHeightCss);

      const cardsAfterLayout = Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[];
      for (const card of cardsAfterLayout) {
        const r = card.getBoundingClientRect();
        const topCss = Math.round(r.top - rootRect.top);
        bpSet.add(Math.max(0, Math.min(totalHeightCss, topCss)));
      }

      const breakpoints = Array.from(bpSet)
        .filter((v) => Number.isFinite(v))
        .map((v) => Math.max(0, Math.min(totalHeightCss, Math.round(v))))
        .sort((a, b) => a - b);

      const pickBreak = (offsetY: number, limit: number) => {
        let chosen = -1;
        for (let i = 0; i < breakpoints.length; i++) {
          const v = breakpoints[i];
          if (v <= limit && v > offsetY) chosen = v;
          if (v > limit) break;
        }
        return chosen;
      };

      const pageRanges: Array<{ startY: number; endY: number }> = [];
      let offsetY = 0;

      while (offsetY < totalHeightCss) {
        const idealEnd = offsetY + pageHeightCss;

        let endY = pickBreak(offsetY, idealEnd);
        if (endY === -1) endY = Math.min(idealEnd, totalHeightCss);

        if (endY <= offsetY) {
          endY = Math.min(offsetY + pageHeightCss, totalHeightCss);
        }

        pageRanges.push({ startY: offsetY, endY });

        let nextOffset = endY - OVERLAP_CSS_PX;
        if (nextOffset <= offsetY) nextOffset = endY;
        offsetY = nextOffset;
      }

      // =========================
      // 7) RENDERIZAR CADA PÁGINA
      // =========================
      const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

      for (let pageIndex = 0; pageIndex < pageRanges.length; pageIndex++) {
        const { startY, endY } = pageRanges[pageIndex];
        const sliceHeightCss = endY - startY;

        viewport.style.height = `${sliceHeightCss}px`;
        clone.style.transform = `translateY(-${startY}px)`;

        await waitTwoFrames();

        const pageCanvas = await html2canvas(viewport, {
          scale,
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: domWidthCss,
          windowHeight: sliceHeightCss,
          width: domWidthCss,
          height: sliceHeightCss,
          imageTimeout: 15000,
          removeContainer: true,
          onclone: (doc) => {
            const el = doc.getElementById("catalog-capture-area");
            el?.classList.add("pdf-mode");
          },
        });

        if (!pageCanvas.width || !pageCanvas.height) {
          throw new Error("No se pudo capturar una página del catálogo.");
        }

        const whiteCanvas = document.createElement("canvas");
        whiteCanvas.width = pageCanvas.width;
        whiteCanvas.height = pageCanvas.height;

        const whiteCtx = whiteCanvas.getContext("2d");
        if (!whiteCtx) throw new Error("No se pudo crear el canvas final.");

        whiteCtx.fillStyle = "#ffffff";
        whiteCtx.fillRect(0, 0, whiteCanvas.width, whiteCanvas.height);
        whiteCtx.drawImage(pageCanvas, 0, 0);

        const pageImg = whiteCanvas.toDataURL("image/jpeg", 0.95);
        const sliceHmm = sliceHeightCss / pxPerMmCss;

        if (pageIndex > 0) pdf.addPage();
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, pageW, pageH, "F");

        pdf.addImage(
          pageImg,
          "JPEG",
          PDF_MARGIN_MM,
          PDF_MARGIN_MM,
          usableWmm,
          sliceHmm,
          undefined,
          "FAST"
        );

        for (const la of linkAreasCss) {
          const linkTop = la.top;
          const linkBottom = la.top + la.height;

          const intersects = linkBottom > startY && linkTop < endY;
          if (!intersects) continue;

          const visibleTop = Math.max(linkTop, startY);
          const visibleBottom = Math.min(linkBottom, endY);
          const visibleH = visibleBottom - visibleTop;
          if (visibleH <= 0) continue;

          const xMm = PDF_MARGIN_MM + la.left / pxPerMmCss;
          const yMm = PDF_MARGIN_MM + (visibleTop - startY) / pxPerMmCss;
          const wMm = la.width / pxPerMmCss;
          const hMm = visibleH / pxPerMmCss;

          pdf.link(xMm, yMm, wMm, hMm, { url: la.url });
        }
      }

      clone.style.transform = "none";

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
