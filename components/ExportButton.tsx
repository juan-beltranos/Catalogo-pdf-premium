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

    // Always export at desktop width for consistent output on all devices
    const EXPORT_WIDTH_PX = 794;
    const PDF_MARGIN_MM = 10;

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const resolvedQuality = opts?.quality ?? quality;

    // Scale: 1.5 = normal (smaller file), 2 = alta calidad (larger file)
    const canvasScale = resolvedQuality === 'alta' ? 2 : 1.5;
    // JPEG quality: lower = smaller file
    const jpegQuality = resolvedQuality === 'alta' ? (isIOS ? 0.80 : 0.88) : (isIOS ? 0.60 : 0.72);

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
    // Always use desktop width for consistent rendering
    printRoot.style.width = `${EXPORT_WIDTH_PX}px`;
    printRoot.style.background = "#ffffff";
    printRoot.style.zIndex = "-1";
    printRoot.style.overflow = "visible";
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
      // Ensure overflow is visible so content is not clipped
      clone.style.overflow = "visible";

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
      // GRID LAYOUT — always 2 columns for consistent PDF output
      // =========================
      const productsGrid = clone.querySelector(".products-grid") as HTMLElement | null;

      if (productsGrid) {
        productsGrid.style.display = "grid";
        productsGrid.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
        productsGrid.style.columnGap = "18px";
        productsGrid.style.rowGap = "24px";
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

      // Extra wait to ensure layout is fully computed
      await waitTwoFrames();
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

      // getBoundingClientRect works correctly even with fixed/off-screen containers.
      // We subtract the clone's own rect to get coordinates relative to the clone's top-left.
      const cloneRect = clone.getBoundingClientRect();

      const getOffsetRelativeTo = (el: HTMLElement): { top: number; left: number; width: number; height: number } => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top - cloneRect.top,
          left: r.left - cloneRect.left,
          width: r.width,
          height: r.height,
        };
      };

      const pushLinkArea = (el: HTMLElement, url: string) => {
        if (!url) return;
        const pos = getOffsetRelativeTo(el);
        if (pos.width <= 0 || pos.height <= 0) return;
        linkAreasCss.push({
          url,
          left: pos.left,
          top: pos.top,
          width: pos.width,
          height: pos.height,
        });
      };

      // 1) Tarjetas producto => WhatsApp (use href already set on the cloned <a> tag)
      const waFromDom =
        clone.querySelector('[data-store-whatsapp="true"]')?.textContent || "";

      const businessWa = normalizeWaNumber(businessWhatsapp || waFromDom, "57");

      const productTargets = Array.from(
        clone.querySelectorAll('[data-pdf-link="product"]')
      ) as HTMLElement[];

      for (const el of productTargets) {
        const name = (el.dataset.productName || "").trim();
        const price = (el.dataset.productPrice || "").trim();

        if (!name) continue;

        // Build WA link — prefer businessWa if available, otherwise fall back to href on the element
        let url = (el as HTMLAnchorElement).getAttribute?.("href") || "";
        if (businessWa) {
          const msg =
            `Hola 👋, quiero hacer un pedido:\n` +
            `• Producto: ${name}\n` +
            `• Precio: ${formatCurrency(Number(price || 0))}`;
          url = `https://api.whatsapp.com/send?phone=${businessWa}&text=${encodeWaText(msg)}`;
        }

        if (url && url !== "#") pushLinkArea(el, url);
      }

      // 2) Links normales => redes / web / etc.
      const anchors = Array.from(
        clone.querySelectorAll("a[href]")
      ) as HTMLAnchorElement[];

      for (const a of anchors) {
        const href = (a.getAttribute("href") || "").trim();
        if (!href || href === "#") continue;
        if (a.matches('[data-pdf-link="product"]')) continue;
        pushLinkArea(a, href);
      }

      // =========================
      // CAPTURA COMPLETA
      // =========================
      const canvas = await html2canvas(clone, {
        scale: canvasScale,
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
      // PDF — Smart page breaks based on offsetTop of cards
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

      // px per mm based on canvas and export width
      const pxPerMm = (EXPORT_WIDTH_PX * canvasScale) / usableWmm;
      const pageHeightPx = Math.floor(usableHmm * pxPerMm);

      // Total DOM height of the clone (before canvas scaling)
      const domTotalHeight = clone.scrollHeight || clone.offsetHeight || 1;

      // Scale factor: canvas px per DOM px
      const scaleY = canvas.height / domTotalHeight;

      // Build breakpoints using offsetTop relative to clone (reliable in off-screen containers)
      const cards = Array.from(
        clone.querySelectorAll(".product-pdf")
      ) as HTMLElement[];

      const bpSet = new Set<number>();
      bpSet.add(0);
      bpSet.add(canvas.height);

      cards.forEach((card) => {
        // Get the card's bottom edge in DOM pixels relative to clone
        const pos = getOffsetRelativeTo(card);
        const cardBottomDomPx = pos.top + pos.height;

        // Convert to canvas pixels, add small buffer so breakpoint is just after the card
        const cardBottomCanvasPx = Math.floor(cardBottomDomPx * scaleY);

        // Add a small padding (8px in canvas space) after card bottom as breakpoint
        const bp = Math.max(0, Math.min(canvas.height, cardBottomCanvasPx + 8));
        bpSet.add(bp);
      });

      const breakpoints = Array.from(bpSet)
        .filter((v) => Number.isFinite(v))
        .map((v) => Math.max(0, Math.min(canvas.height, Math.floor(v))))
        .sort((a, b) => a - b);

      // Find the best breakpoint that fits within the page height
      // Prefer a breakpoint just after a card bottom
      const pickBreak = (offsetY: number, limit: number): number => {
        let chosen = -1;
        for (const v of breakpoints) {
          if (v <= limit && v > offsetY) chosen = v;
          if (v > limit) break;
        }
        return chosen;
      };

      let offsetY = 0;
      let pageIndex = 0;

      // CSS px per mm for link coordinate mapping (based on clone's actual rendered width)
      const cssPxPerMm = EXPORT_WIDTH_PX / usableWmm;

      while (offsetY < canvas.height) {
        const idealEnd = offsetY + pageHeightPx;
        let endY = pickBreak(offsetY, idealEnd);

        // If no card breakpoint fits, try to break before any card that straddles the page boundary
        if (endY === -1) {
          // Find if there's a card that starts before idealEnd but ends after it (would be cut)
          // In that case, break before that card starts
          let earliestCutCard = -1;
          for (const card of cards) {
            const pos = getOffsetRelativeTo(card);
            const cardTopCanvasPx = Math.floor(pos.top * scaleY);
            const cardBottomCanvasPx = Math.floor((pos.top + pos.height) * scaleY);

            // Card straddles the page boundary
            if (cardTopCanvasPx < idealEnd && cardBottomCanvasPx > idealEnd) {
              // Break just before this card starts
              const breakBefore = Math.max(offsetY + 1, cardTopCanvasPx - 4);
              if (breakBefore > offsetY && (earliestCutCard === -1 || breakBefore < earliestCutCard)) {
                earliestCutCard = breakBefore;
              }
            }
          }

          if (earliestCutCard !== -1) {
            endY = earliestCutCard;
          } else {
            endY = Math.min(idealEnd, canvas.height);
          }
        }

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

        const img = pageCanvas.toDataURL("image/jpeg", jpegQuality);
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
        // Convert canvas px offsets back to DOM px for link positioning
        const pageStartDomPx = offsetY / scaleY;
        const pageEndDomPx = endY / scaleY;

        for (const la of linkAreasCss) {
          const visibleTopDomPx = Math.max(la.top, pageStartDomPx);
          const visibleBottomDomPx = Math.min(la.top + la.height, pageEndDomPx);

          if (visibleBottomDomPx <= visibleTopDomPx) continue;

          const xMm = PDF_MARGIN_MM + la.left / cssPxPerMm;
          const yMm = PDF_MARGIN_MM + (visibleTopDomPx - pageStartDomPx) / cssPxPerMm;
          const wMm = la.width / cssPxPerMm;
          const hMm = (visibleBottomDomPx - visibleTopDomPx) / cssPxPerMm;

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
      const { blob, fileName: outName } = await generatePdf({ overrideFileName: fileName, quality });

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
        quality,
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
      const { blob, fileName } = await generatePdf({ quality });

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
          {/* Quality toggle */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-slate-500 font-medium">Calidad del PDF</span>
            <div className="flex rounded-lg overflow-hidden border border-black/10 text-xs font-semibold">
              <button
                onClick={() => setQuality('normal')}
                disabled={loading}
                className={`px-3 py-1.5 transition ${quality === 'normal'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
              >
                Normal
              </button>
              <button
                onClick={() => setQuality('alta')}
                disabled={loading}
                className={`px-3 py-1.5 transition ${quality === 'alta'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
              >
                Alta
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 px-1 -mt-1">
            {quality === 'normal'
              ? 'Archivo más liviano (~1–3 MB) — ideal para WhatsApp'
              : 'Mayor resolución (~4–8 MB) — mejor para imprimir'}
          </p>
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
        </div>
      </div>
    </div>
  );

};
