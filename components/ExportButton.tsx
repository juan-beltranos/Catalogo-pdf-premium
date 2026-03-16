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
  const [quality, setQuality] = useState<'normal' | 'alta'>('normal');
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  const categories = useMemo(() => {
    const groups = groupByCategory(products);
    return groups.map(([cat]) => cat);
  }, [products]);

  const generatePdf = async (
    opts?: { category?: string; overrideFileName?: string; quality?: 'normal' | 'alta' }
  ): Promise<{ blob: Blob; fileName: string }> => {
    if (!targetRef.current) throw new Error("targetRef is null");

    const EXPORT_WIDTH_PX = 794;
    const PDF_MARGIN_MM = 10;
    const resolvedQuality = opts?.quality ?? quality;
    const canvasScale = resolvedQuality === 'alta' ? 2 : 1.5;
    const jpegQuality = resolvedQuality === 'alta' ? (isIOS ? 0.80 : 0.88) : (isIOS ? 0.60 : 0.72);

    const encodeWaText = (t: string) => encodeURIComponent(t);

    const waitFrames = (n = 2) =>
      new Array(n).fill(0).reduce(
        (p) => p.then(() => new Promise<void>((r) => requestAnimationFrame(() => r()))),
        Promise.resolve()
      );

    const waitLoad = (img: HTMLImageElement) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); });

    // ─── IFRAME TRICK ────────────────────────────────────────────────────────
    // Render the clone inside a hidden iframe with a fixed 794px viewport.
    // This forces the browser to layout at desktop width regardless of the
    // real device viewport, so Tailwind breakpoints and font sizes are correct.
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-99999px";
    iframe.style.top = "0";
    iframe.style.width = `${EXPORT_WIDTH_PX}px`;
    iframe.style.height = "10px";          // grows with content
    iframe.style.border = "none";
    iframe.style.visibility = "hidden";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-1";
    document.body.appendChild(iframe);

    const objectUrlsToRevoke: string[] = [];

    try {
      // Copy all stylesheets into iframe
      const iDoc = iframe.contentDocument!;
      iDoc.open();
      iDoc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=${EXPORT_WIDTH_PX}">
        </head><body style="margin:0;padding:0;background:#fff;width:${EXPORT_WIDTH_PX}px"></body></html>`);
      iDoc.close();

      // Clone all <link rel="stylesheet"> and <style> from the host document
      Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).forEach((node) => {
        iDoc.head.appendChild(iDoc.importNode(node, true));
      });

      // Clone the catalog element
      const original = targetRef.current;
      const clone = original.cloneNode(true) as HTMLElement;
      clone.classList.add("pdf-mode");
      clone.style.width = `${EXPORT_WIDTH_PX}px`;
      clone.style.maxWidth = `${EXPORT_WIDTH_PX}px`;
      clone.style.margin = "0";
      clone.style.background = "#ffffff";
      clone.style.boxSizing = "border-box";
      clone.style.transform = "none";
      clone.style.minHeight = "auto";
      clone.style.height = "auto";
      clone.style.overflow = "visible";
      clone.style.position = "relative";

      iDoc.body.appendChild(clone);

      // Hide UI overlays
      clone.querySelectorAll('[data-hide-on-pdf="true"]').forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });

      // ── Category filter ──────────────────────────────────────────────────
      if (opts?.category) {
        const wanted = opts.category.trim().toLowerCase();
        (Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[]).forEach((card) => {
          const cat = ((card.dataset.category || "").trim() || "Sin categoría").toLowerCase();
          if (cat !== wanted) card.remove();
        });
      }

      // ── Force 2-column grid ──────────────────────────────────────────────
      const productsGrid = clone.querySelector(".products-grid") as HTMLElement | null;
      if (productsGrid) {
        productsGrid.style.cssText += `
          display:grid !important;
          grid-template-columns:repeat(2,minmax(0,1fr)) !important;
          column-gap:18px !important;
          row-gap:24px !important;
          align-items:start !important;
          width:100% !important;
          box-sizing:border-box !important;
        `;
      }

      (Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[]).forEach((card) => {
        card.style.cssText += `
          break-inside:avoid !important;
          page-break-inside:avoid !important;
          box-sizing:border-box !important;
          width:100% !important;
          max-width:100% !important;
          margin:0 !important;
        `;
      });

      // ── Images ───────────────────────────────────────────────────────────
      const imgs = Array.from(clone.querySelectorAll("img")) as HTMLImageElement[];

      await Promise.all(imgs.map(async (img) => {
        const id = img.dataset.imgid;
        img.setAttribute("loading", "eager");
        img.setAttribute("decoding", "sync");
        img.crossOrigin = "anonymous";
        img.referrerPolicy = "no-referrer";
        if (!img.src && id) {
          const url = await getImageUrl(id);
          if (url) { img.src = url; if (url.startsWith("blob:")) objectUrlsToRevoke.push(url); }
        }
      }));

      await Promise.all(imgs.map(waitLoad));

      // Fallback fetch for remote images that failed
      await Promise.all(imgs.map(async (img) => {
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
        } catch { /* skip */ }
      }));

      imgs.forEach((img) => {
        img.style.height = "auto";
        img.style.objectFit = "contain";
        img.style.objectPosition = "center";
        img.style.display = "block";
        img.style.margin = "0 auto";
      });

      // Let iframe reflow at 794px
      await waitFrames(4);
      if ("fonts" in iDoc) { try { await (iDoc as any).fonts.ready; } catch { } }
      await waitFrames(4);

      // Resize iframe height to match content so html2canvas captures everything
      const fullHeight = clone.scrollHeight || clone.offsetHeight;
      iframe.style.height = `${fullHeight + 20}px`;
      await waitFrames(2);

      // ── Measure card positions inside the iframe ─────────────────────────
      // offsetTop traversal relative to clone works here because the iframe
      // viewport IS 794px — layout is exactly desktop.
      const getPos = (el: HTMLElement, stop: HTMLElement) => {
        let top = 0, left = 0;
        let cur: HTMLElement | null = el;
        while (cur && cur !== stop) {
          top += cur.offsetTop || 0;
          left += cur.offsetLeft || 0;
          cur = cur.offsetParent as HTMLElement | null;
        }
        return { top, left, width: el.offsetWidth, height: el.offsetHeight };
      };

      // ── Links ────────────────────────────────────────────────────────────
      type LinkArea = { url: string; left: number; top: number; width: number; height: number };
      const linkAreasCss: LinkArea[] = [];

      const pushLink = (el: HTMLElement, url: string) => {
        if (!url || url === "#") return;
        const pos = getPos(el, clone);
        if (pos.width <= 0 || pos.height <= 0) return;
        linkAreasCss.push({ url, ...pos });
      };

      const waFromDom = clone.querySelector('[data-store-whatsapp="true"]')?.textContent || "";
      const businessWa = normalizeWaNumber(businessWhatsapp || waFromDom, "57");

      (Array.from(clone.querySelectorAll('[data-pdf-link="product"]')) as HTMLElement[]).forEach((el) => {
        const name = (el.dataset.productName || "").trim();
        const price = (el.dataset.productPrice || "").trim();
        if (!name) return;
        let url = (el as HTMLAnchorElement).getAttribute?.("href") || "";
        if (businessWa) {
          const msg = `Hola 👋, quiero hacer un pedido:\n• Producto: ${name}\n• Precio: ${formatCurrency(Number(price || 0))}`;
          url = `https://api.whatsapp.com/send?phone=${businessWa}&text=${encodeWaText(msg)}`;
        }
        if (url && url !== "#") pushLink(el, url);
      });

      (Array.from(clone.querySelectorAll("a[href]")) as HTMLAnchorElement[]).forEach((a) => {
        const href = (a.getAttribute("href") || "").trim();
        if (!href || href === "#") return;
        if (a.matches('[data-pdf-link="product"]')) return;
        pushLink(a, href);
      });

      // ── Fix badge/button alignment for html2canvas ──────────────────────
      // html2canvas doesn't reliably render inline-flex centering.
      // We force inline styles directly on each element in the clone.

      // Price badges
      clone.querySelectorAll('[data-price-inline="true"]').forEach((el) => {
        const el_ = el as HTMLElement;
        el_.style.display = 'flex';
        el_.style.alignItems = 'center';
        el_.style.justifyContent = 'center';
        el_.style.lineHeight = '1';
        el_.style.paddingTop = '0';
        el_.style.paddingBottom = '0';
        const span = el_.querySelector('span');
        if (span) {
          span.style.display = 'block';
          span.style.lineHeight = '1';
          span.style.margin = '0';
          span.style.padding = '0';
          span.style.position = 'static';
          span.style.transform = 'none';
        }
      });

      // Category badges
      clone.querySelectorAll('[data-category-badge="true"]').forEach((el) => {
        const el_ = el as HTMLElement;
        el_.style.display = 'flex';
        el_.style.alignItems = 'center';
        el_.style.justifyContent = 'center';
        el_.style.lineHeight = '1';
        el_.style.paddingTop = '0';
        el_.style.paddingBottom = '0';
        const span = el_.querySelector('span');
        if (span) {
          span.style.display = 'block';
          span.style.lineHeight = '1';
          span.style.margin = '0';
          span.style.padding = '0';
          span.style.position = 'static';
          span.style.transform = 'none';
        }
      });

      // Action hint / Comprar button — replace SVG icon with a plain unicode circle
      // so layout doesn't depend on SVG vertical alignment
      clone.querySelectorAll('[data-action-hint="true"]').forEach((el) => {
        const el_ = el as HTMLElement;
        el_.style.display = 'flex';
        el_.style.alignItems = 'center';
        el_.style.justifyContent = 'center';
        el_.style.lineHeight = '1';
        el_.style.paddingTop = '0';
        el_.style.paddingBottom = '0';

        // Find the inner span that wraps icon + text
        const innerSpan = el_.querySelector('span') as HTMLElement | null;
        if (innerSpan) {
          innerSpan.style.display = 'flex';
          innerSpan.style.alignItems = 'center';
          innerSpan.style.justifyContent = 'center';
          innerSpan.style.gap = '5px';
          innerSpan.style.lineHeight = '1';
          innerSpan.style.margin = '0';
          innerSpan.style.padding = '0';
          innerSpan.style.position = 'static';
          innerSpan.style.transform = 'none';

          // Replace the lucide SVG with a simple unicode WhatsApp-ish circle
          // so it's just text and doesn't break vertical alignment
          const svg = innerSpan.querySelector('svg');
          if (svg) {
            const replacement = document.createElement('span');
            replacement.textContent = '●';
            replacement.style.fontSize = '8px';
            replacement.style.color = '#16a34a';
            replacement.style.lineHeight = '1';
            replacement.style.display = 'inline-block';
            replacement.style.verticalAlign = 'middle';
            svg.replaceWith(replacement);
          }
        }
      });

      // ── Capture with html2canvas ─────────────────────────────────────────
      const canvas = await html2canvas(clone, {
        scale: canvasScale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        width: EXPORT_WIDTH_PX,
        windowWidth: EXPORT_WIDTH_PX,
        windowHeight: fullHeight,
        scrollX: 0,
        scrollY: 0,
      });

      // ── PDF page-break logic ─────────────────────────────────────────────
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const usableWmm = pageW - PDF_MARGIN_MM * 2;
      const usableHmm = pageH - PDF_MARGIN_MM * 2;

      const pxPerMm = (EXPORT_WIDTH_PX * canvasScale) / usableWmm;
      const pageHeightPx = Math.floor(usableHmm * pxPerMm);

      const domTotalHeight = fullHeight || 1;
      const scaleY = canvas.height / domTotalHeight;

      // Build breakpoints after each card's bottom edge
      const cards = Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[];

      const bpSet = new Set<number>();
      bpSet.add(0);
      bpSet.add(canvas.height);

      cards.forEach((card) => {
        const pos = getPos(card, clone);
        const bottomCanvas = Math.floor((pos.top + pos.height) * scaleY) + 8;
        bpSet.add(Math.max(0, Math.min(canvas.height, bottomCanvas)));
      });

      const breakpoints = Array.from(bpSet).sort((a, b) => a - b);

      const pickBreak = (from: number, limit: number): number => {
        let chosen = -1;
        for (const v of breakpoints) {
          if (v <= limit && v > from) chosen = v;
          if (v > limit) break;
        }
        return chosen;
      };

      let offsetY = 0;
      let pageIndex = 0;
      const cssPxPerMm = EXPORT_WIDTH_PX / usableWmm;

      while (offsetY < canvas.height) {
        const idealEnd = offsetY + pageHeightPx;
        let endY = pickBreak(offsetY, idealEnd);

        if (endY === -1) {
          // Try to avoid cutting mid-card: push break before the offending card
          let breakBefore = -1;
          for (const card of cards) {
            const pos = getPos(card, clone);
            const cardTop = Math.floor(pos.top * scaleY);
            const cardBot = Math.floor((pos.top + pos.height) * scaleY);
            if (cardTop < idealEnd && cardBot > idealEnd) {
              const candidate = Math.max(offsetY + 1, cardTop - 4);
              if (candidate > offsetY && (breakBefore === -1 || candidate < breakBefore)) {
                breakBefore = candidate;
              }
            }
          }
          endY = breakBefore !== -1 ? breakBefore : Math.min(idealEnd, canvas.height);
        }

        const sliceH = endY - offsetY;
        if (sliceH <= 0) break;

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceH;
        const ctx = pageCanvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

        const imgData = pageCanvas.toDataURL("image/jpeg", jpegQuality);
        const sliceHmm = sliceH / pxPerMm;
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", PDF_MARGIN_MM, PDF_MARGIN_MM, usableWmm, sliceHmm, undefined, "FAST");

        // Links for this page
        const pageStartDom = offsetY / scaleY;
        const pageEndDom = endY / scaleY;
        for (const la of linkAreasCss) {
          const visTop = Math.max(la.top, pageStartDom);
          const visBot = Math.min(la.top + la.height, pageEndDom);
          if (visBot <= visTop) continue;
          pdf.link(
            PDF_MARGIN_MM + la.left / cssPxPerMm,
            PDF_MARGIN_MM + (visTop - pageStartDom) / cssPxPerMm,
            la.width / cssPxPerMm,
            (visBot - visTop) / cssPxPerMm,
            { url: la.url }
          );
        }

        offsetY = endY;
        pageIndex++;
      }

      const safeFileName =
        (opts?.overrideFileName || fileName)
          .replace(/[^\w\s-]/gi, "")
          .replace(/\s+/g, "-")
          .toLowerCase() || "catalogo";

      return { blob: pdf.output("blob"), fileName: `${safeFileName}.pdf` };

    } finally {
      objectUrlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
      iframe.remove();
    }
  };

  const handleDownloadPdfAll = async () => {
    try {
      setLoading(true);
      const { blob, fileName: outName } = await generatePdf({ overrideFileName: fileName, quality });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = outName;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Error generando/descargando PDF.");
    } finally { setLoading(false); }
  };

  const handleDownloadPdfSelectedCategory = async () => {
    if (selectedCategory === "__ALL__") return;
    try {
      setLoading(true);
      const outBase = `${fileName}-${slug(selectedCategory)}`;
      const { blob, fileName: outName } = await generatePdf({ category: selectedCategory, overrideFileName: outBase, quality });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = outName;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Error generando/descargando PDF por categoría.");
    } finally { setLoading(false); }
  };

  const handleShareWhatsApp = async () => {
    try {
      setLoading(true);
      const { blob, fileName: fn } = await generatePdf({ quality });
      const file = new File([blob], fn, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent('Te comparto el catálogo en PDF')}`, '_blank');
        alert('Tu navegador no permite compartir archivos directo. Se abrió WhatsApp con el mensaje.');
      }
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error, null, 2);
      alert(`Error compartiendo PDF:\n\n${msg}`);
    } finally { setLoading(false); }
  };

  return (
    <div
      data-hide-on-pdf="true"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3"
    >
      <div className="mx-auto max-w-md rounded-2xl border border-black/10 bg-white/85 backdrop-blur shadow-lg p-2">
        <div className="flex flex-col gap-2">

          {/* Quality toggle */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-slate-500 font-medium">Calidad del PDF</span>
            <div className="flex rounded-lg overflow-hidden border border-black/10 text-xs font-semibold">
              <button
                onClick={() => setQuality('normal')} disabled={loading}
                className={`px-3 py-1.5 transition ${quality === 'normal' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >Normal</button>
              <button
                onClick={() => setQuality('alta')} disabled={loading}
                className={`px-3 py-1.5 transition ${quality === 'alta' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >Alta</button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 px-1 -mt-1">
            {quality === 'normal' ? 'Archivo más liviano (~1–3 MB) — ideal para WhatsApp' : 'Mayor resolución (~4–8 MB) — mejor para imprimir'}
          </p>

          <div className="flex gap-2">
            <button onClick={handleShareWhatsApp} disabled={loading}
              className="flex-1 h-12 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? "Preparando…" : "Compartir WhatsApp"}
            </button>
            <button onClick={handleDownloadPdfAll} disabled={loading}
              className="flex-1 h-12 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? "Creando…" : "PDF (Todo)"}
            </button>
          </div>

          <div className="flex gap-2">
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
              className="flex-1 h-12 rounded-xl border border-black/10 bg-white px-3 text-sm" disabled={loading}>
              <option value="__ALL__">Selecciona categoría…</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={handleDownloadPdfSelectedCategory} disabled={loading || selectedCategory === "__ALL__"}
              className="flex-1 h-12 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? "Creando…" : "PDF (Categoría)"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
