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

    const EXPORT_WIDTH_PX = 800;

    const cleanPhoneForWa = (v: string) => (v || "").replace(/[^\d]/g, "");
    const encodeWaText = (t: string) => encodeURIComponent(t);

    const printRoot = document.createElement("div");
    printRoot.style.position = "fixed";
    printRoot.style.left = "-10000px";
    printRoot.style.top = "0";
    printRoot.style.width = `${EXPORT_WIDTH_PX}px`;
    printRoot.style.background = "#ffffff";
    printRoot.style.zIndex = "-1";
    printRoot.style.contain = "layout style paint";
    document.body.appendChild(printRoot);

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

      // ✅ En export: siempre mostrar tag absoluto y ocultar precio móvil
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
        e.style.bottom = "-10px"; 
        e.style.zIndex = "999";
      });

      // =========================
      // 0) FILTRO POR CATEGORÍA (si aplica)
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
      // 1) FORZAR LAYOUT + NO CORTES
      // =========================
      const cards = Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[];
      cards.forEach((card) => {
        card.style.breakInside = "avoid";
        (card.style as any).pageBreakInside = "avoid";
      });

      // =========================
      // 2) PRECIO SIEMPRE ENCIMA + ocultar precio móvil (si existiera)
      // =========================
      clone.querySelectorAll(".price-tag").forEach((el) => {
        const e = el as HTMLElement;
        e.style.display = "flex";
        e.style.position = "absolute";
        e.style.right = "16px";
        e.style.bottom = "-10px"; 
        e.style.zIndex = "5";
        e.style.alignItems = "center";
        e.style.justifyContent = "center";
      });

      clone.querySelectorAll(".price-mobile").forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });

      // =========================
      // 3) ASEGURAR IMÁGENES (URL + IndexedDB)
      // =========================
      const imgsAll = Array.from(clone.querySelectorAll("img")) as HTMLImageElement[];

      await Promise.all(
        imgsAll.map(async (img) => {
          const hasSrc = !!img.getAttribute("src")?.trim();
          const id = img.dataset.imgid;

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

      const waitLoad = (img: HTMLImageElement) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          });

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
      });

      // =========================
      // 3.5) CAPTURAR LINKS ANTES DEL CANVAS (REDES + PRODUCTOS)
      // =========================
      type LinkArea = { url: string; left: number; top: number; width: number; height: number };
      const linkAreasCss: LinkArea[] = [];

      const rootRectForLinks = clone.getBoundingClientRect();

      // A) Redes
      const socialLinks = Array.from(
        clone.querySelectorAll('a[data-pdf-link="social"]')
      ) as HTMLAnchorElement[];

      for (const a of socialLinks) {
        const href = (a.getAttribute("href") || "").trim();
        if (!href) continue;

        const rect = a.getBoundingClientRect();
        const left = rect.left - rootRectForLinks.left;
        const top = rect.top - rootRectForLinks.top;

        if (rect.width <= 0 || rect.height <= 0) continue;

        const url = href.startsWith("http") ? href : `https://${href}`;
        linkAreasCss.push({ url, left, top, width: rect.width, height: rect.height });
      }

      // B) WhatsApp del negocio (lo lee del DOM clonado)
      const businessWa = cleanPhoneForWa(
        (clone.querySelector('[data-store-whatsapp="true"]')?.textContent || "")
      );

      // C) Productos -> WhatsApp con mensaje
      const productTargets = Array.from(
        clone.querySelectorAll('[data-pdf-link="product"]')
      ) as HTMLElement[];

      if (businessWa) {
        for (const el of productTargets) {
          const name = (el.dataset.productName || "").trim();
          const price = (el.dataset.productPrice || "").trim();

          if (!name) continue;

          const msg = `Hola, quiero el producto: ${name}${price ? ` (Precio: ${price})` : ""}`;
          const url = `https://wa.me/${businessWa}?text=${encodeWaText(msg)}`;

          const rect = el.getBoundingClientRect();
          const left = rect.left - rootRectForLinks.left;
          const top = rect.top - rootRectForLinks.top;

          if (rect.width <= 0 || rect.height <= 0) continue;

          // Si quieres un poquito más grande el área clicable:
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
      // 5) PDF PAGINADO (SMART: NO CORTAR TARJETAS)
      // =========================
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;

      const usableWmm = pageW - margin * 2;
      const usableHmm = pageH - margin * 2;

      const pxPerMm = canvas.width / usableWmm;
      const pageHeightPx = Math.floor(usableHmm * pxPerMm);

      const domHeight = clone.scrollHeight || clone.getBoundingClientRect().height || 1;
      const scaleY = canvas.height / domHeight;

      const getMarginBottom = (el: HTMLElement) => {
        const mb = window.getComputedStyle(el).marginBottom;
        const n = parseFloat(mb || "0");
        return Number.isFinite(n) ? n : 0;
      };

      const bpSet = new Set<number>();
      bpSet.add(0);
      bpSet.add(canvas.height);

      const rootRect = clone.getBoundingClientRect();
      const cardsAfterLayout = Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[];

      for (const card of cardsAfterLayout) {
        const r = card.getBoundingClientRect();
        const bottomCss = (r.bottom - rootRect.top) + getMarginBottom(card);
        const bottomCanvas = Math.floor(bottomCss * scaleY);
        bpSet.add(Math.max(0, Math.min(canvas.height, bottomCanvas - 4)));
      }

      const breakpoints = Array.from(bpSet)
        .filter((v) => Number.isFinite(v))
        .map((v) => Math.max(0, Math.min(canvas.height, Math.floor(v))))
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

      let offsetY = 0;
      let pageIndex = 0;

      while (offsetY < canvas.height) {
        const idealEnd = offsetY + pageHeightPx;
        let endY = pickBreak(offsetY, idealEnd);
        if (endY === -1) endY = Math.min(idealEnd, canvas.height);

        const sliceHeight = endY - offsetY;
        if (sliceHeight <= 0) break;

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

        // =========================
        // 6) LINKS CLICABLES SOBRE LA IMAGEN (REDES + PRODUCTOS)
        // =========================
        const domWidth = clone.getBoundingClientRect().width || 1;
        const domHeight2 = clone.scrollHeight || clone.getBoundingClientRect().height || 1;

        const scaleX = canvas.width / domWidth;
        const scaleY2 = canvas.height / domHeight2;

        for (const la of linkAreasCss) {
          const xCanvas = la.left * scaleX;
          const yCanvas = la.top * scaleY2;
          const wCanvas = la.width * scaleX;
          const hCanvas = la.height * scaleY2;

          const sliceTop = offsetY;
          const sliceBottom = endY;

          const linkTop = yCanvas;
          const linkBottom = yCanvas + hCanvas;

          const intersects = linkBottom > sliceTop && linkTop < sliceBottom;
          if (!intersects) continue;

          const visibleTop = Math.max(linkTop, sliceTop);
          const visibleBottom = Math.min(linkBottom, sliceBottom);
          const visibleH = visibleBottom - visibleTop;
          if (visibleH <= 0) continue;

          const xMm = margin + (xCanvas / pxPerMm);
          const yMm = margin + ((visibleTop - sliceTop) / pxPerMm);
          const wMm = wCanvas / pxPerMm;
          const hMm = visibleH / pxPerMm;

          pdf.link(xMm, yMm, wMm, hMm, { url: la.url });
        }

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
