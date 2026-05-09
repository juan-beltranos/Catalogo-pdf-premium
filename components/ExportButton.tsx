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
  const [showShareInstructions, setShowShareInstructions] = useState(false);
  const [sharedFileName, setSharedFileName] = useState("");

  // Barra de progreso
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const categories = useMemo(() => {
    const groups = groupByCategory(products);
    return groups.map(([cat]) => cat);
  }, [products]);

  const resetProgressLater = () => {
    setTimeout(() => {
      setLoading(false);
      setProgress(0);
      setProgressText("");
    }, 700);
  };

  const generatePdf = async (opts?: {
    category?: string;
    overrideFileName?: string;
    quality?: "normal" | "alta";
  }): Promise<{ blob: Blob; fileName: string }> => {
    if (!targetRef.current) throw new Error("targetRef is null");

    const updateProgress = (value: number, text: string) => {
      setProgress(Math.min(100, Math.max(0, Math.round(value))));
      setProgressText(text);
    };

    updateProgress(3, "Preparando catálogo...");

    /**
     * Fix Safari/iPhone:
     * 1200px + scale alto puede bloquear html2canvas en iOS.
     */
    const EXPORT_WIDTH_PX = isIOS ? 850 : 1200;
    const PDF_MARGIN_MM = 10;

    const resolvedQuality = opts?.quality ?? quality;

    const canvasScale = isIOS
      ? 1
      : resolvedQuality === "alta"
        ? 1.6
        : 1.25;

    const jpegQuality = isIOS
      ? 0.55
      : resolvedQuality === "alta"
        ? 0.86
        : 0.7;

    const encodeWaText = (t: string) => encodeURIComponent(t);

    const waitFrames = (n = 2) =>
      new Array(n).fill(0).reduce(
        (p) =>
          p.then(
            () => new Promise<void>((r) => requestAnimationFrame(() => r())),
          ),
        Promise.resolve(),
      );

    const waitMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    const withTimeout = <T,>(
      promise: Promise<T>,
      ms: number,
      message: string,
    ) => {
      return Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(message)), ms);
        }),
      ]);
    };

    const waitLoad = (img: HTMLImageElement, timeoutMs = 12000) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();

      return new Promise<void>((res) => {
        let settled = false;

        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          res();
        };

        const timer = setTimeout(done, timeoutMs);
        img.onload = done;
        img.onerror = done;
      });
    };

    const getPos = (el: HTMLElement, stop: HTMLElement) => {
      let top = 0;
      let left = 0;
      let cur: HTMLElement | null = el;

      while (cur && cur !== stop) {
        top += cur.offsetTop || 0;
        left += cur.offsetLeft || 0;
        cur = cur.offsetParent as HTMLElement | null;
      }

      return {
        top,
        left,
        width: el.offsetWidth,
        height: el.offsetHeight,
      };
    };

    const blobToDataUrl = (blob: Blob) =>
      new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = () => rej(reader.error);
        reader.readAsDataURL(blob);
      });

    const safeFetchBlob = async (src: string, timeoutMs = 12000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const resp = await fetch(src, {
          mode: "cors",
          signal: controller.signal,
        });

        if (!resp.ok) {
          throw new Error(`No se pudo cargar imagen: ${resp.status}`);
        }

        return await resp.blob();
      } finally {
        clearTimeout(timer);
      }
    };

    const container = document.createElement("div");

    /**
     * Fix Safari/iPhone:
     * Evitar left:-99999px porque en Safari puede congelar el render.
     */
    container.style.position = "fixed";
    container.style.left = "0";
    container.style.top = "0";
    container.style.transform = "translateX(-120vw)";
    container.style.width = `${EXPORT_WIDTH_PX}px`;
    container.style.zIndex = "-9999";
    container.style.pointerEvents = "none";
    container.style.background = "#ffffff";
    container.style.overflow = "visible";

    document.body.appendChild(container);

    const objectUrlsToRevoke: string[] = [];

    try {
      updateProgress(6, "Duplicando vista del catálogo...");

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
      clone.style.visibility = "visible";
      clone.style.opacity = "1";

      container.appendChild(clone);

      clone.querySelectorAll('[data-hide-on-pdf="true"]').forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });

      if (opts?.category) {
        updateProgress(9, "Filtrando categoría seleccionada...");

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

      updateProgress(12, "Organizando productos...");

      const productsGrid = clone.querySelector(
        ".products-grid",
      ) as HTMLElement | null;

      if (productsGrid) {
        productsGrid.style.cssText += `
        display:grid !important;
        grid-template-columns:repeat(2,minmax(0,1fr)) !important;
        column-gap:24px !important;
        row-gap:32px !important;
        align-items:start !important;
        width:100% !important;
        box-sizing:border-box !important;
      `;
      }

      (
        Array.from(clone.querySelectorAll(".product-media")) as HTMLElement[]
      ).forEach((media) => {
        media.style.aspectRatio = "unset";
        media.style.height = isIOS ? "380px" : "500px";
        media.style.minHeight = isIOS ? "380px" : "500px";
        media.style.maxHeight = isIOS ? "380px" : "500px";
      });

      (
        Array.from(clone.querySelectorAll(".product-pdf h3")) as HTMLElement[]
      ).forEach((el) => {
        el.style.fontSize = isIOS ? "24px" : "28px";
        el.style.lineHeight = "1.2";
      });

      (
        Array.from(
          clone.querySelectorAll(".product-pdf .catalog-html"),
        ) as HTMLElement[]
      ).forEach((el) => {
        el.style.fontSize = isIOS ? "16px" : "18px";
        el.style.lineHeight = "1.6";
      });

      const imgs = Array.from(
        clone.querySelectorAll("img"),
      ) as HTMLImageElement[];

      updateProgress(18, "Preparando imágenes...");

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

              if (url.startsWith("blob:")) {
                objectUrlsToRevoke.push(url);
              }
            }
          }
        }),
      );

      updateProgress(25, "Cargando imágenes del catálogo...");

      await Promise.all(imgs.map((img) => waitLoad(img)));

      updateProgress(35, "Validando imágenes...");

      const failedImgs = imgs.filter((img) => img.naturalWidth === 0);
      const BATCH_SIZE = isIOS ? 4 : 8;

      for (let i = 0; i < failedImgs.length; i += BATCH_SIZE) {
        const batch = failedImgs.slice(i, i + BATCH_SIZE);

        const currentProgress =
          35 +
          Math.min(
            8,
            ((i + batch.length) / Math.max(1, failedImgs.length)) * 8,
          );

        updateProgress(currentProgress, "Reintentando imágenes pendientes...");

        await Promise.all(
          batch.map(async (img) => {
            const src = img.getAttribute("src") || "";

            if (!src || src.startsWith("data:") || src.startsWith("blob:")) {
              return;
            }

            try {
              const blob = await safeFetchBlob(src, isIOS ? 8000 : 12000);
              const objUrl = URL.createObjectURL(blob);
              objectUrlsToRevoke.push(objUrl);
              img.crossOrigin = "anonymous";
              img.src = objUrl;
              await waitLoad(img, isIOS ? 8000 : 12000);
            } catch {
              // No bloquear PDF por una imagen fallida
            }
          }),
        );
      }

      updateProgress(45, "Procesando imágenes para PDF...");

      /**
       * Fix Safari/iPhone:
       * En iOS NO convertimos todas las imágenes a dataURL porque puede consumir
       * demasiada memoria y dejar html2canvas congelado en página 1.
       */
      if (!isIOS) {
        const CONVERT_BATCH = 8;

        for (let i = 0; i < imgs.length; i += CONVERT_BATCH) {
          const batch = imgs.slice(i, i + CONVERT_BATCH);

          const currentProgress =
            45 +
            Math.min(15, ((i + batch.length) / Math.max(1, imgs.length)) * 15);

          updateProgress(currentProgress, "Optimizando imágenes...");

          await Promise.all(
            batch.map(async (img) => {
              const src = img.getAttribute("src") || "";

              if (!src || src.startsWith("data:")) return;

              try {
                let blob: Blob;

                if (src.startsWith("blob:")) {
                  const resp = await fetch(src);
                  blob = await resp.blob();
                } else {
                  blob = await safeFetchBlob(src, 10000);
                }

                const dataUrl = await blobToDataUrl(blob);
                img.src = dataUrl;
                await waitLoad(img, 5000);
              } catch {
                // Mantener src original si falla la conversión
              }
            }),
          );
        }
      } else {
        updateProgress(58, "Optimizando para Safari...");
        await waitFrames(4);
      }

      updateProgress(60, "Ajustando diseño del PDF...");

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

      (
        Array.from(clone.querySelectorAll(".product-media")) as HTMLElement[]
      ).forEach((media) => {
        media.style.aspectRatio = "4 / 3.5";
        media.style.height = "auto";
        media.style.minHeight = isIOS ? "210px" : "230px";
        media.style.maxHeight = isIOS ? "240px" : "280px";
        media.style.overflow = "hidden";
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

        const span = el_.querySelector("span") as HTMLElement | null;

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

        const span = el_.querySelector("span") as HTMLElement | null;

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

      updateProgress(65, "Esperando fuentes y estilos...");

      await waitFrames(10);

      if ("fonts" in document) {
        try {
          await (document as any).fonts.ready;
        } catch {
          // Ignorar si falla fonts.ready
        }
      }

      if (imgs.length > 30) {
        await waitMs(Math.min(isIOS ? 1500 : 2500, imgs.length * 10));
      }

      await waitFrames(8);

      void clone.offsetHeight;
      void clone.getBoundingClientRect();

      await waitFrames(4);

      const fullHeight = clone.scrollHeight || clone.offsetHeight;
      container.style.height = `${fullHeight + 20}px`;

      await waitFrames(4);

      updateProgress(70, "Preparando links clickeables...");

      type LinkArea = {
        url: string;
        left: number;
        top: number;
        width: number;
        height: number;
      };

      const waFromDom =
        clone.querySelector('[data-store-whatsapp="true"]')?.textContent || "";

      const businessWa = normalizeWaNumber(businessWhatsapp || waFromDom, "57");

      updateProgress(73, "Creando documento PDF...");

      const pdf = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
      });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const usableWmm = pageW - PDF_MARGIN_MM * 2;
      const usableHmm = pageH - PDF_MARGIN_MM * 2;

      const cssPxPerMm = EXPORT_WIDTH_PX / usableWmm;
      const pageHeightCssPx = Math.floor(usableHmm * cssPxPerMm) - 28;

      const cards = Array.from(
        clone.querySelectorAll(".product-pdf"),
      ) as HTMLElement[];

      type ProductRow = {
        top: number;
        cards: HTMLElement[];
      };

      const ROW_TOLERANCE_PX = 40;
      const rows: ProductRow[] = [];

      cards.forEach((card) => {
        const pos = getPos(card, clone);
        const cardTop = Math.floor(pos.top);

        const existingRow = rows.find(
          (row) => Math.abs(row.top - cardTop) <= ROW_TOLERANCE_PX,
        );

        if (existingRow) {
          existingRow.cards.push(card);
          existingRow.top = Math.min(existingRow.top, cardTop);
        } else {
          rows.push({
            top: cardTop,
            cards: [card],
          });
        }
      });

      rows.sort((a, b) => a.top - b.top);

      const styleProductCardForPdf = (card: HTMLElement) => {
        card.style.breakInside = "avoid";
        card.style.pageBreakInside = "avoid";
        card.style.webkitColumnBreakInside = "avoid";

        const media = card.querySelector(".product-media") as HTMLElement | null;

        if (media) {
          media.style.aspectRatio = "4 / 3.5";
          media.style.height = "auto";
          media.style.minHeight = isIOS ? "210px" : "230px";
          media.style.maxHeight = isIOS ? "240px" : "280px";
          media.style.overflow = "hidden";
          media.style.display = "flex";
          media.style.alignItems = "center";
          media.style.justifyContent = "center";
        }

        const img = card.querySelector("img") as HTMLImageElement | null;

        if (img) {
          img.style.width = "auto";
          img.style.height = "auto";
          img.style.maxWidth = "100%";
          img.style.maxHeight = "100%";
          img.style.objectFit = "contain";
          img.style.objectPosition = "center";
          img.style.display = "block";
          img.style.margin = "0 auto";
        }
      };

      const controlHeaderFooter = (
        page: HTMLElement,
        includeHeader: boolean,
        includeFooter: boolean,
      ) => {
        const pageGrid = page.querySelector(".products-grid") as HTMLElement | null;

        page
          .querySelectorAll(
            '[data-pdf-header="true"], .catalog-header, .pdf-header, header',
          )
          .forEach((el) => {
            (el as HTMLElement).style.display = includeHeader ? "" : "none";
          });

        page
          .querySelectorAll(
            '[data-pdf-footer="true"], .catalog-footer, .pdf-footer, footer',
          )
          .forEach((el) => {
            (el as HTMLElement).style.display = includeFooter ? "" : "none";
          });

        if (pageGrid) {
          let current: HTMLElement | null = pageGrid;

          while (current && current !== page) {
            const parent = current.parentElement as HTMLElement | null;

            if (!parent) break;

            const siblings = Array.from(parent.children) as HTMLElement[];
            const currentIndex = siblings.indexOf(current);

            siblings.forEach((sibling, index) => {
              if (index < currentIndex && !includeHeader) {
                sibling.style.display = "none";
              }

              if (index > currentIndex && !includeFooter) {
                sibling.style.display = "none";
              }
            });

            current = parent;
          }
        }
      };

      const makePage = (includeHeader: boolean) => {
        const page = clone.cloneNode(true) as HTMLElement;

        /**
         * Fix Safari/iPhone:
         * No usar left:-99999px.
         */
        page.style.position = "fixed";
        page.style.left = "0";
        page.style.top = "0";
        page.style.transform = "translateX(-120vw)";
        page.style.width = `${EXPORT_WIDTH_PX}px`;
        page.style.maxWidth = `${EXPORT_WIDTH_PX}px`;
        page.style.background = "#ffffff";
        page.style.boxSizing = "border-box";
        page.style.margin = "0";
        page.style.visibility = "visible";
        page.style.opacity = "1";
        page.style.overflow = "visible";
        page.style.zIndex = "-9999";
        page.style.pointerEvents = "none";

        page.querySelectorAll('[data-hide-on-pdf="true"]').forEach((el) => {
          (el as HTMLElement).style.display = "none";
        });

        const pageGrid = page.querySelector(
          ".products-grid",
        ) as HTMLElement | null;

        if (!pageGrid) {
          document.body.appendChild(page);

          return {
            page,
            grid: page,
          };
        }

        pageGrid.querySelectorAll(".product-pdf").forEach((el) => el.remove());

        pageGrid.style.cssText += `
        display:grid !important;
        grid-template-columns:repeat(2,minmax(0,1fr)) !important;
        column-gap:24px !important;
        row-gap:32px !important;
        align-items:start !important;
        width:100% !important;
        box-sizing:border-box !important;
        background:#ffffff !important;
      `;

        controlHeaderFooter(page, includeHeader, false);

        document.body.appendChild(page);

        return {
          page,
          grid: pageGrid,
        };
      };

      const renderDomPageCanvas = async (pageEl: HTMLElement) => {
        await waitFrames(2);

        return await withTimeout(
          html2canvas(pageEl, {
            scale: canvasScale,
            useCORS: true,

            /**
             * Fix Safari/iPhone:
             * allowTaint true puede causar problemas al exportar el canvas.
             */
            allowTaint: false,

            backgroundColor: "#ffffff",
            logging: false,
            width: EXPORT_WIDTH_PX,
            windowWidth: EXPORT_WIDTH_PX,
            scrollX: 0,
            scrollY: 0,
            removeContainer: true,
            imageTimeout: isIOS ? 10000 : 15000,
            onclone: (_clonedDoc, clonedEl) => {
              clonedEl.style.visibility = "visible";
              clonedEl.style.opacity = "1";
              clonedEl.style.background = "#ffffff";

              Array.from(clonedEl.querySelectorAll("*")).forEach((el) => {
                const htmlEl = el as HTMLElement;

                if (!htmlEl.style) return;

                if (htmlEl.style.visibility === "hidden") {
                  htmlEl.style.visibility = "visible";
                }

                if (htmlEl.style.opacity === "0") {
                  htmlEl.style.opacity = "1";
                }

                htmlEl.style.animation = "none";
                htmlEl.style.transition = "none";
              });
            },
          }),
          isIOS ? 30000 : 60000,
          "Safari tardó demasiado renderizando la página del PDF.",
        );
      };

      const collectPageLinks = (page: HTMLElement): LinkArea[] => {
        const pageLinks: LinkArea[] = [];

        const pushPageLink = (el: HTMLElement, url: string) => {
          if (!url || url === "#") return;

          const pos = getPos(el, page);

          if (pos.width <= 0 || pos.height <= 0) return;

          pageLinks.push({
            url,
            ...pos,
          });
        };

        (
          Array.from(
            page.querySelectorAll('[data-pdf-link="product"]'),
          ) as HTMLElement[]
        ).forEach((el) => {
          const name = (el.dataset.productName || "").trim();
          const price = (el.dataset.productPrice || "").trim();

          if (!name) return;

          let url = (el as HTMLAnchorElement).getAttribute?.("href") || "";

          if (businessWa) {
            const msg = `Hola 👋, quiero hacer un pedido:\n• Producto: ${name}\n• Precio: ${formatCurrency(
              Number(price || 0),
            )}`;

            url = `https://api.whatsapp.com/send?phone=${businessWa}&text=${encodeWaText(
              msg,
            )}`;
          }

          pushPageLink(el, url);
        });

        (
          Array.from(page.querySelectorAll("a[href]")) as HTMLAnchorElement[]
        ).forEach((a) => {
          const href = (a.getAttribute("href") || "").trim();

          if (!href || href === "#") return;
          if (a.matches('[data-pdf-link="product"]')) return;

          pushPageLink(a, href);
        });

        return pageLinks;
      };

      let pageIndex = 0;
      let rowIndex = 0;
      const totalPagesEstimate = Math.max(1, Math.ceil(rows.length / 3));

      updateProgress(75, `Renderizando página 1 de ${totalPagesEstimate}...`);

      while (rowIndex < rows.length) {
        const { page, grid } = makePage(pageIndex === 0);

        let rowsAdded = 0;

        while (rowIndex < rows.length) {
          const currentRow = rows[rowIndex];

          const rowClones: HTMLElement[] = currentRow.cards.map((card) => {
            const clonedCard = card.cloneNode(true) as HTMLElement;
            styleProductCardForPdf(clonedCard);
            return clonedCard;
          });

          rowClones.forEach((clonedCard) => grid.appendChild(clonedCard));

          await waitFrames(1);

          const currentHeight = page.scrollHeight || page.offsetHeight;

          if (currentHeight > pageHeightCssPx && rowsAdded > 0) {
            rowClones.forEach((clonedCard) => clonedCard.remove());
            break;
          }

          rowsAdded++;
          rowIndex++;
        }

        const isLastPage = rowIndex >= rows.length;

        controlHeaderFooter(page, pageIndex === 0, isLastPage);

        await waitFrames(2);

        updateProgress(
          75 + (pageIndex / Math.max(1, totalPagesEstimate)) * 20,
          `Renderizando página ${pageIndex + 1}...`,
        );

        const pageCanvas = await renderDomPageCanvas(page);

        const imgData = pageCanvas.toDataURL("image/jpeg", jpegQuality);
        const pageHmm = Math.min(
          usableHmm,
          pageCanvas.height / canvasScale / cssPxPerMm,
        );

        if (pageIndex > 0) {
          pdf.addPage();
        }

        pdf.addImage(
          imgData,
          "JPEG",
          PDF_MARGIN_MM,
          PDF_MARGIN_MM,
          usableWmm,
          pageHmm,
          undefined,
          "FAST",
        );

        const pageLinkAreas = collectPageLinks(page);

        for (const la of pageLinkAreas) {
          pdf.link(
            PDF_MARGIN_MM + la.left / cssPxPerMm,
            PDF_MARGIN_MM + la.top / cssPxPerMm,
            la.width / cssPxPerMm,
            la.height / cssPxPerMm,
            { url: la.url },
          );
        }

        pageCanvas.width = 1;
        pageCanvas.height = 1;

        page.remove();

        pageIndex++;

        updateProgress(
          75 + (pageIndex / Math.max(1, totalPagesEstimate)) * 20,
          `Página ${pageIndex} lista...`,
        );

        await waitFrames(1);
      }

      updateProgress(97, "Finalizando archivo...");

      const safeFileName =
        (opts?.overrideFileName || fileName)
          .replace(/[^\w\s-]/gi, "")
          .replace(/\s+/g, "-")
          .toLowerCase() || "catalogo";

      updateProgress(99, "Preparando descarga...");

      return {
        blob: pdf.output("blob"),
        fileName: `${safeFileName}.pdf`,
      };
    } finally {
      objectUrlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
      container.remove();
    }
  };

  const downloadBlob = (blob: Blob, outName: string) => {
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = outName;
    a.rel = "noopener";

    if (isIOS) {
      a.target = "_blank";
    }

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  };

  const handleDownloadPdfAll = async () => {
    try {
      setLoading(true);
      setProgress(1);
      setProgressText("Iniciando exportación...");

      const { blob, fileName: outName } = await generatePdf({
        overrideFileName: fileName,
        quality,
      });

      setProgress(100);
      setProgressText("Descargando PDF...");

      downloadBlob(blob, outName);
    } catch (error) {
      console.error(error);
      alert("Error generando/descargando PDF.");
    } finally {
      resetProgressLater();
    }
  };

  const handleDownloadPdfSelectedCategory = async () => {
    if (selectedCategory === "__ALL__") return;

    try {
      setLoading(true);
      setProgress(1);
      setProgressText("Iniciando exportación por categoría...");

      const outBase = `${fileName}-${slug(selectedCategory)}`;

      const { blob, fileName: outName } = await generatePdf({
        category: selectedCategory,
        overrideFileName: outBase,
        quality,
      });

      setProgress(100);
      setProgressText("Descargando PDF...");

      downloadBlob(blob, outName);
    } catch (error) {
      console.error(error);
      alert("Error generando/descargando PDF por categoría.");
    } finally {
      resetProgressLater();
    }
  };

  const handleShareWhatsApp = async () => {
    try {
      setLoading(true);
      setProgress(1);
      setProgressText("Preparando PDF para compartir...");

      const { blob, fileName: fn } = await generatePdf({ quality });

      setSharedFileName(fn);
      setProgress(100);
      setProgressText("PDF listo para compartir...");

      if (isMobile) {
        const file = new File([blob], fn, {
          type: "application/pdf",
        });

        const canShareFile =
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [file] });

        if (canShareFile) {
          try {
            await navigator.share({
              title: "Catálogo PDF",
              text: "Te comparto el catálogo en PDF 📄",
              files: [file],
            });

            return;
          } catch (shareErr: any) {
            if (shareErr?.name === "AbortError") return;

            console.warn("share() falló, usando fallback:", shareErr);
          }
        }
      }

      setProgressText("Descargando PDF...");
      downloadBlob(blob, fn);
      setShowShareInstructions(true);
    } catch (error) {
      console.error(error);
      alert("Error generando el PDF. Por favor intenta de nuevo.");
    } finally {
      resetProgressLater();
    }
  };

  return (
    <>
      {/* Overlay de progreso */}
      {loading && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4">
              <p className="text-base font-bold text-slate-800">
                Generando catálogo PDF
              </p>

              <p className="mt-1 text-sm text-slate-500">
                {progressText || "Preparando archivo..."}
              </p>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                No cierres esta ventana
              </span>

              <span className="text-sm font-semibold text-slate-700">
                {progress}%
              </span>
            </div>
          </div>
        </div>
      )}

      {showShareInstructions && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 px-4 pb-8"
          onClick={() => setShowShareInstructions(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-xl">
                ✅
              </div>

              <div>
                <p className="font-bold text-slate-800 text-base leading-tight">
                  ¡PDF listo y descargado!
                </p>

                <p className="text-xs text-slate-400">{sharedFileName}</p>
              </div>
            </div>

            <p className="text-sm text-slate-500 mb-4">
              Sigue estos pasos para enviarlo por WhatsApp:
            </p>

            <ol className="space-y-3 mb-5">
              {[
                { n: "1", text: "Abre WhatsApp en tu dispositivo" },
                {
                  n: "2",
                  text: "Elige el contacto o grupo al que quieres enviar",
                },
                {
                  n: "3",
                  text: (
                    <>
                      Toca el ícono de clip{" "}
                      <span className="font-semibold">📎</span> y selecciona{" "}
                      <span className="font-semibold">Documento</span>
                    </>
                  ),
                },
                {
                  n: "4",
                  text: (
                    <>
                      Busca el archivo{" "}
                      <span className="font-semibold text-slate-700">
                        "{sharedFileName}"
                      </span>{" "}
                      en tu carpeta de Descargas
                    </>
                  ),
                },
              ].map(({ n, text }) => (
                <li key={n} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {n}
                  </span>

                  <span className="text-sm text-slate-700">{text}</span>
                </li>
              ))}
            </ol>

            <button
              onClick={() => {
                setShowShareInstructions(false);
                window.open(
                  isMobile ? "whatsapp://" : "https://web.whatsapp.com",
                  "_blank",
                );
              }}
              className="w-full h-12 rounded-xl font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] transition mb-2"
            >
              Abrir WhatsApp →
            </button>

            <button
              onClick={() => setShowShareInstructions(false)}
              className="w-full h-10 rounded-xl text-sm text-slate-400 hover:text-slate-600 transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div
        data-hide-on-pdf="true"
        className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3"
      >
        <div className="mx-auto max-w-md rounded-2xl border border-black/10 bg-white/85 backdrop-blur shadow-lg p-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-slate-500 font-medium">
                Calidad del PDF
              </span>

              <div className="flex rounded-lg overflow-hidden border border-black/10 text-xs font-semibold">
                <button
                  onClick={() => setQuality("normal")}
                  disabled={loading}
                  className={`px-3 py-1.5 transition ${quality === "normal"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                >
                  Normal
                </button>

                <button
                  onClick={() => setQuality("alta")}
                  disabled={loading}
                  className={`px-3 py-1.5 transition ${quality === "alta"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                >
                  Alta
                </button>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 px-1 -mt-1">
              {quality === "normal"
                ? "Archivo más liviano — ideal para WhatsApp"
                : "Mayor resolución — mejor para imprimir"}
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
    </>
  );
};