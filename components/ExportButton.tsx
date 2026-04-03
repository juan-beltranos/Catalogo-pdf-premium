import React, { useMemo, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { getImageUrl } from "@/helper/imageDB";
import { groupByCategory, slug } from "../helper/catalog";
import { Product } from "@/types";
import { normalizeWaNumber } from "@/helper/social";
import { formatCurrency } from "@/constants";

interface ExportButtonProps {
  targetRef: React.RefObject<HTMLDivElement | null>;
  fileName: string;
  products: Product[];
  businessWhatsapp: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  targetRef,
  fileName,
  products,
  businessWhatsapp,
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("__ALL__");
  const [quality, setQuality] = useState<"normal" | "alta">("normal");
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  const categories = useMemo(() => {
    const groups = groupByCategory(products);
    return groups.map(([cat]) => cat);
  }, [products]);

  const generatePdf = async (opts?: {
    category?: string;
    overrideFileName?: string;
    quality?: "normal" | "alta";
  }): Promise<{ blob: Blob; fileName: string }> => {
    if (!targetRef.current) throw new Error("targetRef is null");

    const EXPORT_WIDTH_PX = 800;
    const PDF_MARGIN_MM = 10;
    const resolvedQuality = opts?.quality ?? quality;
    const canvasScale = resolvedQuality === "alta" ? 2 : 1.5;
    const jpegQuality =
      resolvedQuality === "alta" ? (isIOS ? 0.8 : 0.88) : isIOS ? 0.6 : 0.72;

    const encodeWaText = (t: string) => encodeURIComponent(t);

    const waitFrames = (n = 2) =>
      new Array(n)
        .fill(0)
        .reduce(
          (p) =>
            p.then(
              () => new Promise<void>((r) => requestAnimationFrame(() => r())),
            ),
          Promise.resolve(),
        );

    const waitLoad = (img: HTMLImageElement) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((res) => {
          img.onload = () => res();
          img.onerror = () => res();
        });

    const getPos = (el: HTMLElement, stop: HTMLElement | null = null) => {
      let top = 0;
      let left = 0;
      let cur: HTMLElement | null = el;
      while (cur && cur !== stop) {
        top += cur.offsetTop || 0;
        left += cur.offsetLeft || 0;
        cur = cur.offsetParent as HTMLElement | null;
      }
      return { top, left, width: el.offsetWidth, height: el.offsetHeight };
    };

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-99999px";
    iframe.style.top = "0";
    iframe.style.width = `${EXPORT_WIDTH_PX}px`;
    iframe.style.height = "10px";
    iframe.style.border = "none";
    iframe.style.visibility = "hidden";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-1";
    document.body.appendChild(iframe);

    const objectUrlsToRevoke: string[] = [];

    try {
      const iDoc = iframe.contentDocument!;
      iDoc.open();
      iDoc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=${EXPORT_WIDTH_PX}">
      </head><body style="margin:0;padding:0;background:#fff;width:${EXPORT_WIDTH_PX}px"></body></html>`);
      iDoc.close();

      const styleLoadPromises: Promise<void>[] = [];
      Array.from(
        document.querySelectorAll('link[rel="stylesheet"], style'),
      ).forEach((node) => {
        const imported = iDoc.importNode(node, true);
        if ((node as HTMLLinkElement).rel === "stylesheet") {
          styleLoadPromises.push(
            new Promise<void>((res) => {
              (imported as HTMLLinkElement).onload = () => res();
              (imported as HTMLLinkElement).onerror = () => res();
            }),
          );
        }
        iDoc.head.appendChild(imported);
      });
      await Promise.all(styleLoadPromises);

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

      clone.querySelectorAll('[data-hide-on-pdf="true"]').forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });

      if (opts?.category) {
        const wanted = opts.category.trim().toLowerCase();
        (
          Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[]
        ).forEach((card) => {
          const cat = (
            (card.dataset.category || "").trim() || "Sin categoría"
          ).toLowerCase();
          if (cat !== wanted) card.remove();
        });
      }

      const productsGrid = clone.querySelector(
        ".products-grid",
      ) as HTMLElement | null;
      if (!productsGrid) throw new Error("No se encontró .products-grid");

      productsGrid.style.cssText += `
      display:grid !important;
      grid-template-columns:repeat(2,minmax(0,1fr)) !important;
      align-items:start !important;
      width:100% !important;
      box-sizing:border-box !important;
    `;

      const imgs = Array.from(
        clone.querySelectorAll("img"),
      ) as HTMLImageElement[];

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
        }),
      );

      await Promise.all(imgs.map(waitLoad));

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
            /* skip */
          }
        }),
      );

      imgs.forEach((img) => {
        img.style.width = "auto";
        img.style.height = "auto";
        img.style.maxWidth = "100%";
        img.style.maxHeight = "100%";
        img.style.objectFit = "contain";
        img.style.objectPosition = "center";
        img.style.display = "block";
        img.style.margin = "0 auto";
      });

      clone.querySelectorAll('[data-price-inline="true"]').forEach((el) => {
        const el_ = el as HTMLElement;
        el_.style.display = "flex";
        el_.style.alignItems = "center";
        el_.style.justifyContent = "center";
        el_.style.lineHeight = "1";
        el_.style.paddingTop = "0";
        el_.style.paddingBottom = "0";
        el_.style.height = "30px";
        el_.style.fontSize = "18px";
        const span = el_.querySelector("span");
        if (span) {
          span.style.display = "flex";
          span.style.alignItems = "center";
          span.style.justifyContent = "center";
          span.style.lineHeight = "1";
          span.style.margin = "0";
          span.style.padding = "0";
          span.style.paddingTop = "1px";
          span.style.height = "100%";
          span.style.position = "static";
          span.style.transform = "none";
          span.style.fontSize = "18px";
        }
      });

      clone.querySelectorAll('[data-stock-badge="true"]').forEach((el) => {
        const el_ = el as HTMLElement;
        el_.style.display = "flex";
        el_.style.alignItems = "center";
        el_.style.justifyContent = "center";
        el_.style.lineHeight = "1";
        el_.style.height = "40px";
        el_.style.paddingTop = "1px";
        el_.style.paddingBottom = "0";
        el_.style.gap = "3px";
      });

      clone.querySelectorAll('[data-category-badge="true"]').forEach((el) => {
        const el_ = el as HTMLElement;
        el_.style.display = "flex";
        el_.style.alignItems = "center";
        el_.style.justifyContent = "center";
        el_.style.lineHeight = "1";
        el_.style.paddingTop = "0";
        el_.style.paddingBottom = "0";
        el_.style.height = "28px";
        const span = el_.querySelector("span");
        if (span) {
          span.style.display = "flex";
          span.style.alignItems = "center";
          span.style.justifyContent = "center";
          span.style.lineHeight = "1";
          span.style.margin = "0";
          span.style.padding = "0";
          span.style.paddingTop = "1px";
          span.style.height = "100%";
          span.style.position = "static";
          span.style.transform = "none";
        }
      });

      clone.querySelectorAll('[data-action-hint="true"]').forEach((el) => {
        const el_ = el as HTMLElement;
        el_.style.display = "flex";
        el_.style.alignItems = "center";
        el_.style.justifyContent = "center";
        el_.style.lineHeight = "1";
        el_.style.height = "40px";
        el_.style.paddingTop = "0";
        el_.style.paddingBottom = "0";
        const innerSpan = el_.querySelector("span") as HTMLElement | null;
        if (innerSpan) {
          innerSpan.style.display = "flex";
          innerSpan.style.alignItems = "center";
          innerSpan.style.justifyContent = "center";
          innerSpan.style.gap = "5px";
          innerSpan.style.lineHeight = "1";
          innerSpan.style.margin = "0";
          innerSpan.style.padding = "0";
          innerSpan.style.position = "static";
          innerSpan.style.transform = "none";
        }
      });

      await waitFrames(4);
      if ("fonts" in iDoc) {
        try {
          await (iDoc as any).fonts.ready;
        } catch { }
      }
      if (iframe.contentWindow && "fonts" in iframe.contentWindow) {
        try {
          await (iframe.contentWindow as any).fonts.ready;
        } catch { }
      }
      await waitFrames(6);

      const fullHeight = clone.scrollHeight || clone.offsetHeight;
      iframe.style.height = `${fullHeight + 20}px`;
      await waitFrames(2);

      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const usableWmm = pageW - PDF_MARGIN_MM * 2;
      const usableHmm = pageH - PDF_MARGIN_MM * 2;

      const cssPxPerMm = EXPORT_WIDTH_PX / usableWmm;
      const pageBodyHeightCss = usableHmm * cssPxPerMm;

      const cards = Array.from(
        clone.querySelectorAll(".product-pdf"),
      ) as HTMLElement[];

      type RowInfo = {
        top: number;
        bottom: number;
        cards: HTMLElement[];
      };

      const rowsMap = new Map<number, RowInfo>();
      const ROW_TOLERANCE_PX = 6;

      cards.forEach((card) => {
        const pos = getPos(card, clone);
        const matchedKey = Array.from(rowsMap.keys()).find(
          (k) => Math.abs(k - pos.top) <= ROW_TOLERANCE_PX,
        );

        if (matchedKey !== undefined) {
          const row = rowsMap.get(matchedKey)!;
          row.top = Math.min(row.top, pos.top);
          row.bottom = Math.max(row.bottom, pos.top + pos.height);
          row.cards.push(card);
        } else {
          rowsMap.set(pos.top, {
            top: pos.top,
            bottom: pos.top + pos.height,
            cards: [card],
          });
        }
      });

      const rows = Array.from(rowsMap.values())
        .sort((a, b) => a.top - b.top)
        .map((row) => ({
          ...row,
          cards: row.cards.sort((a, b) => {
            const pa = getPos(a, clone);
            const pb = getPos(b, clone);
            return pa.left - pb.left;
          }),
        }));

      const contentWrap = productsGrid.parentElement as HTMLElement;
      if (!contentWrap) throw new Error("No se encontró el contenedor del grid");

      const rootChildren = Array.from(clone.children) as HTMLElement[];
      const contentIndex = rootChildren.indexOf(contentWrap);

      const fixedBeforeContentHeight = rootChildren
        .slice(0, contentIndex)
        .reduce((sum, el) => sum + el.offsetHeight, 0);

      const contentChromeHeight = contentWrap.offsetHeight - productsGrid.offsetHeight;

      const firstPageRowsHeightLimit =
        pageBodyHeightCss - fixedBeforeContentHeight - contentChromeHeight;

      const nextPageRowsHeightLimit = pageBodyHeightCss - contentChromeHeight;

      if (firstPageRowsHeightLimit <= 80 || nextPageRowsHeightLimit <= 80) {
        throw new Error("No hay alto suficiente para paginar el catálogo");
      }

      const pageRowGroups: RowInfo[][] = [];
      let currentPageRows: RowInfo[] = [];
      let currentLimit = firstPageRowsHeightLimit;
      let currentHeight = 0;
      let currentStartTop = 0;

      rows.forEach((row, index) => {
        const rowHeight =
          currentPageRows.length === 0
            ? row.bottom - row.top
            : row.bottom - currentStartTop;

        if (currentPageRows.length === 0) {
          currentPageRows.push(row);
          currentStartTop = row.top;
          currentHeight = row.bottom - row.top;
          return;
        }

        if (rowHeight <= currentLimit) {
          currentPageRows.push(row);
          currentHeight = row.bottom - currentStartTop;
        } else {
          pageRowGroups.push(currentPageRows);
          currentPageRows = [row];
          currentLimit = nextPageRowsHeightLimit;
          currentStartTop = row.top;
          currentHeight = row.bottom - row.top;
        }

        if (index === rows.length - 1 && currentPageRows.length) {
          // noop, se empuja fuera
        }
      });

      if (currentPageRows.length) {
        pageRowGroups.push(currentPageRows);
      }

      if (pageRowGroups.length === 0) {
        pageRowGroups.push([]);
      }

      const waFromDom =
        clone.querySelector('[data-store-whatsapp="true"]')?.textContent || "";
      const businessWa = normalizeWaNumber(businessWhatsapp || waFromDom, "57");

      type LinkArea = {
        url: string;
        left: number;
        top: number;
        width: number;
        height: number;
      };

      const renderPageToPdf = async (
        pageRoot: HTMLElement,
        pageIndex: number,
      ) => {
        iDoc.body.innerHTML = "";
        iDoc.body.appendChild(pageRoot);

        await waitFrames(3);
        if ("fonts" in iDoc) {
          try {
            await (iDoc as any).fonts.ready;
          } catch { }
        }
        await waitFrames(3);

        const pageHeight = pageRoot.scrollHeight || pageRoot.offsetHeight;
        iframe.style.height = `${pageHeight + 20}px`;
        await waitFrames(2);

        const linkAreasCss: LinkArea[] = [];

        const pushLink = (el: HTMLElement, url: string) => {
          if (!url || url === "#") return;
          const pos = getPos(el, pageRoot);
          if (pos.width <= 0 || pos.height <= 0) return;
          linkAreasCss.push({ url, ...pos });
        };

        (
          Array.from(
            pageRoot.querySelectorAll('[data-pdf-link="product"]'),
          ) as HTMLElement[]
        ).forEach((el) => {
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

        (
          Array.from(pageRoot.querySelectorAll("a[href]")) as HTMLAnchorElement[]
        ).forEach((a) => {
          const href = (a.getAttribute("href") || "").trim();
          if (!href || href === "#") return;
          if (a.matches('[data-pdf-link="product"]')) return;
          pushLink(a, href);
        });

        const iWin = iframe.contentWindow!;
        const pageCanvas = await html2canvas(pageRoot, {
          scale: canvasScale,
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
          logging: false,
          width: EXPORT_WIDTH_PX,
          windowWidth: EXPORT_WIDTH_PX,
          windowHeight: pageHeight,
          scrollX: -(iWin.scrollX ?? 0),
          scrollY: -(iWin.scrollY ?? 0),
        });

        const imgData = pageCanvas.toDataURL("image/jpeg", jpegQuality);
        const imgHeightMm = pageCanvas.height / ((EXPORT_WIDTH_PX * canvasScale) / usableWmm);

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(
          imgData,
          "JPEG",
          PDF_MARGIN_MM,
          PDF_MARGIN_MM,
          usableWmm,
          imgHeightMm,
          undefined,
          "FAST",
        );

        for (const la of linkAreasCss) {
          pdf.link(
            PDF_MARGIN_MM + la.left / cssPxPerMm,
            PDF_MARGIN_MM + la.top / cssPxPerMm,
            la.width / cssPxPerMm,
            la.height / cssPxPerMm,
            { url: la.url },
          );
        }
      };

      for (let pageIndex = 0; pageIndex < pageRowGroups.length; pageIndex++) {
        const pageClone = clone.cloneNode(true) as HTMLElement;
        pageClone.classList.add("pdf-mode");
        pageClone.style.width = `${EXPORT_WIDTH_PX}px`;
        pageClone.style.maxWidth = `${EXPORT_WIDTH_PX}px`;
        pageClone.style.margin = "0";
        pageClone.style.background = "#ffffff";
        pageClone.style.boxSizing = "border-box";
        pageClone.style.transform = "none";
        pageClone.style.minHeight = "auto";
        pageClone.style.height = "auto";
        pageClone.style.overflow = "visible";
        pageClone.style.position = "relative";

        const pageRootChildren = Array.from(pageClone.children) as HTMLElement[];
        const pageContentWrap = pageRootChildren[contentIndex] as HTMLElement;
        const pageGrid = pageClone.querySelector(".products-grid") as HTMLElement | null;

        if (!pageContentWrap || !pageGrid) {
          throw new Error("No se pudo construir la página del PDF");
        }

        if (pageIndex > 0) {
          pageRootChildren.slice(0, contentIndex).forEach((el) => el.remove());
        }

        const isLastPage = pageIndex === pageRowGroups.length - 1;

        // Quitar footer en todas menos en la última
        const footerNodes = pageRootChildren.slice(contentIndex + 1);
        if (!isLastPage) {
          footerNodes.forEach((el) => el.remove());
        }

        pageGrid.innerHTML = "";

        const rowsForPage = pageRowGroups[pageIndex] || [];
        rowsForPage.forEach((row) => {
          row.cards.forEach((card) => {
            pageGrid.appendChild(card.cloneNode(true));
          });
        });

        pageGrid.style.cssText += `
        display:grid !important;
        grid-template-columns:repeat(2,minmax(0,1fr)) !important;
        align-items:start !important;
        width:100% !important;
        box-sizing:border-box !important;
      `;

        pageClone.querySelectorAll("img").forEach((img) => {
          const im = img as HTMLImageElement;
          im.style.width = "auto";
          im.style.height = "auto";
          im.style.maxWidth = "100%";
          im.style.maxHeight = "100%";
          im.style.objectFit = "contain";
          im.style.objectPosition = "center";
          im.style.display = "block";
          im.style.margin = "0 auto";
        });

        await renderPageToPdf(pageClone, pageIndex);
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
      const { blob, fileName: outName } = await generatePdf({
        overrideFileName: fileName,
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
      const { blob, fileName: fn } = await generatePdf({ quality });
      const file = new File([blob], fn, { type: "application/pdf" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        window.open(
          `https://wa.me/?text=${encodeURIComponent("Te comparto el catálogo en PDF")}`,
          "_blank",
        );
        alert(
          "Tu navegador no permite compartir archivos directo. Se abrió WhatsApp con el mensaje.",
        );
      }
    } catch (error) {
      console.error(error);
      const msg =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : JSON.stringify(error, null, 2);
      alert(`Error compartiendo PDF:\n\n${msg}`);
    } finally {
      setLoading(false);
    }
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
            <span className="text-xs text-slate-500 font-medium">
              Calidad del PDF
            </span>
            <div className="flex rounded-lg overflow-hidden border border-black/10 text-xs font-semibold">
              <button
                onClick={() => setQuality("normal")}
                disabled={loading}
                className={`px-3 py-1.5 transition ${quality === "normal" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                Normal
              </button>
              <button
                onClick={() => setQuality("alta")}
                disabled={loading}
                className={`px-3 py-1.5 transition ${quality === "alta" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                Alta
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 px-1 -mt-1">
            {quality === "normal"
              ? "Archivo más liviano (~1–3 MB) — ideal para WhatsApp"
              : "Mayor resolución (~4–8 MB) — mejor para imprimir"}
          </p>

          <div className="flex gap-2">
            <button
              onClick={handleShareWhatsApp}
              disabled={loading}
              className="flex-1 h-12 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Preparando…" : "Compartir WhatsApp"}
            </button>
            <button
              onClick={handleDownloadPdfAll}
              disabled={loading}
              className="flex-1 h-12 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Creando…" : "PDF (Todo)"}
            </button>
          </div>

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
              className="flex-1 h-12 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Creando…" : "PDF (Categoría)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};