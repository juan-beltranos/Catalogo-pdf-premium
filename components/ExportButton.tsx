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

    const EXPORT_WIDTH_PX = 794;
    const PDF_MARGIN_MM = 10;

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

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
    printRoot.style.left = "-10000px";
    printRoot.style.top = "0";
    printRoot.style.width = `${EXPORT_WIDTH_PX}px`;
    printRoot.style.background = "#ffffff";
    printRoot.style.zIndex = "-1";
    printRoot.style.overflow = "hidden";
    printRoot.style.pointerEvents = "none";

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
      clone.style.boxSizing = "border-box";
      clone.style.transform = "none";
      clone.style.minHeight = "auto";
      clone.style.height = "auto";

      printRoot.appendChild(clone);

      clone.querySelectorAll('[data-hide-on-pdf="true"]').forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });

      // =========================
      // FILTRO CATEGORÍA
      // =========================
      if (opts?.category) {
        const wanted = opts.category.trim().toLowerCase();

        const cards = Array.from(
          clone.querySelectorAll(".product-pdf")
        ) as HTMLElement[];

        cards.forEach((card) => {
          const cat = ((card.dataset.category || "").trim() || "Sin categoría").toLowerCase();

          if (cat !== wanted) {
            card.remove();
          }
        });
      }

      // =========================
      // GRID LAYOUT
      // =========================
      const productsGrid = clone.querySelector(".products-grid") as HTMLElement | null;

      if (productsGrid) {
        productsGrid.style.display = "grid";
        productsGrid.style.gridTemplateColumns = isMobile
          ? "minmax(0, 1fr)"
          : "repeat(2, minmax(0, 1fr))";
        productsGrid.style.columnGap = isMobile ? "0px" : "18px";
        productsGrid.style.rowGap = isMobile ? "18px" : "24px";
        productsGrid.style.alignItems = "start";
        productsGrid.style.width = "100%";
        productsGrid.style.boxSizing = "border-box";
      }

      clone.querySelectorAll(".product-pdf").forEach((el) => {
        const card = el as HTMLElement;

        card.style.breakInside = "avoid";
        card.style.pageBreakInside = "avoid";
        (card.style as any).webkitColumnBreakInside = "avoid";

        card.style.boxSizing = "border-box";
        card.style.width = "100%";
        card.style.maxWidth = "100%";
        card.style.margin = "0";
      });

      // =========================
      // ASEGURAR IMÁGENES
      // =========================
      const imgs = Array.from(clone.querySelectorAll("img")) as HTMLImageElement[];

      await Promise.all(
        imgs.map(async (img) => {
          const id = img.dataset.imgid;

          img.setAttribute("loading", "eager");
          img.setAttribute("decoding", "sync");
          img.crossOrigin = "anonymous";
          img.referrerPolicy = "no-referrer";

          if (!img.src && id) {
            const url = await getImageUrl(id);
            if (url) {
              img.src = url;
              if (url.startsWith("blob:")) objectUrlsToRevoke.push(url);
            }
          }
        })
      );

      await Promise.all(imgs.map(waitLoad));

      // fallback para imágenes remotas que no cargaron bien
      await Promise.all(
        imgs.map(async (img) => {
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
            // no bloquea exportación
          }
        })
      );

      imgs.forEach((img) => {
        img.style.height = "auto";
        img.style.objectFit = "contain";
        img.style.objectPosition = "center";
        img.style.display = "block";
        img.style.margin = "0 auto";
      });

      await waitTwoFrames();

      if ("fonts" in document) {
        try {
          await (document as any).fonts.ready;
        } catch { }
      }

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

      const pushLinkArea = (el: HTMLElement, url: string) => {
        const rect = el.getBoundingClientRect();

        if (!url || rect.width <= 0 || rect.height <= 0) return;

        linkAreasCss.push({
          url,
          left: rect.left - rootRectForLinks.left,
          top: rect.top - rootRectForLinks.top,
          width: rect.width,
          height: rect.height,
        });
      };

      // 1) Tarjetas producto => WhatsApp
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
            `• Precio: ${formatCurrency(Number(price || 0))}`;

          const url = `https://api.whatsapp.com/send?phone=${businessWa}&text=${encodeWaText(
            msg
          )}`;

          pushLinkArea(el, url);
        }
      }

      // 2) Links normales => redes / web / etc.
      const anchors = Array.from(
        clone.querySelectorAll("a[href]")
      ) as HTMLAnchorElement[];

      for (const a of anchors) {
        const href = (a.getAttribute("href") || "").trim();
        if (!href) continue;

        // Evita duplicar si alguna tarjeta de producto también es un <a>
        if (a.matches('[data-pdf-link="product"]')) continue;

        pushLinkArea(a, href);
      }

      // =========================
      // CAPTURA COMPLETA
      // =========================
      const canvas = await html2canvas(clone, {
        scale: isMobile ? 2 : Math.min(2, window.devicePixelRatio || 1),
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        width: EXPORT_WIDTH_PX,
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
      // PDF
      // =========================
      const pdf = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
      });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const usableWmm = pageW - PDF_MARGIN_MM * 2;
      const usableHmm = pageH - PDF_MARGIN_MM * 2;

      const pxPerMm = canvas.width / usableWmm;
      const pageHeightPx = Math.floor(usableHmm * pxPerMm);

      const domHeight =
        clone.scrollHeight || clone.getBoundingClientRect().height || 1;

      const scaleY = canvas.height / domHeight;

      const cards = Array.from(
        clone.querySelectorAll(".product-pdf")
      ) as HTMLElement[];

      const rootRect = clone.getBoundingClientRect();

      const getMarginBottom = (el: HTMLElement) => {
        const mb = window.getComputedStyle(el).marginBottom;
        const n = parseFloat(mb || "0");
        return Number.isFinite(n) ? n : 0;
      };

      const bpSet = new Set<number>();
      bpSet.add(0);
      bpSet.add(canvas.height);

      cards.forEach((card) => {
        const r = card.getBoundingClientRect();
        const bottomCss = (r.bottom - rootRect.top) + getMarginBottom(card);
        const bottomCanvas = Math.floor(bottomCss * scaleY);

        bpSet.add(Math.max(0, Math.min(canvas.height, bottomCanvas - 4)));
      });

      const breakpoints = Array.from(bpSet)
        .filter((v) => Number.isFinite(v))
        .map((v) => Math.max(0, Math.min(canvas.height, Math.floor(v))))
        .sort((a, b) => a - b);

      const pickBreak = (offset: number, limit: number) => {
        let chosen = -1;

        for (let i = 0; i < breakpoints.length; i++) {
          const v = breakpoints[i];
          if (v <= limit && v > offset) chosen = v;
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

        ctx.drawImage(
          canvas,
          0,
          offsetY,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight
        );

        const img = pageCanvas.toDataURL("image/jpeg", isIOS ? 0.82 : 0.92);
        const sliceHmm = sliceHeight / pxPerMm;

        if (pageIndex > 0) pdf.addPage();

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

        // =========================
        // LINKS DE ESTA PÁGINA
        // =========================
        const pageStartCss = offsetY / scaleY;
        const pageEndCss = endY / scaleY;
        const cssPxPerMm = rootRect.width / usableWmm;

        for (const la of linkAreasCss) {
          const visibleTopCss = Math.max(la.top, pageStartCss);
          const visibleBottomCss = Math.min(la.top + la.height, pageEndCss);

          if (visibleBottomCss <= visibleTopCss) continue;

          const xMm = PDF_MARGIN_MM + la.left / cssPxPerMm;
          const yMm =
            PDF_MARGIN_MM + (visibleTopCss - pageStartCss) / cssPxPerMm;
          const wMm = la.width / cssPxPerMm;
          const hMm = (visibleBottomCss - visibleTopCss) / cssPxPerMm;

          pdf.link(xMm, yMm, wMm, hMm, { url: la.url });
        }

        offsetY = endY;
        pageIndex++;
      }

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
