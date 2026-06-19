import React, { useMemo, useState } from "react";
import html2canvas from "html2canvas";
import domtoimage from "dom-to-image-more";
import { jsPDF } from "jspdf";
import { getImageBlob, getImageUrl } from "@/helper/imageDB";
import { groupByCategory, slug } from "../helper/catalog";
import { Product, StoreInfo } from "@/types";
import { normalizeWaNumber } from "@/helper/social";
import { formatCurrency } from "@/constants";

interface ExportButtonProps {
  targetRef: React.RefObject<HTMLDivElement | null>;
  fileName: string;
  products: Product[];
  businessWhatsapp: string;
  pdfProductsPerPage?: number;
  coverImage?: StoreInfo["coverImage"];
  showWatermarkInPdf?: boolean;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  targetRef,
  fileName,
  products,
  businessWhatsapp,
  pdfProductsPerPage = 4,
  coverImage,
  showWatermarkInPdf = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("__ALL__");
  const [quality, setQuality] = useState<"normal" | "alta">("normal");
  const [showShareInstructions, setShowShareInstructions] = useState(false);
  const [sharedFileName, setSharedFileName] = useState("");

  const [showNativeShareReady, setShowNativeShareReady] = useState(false);
  const [pendingShareFile, setPendingShareFile] = useState<File | null>(null);
  const [pendingShareTitle, setPendingShareTitle] = useState("Catálogo");
  const [pendingShareText, setPendingShareText] = useState(
    "Te comparto el catálogo en PDF",
  );

  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");

  const isIOS =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isMobile = isAndroid || isIOS;

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

    // Ajuste de tamaño PDF:
    // Antes estaba en 1200px y se comprimía demasiado al meterlo en A4.
    // 980px mantiene buena calidad, pero hace imágenes y textos ~20% más visibles.
    const EXPORT_WIDTH_PX = 980;
    const PDF_MARGIN_MM = 8;

    const PDF_PRODUCTS_PER_PAGE = Math.min(
      12,
      Math.max(1, Math.round(Number(pdfProductsPerPage) || 4)),
    );

    const getPdfGridColumns = (productsPerPage: number) => {
      // Grid fijo para PDF, independiente del breakpoint del celular/tablet.
      // Se escoge la cantidad de columnas para que el número configurado por el administrador
      // se distribuya de forma natural en A4 vertical:
      // 1 = 1x1, 2 = 2x1, 4 = 2x2, 6 = 3x2, 8 = 4x2, 9 = 3x3, 12 = 4x3.
      if (productsPerPage <= 1) return 1;
      if (productsPerPage === 2) return 2;
      if (productsPerPage === 3) return 3;
      if (productsPerPage <= 4) return 2;
      if (productsPerPage <= 6) return 3;
      if (productsPerPage <= 8) return 4;
      if (productsPerPage === 9) return 3;
      return 4;
    };

    const PDF_GRID_COLUMNS = getPdfGridColumns(PDF_PRODUCTS_PER_PAGE);
    const PDF_ROWS_PER_PAGE = Math.max(
      1,
      Math.ceil(PDF_PRODUCTS_PER_PAGE / PDF_GRID_COLUMNS),
    );

    const getPdfGridGap = (productsPerPage: number) => {
      if (productsPerPage <= 1) return { column: 0, row: 0 };
      if (productsPerPage <= 2) return { column: 24, row: 26 };
      if (productsPerPage <= 4) return { column: 28, row: 34 };
      if (productsPerPage <= 6) return { column: 22, row: 24 };
      if (productsPerPage <= 9) return { column: 18, row: 18 };
      return { column: 14, row: 14 };
    };

    const PDF_GRID_GAP = getPdfGridGap(PDF_PRODUCTS_PER_PAGE);
    const PDF_GRID_COLUMN_GAP_PX = PDF_GRID_GAP.column;
    const PDF_GRID_ROW_GAP_PX = PDF_GRID_GAP.row;

    const getPdfMediaSize = (productsPerPage: number, columns: number) => {
      // Tamaño flexible de imagen según el layout configurado.
      // Mientras más productos por página, más se reduce imagen y texto para que no haya cortes.
      const columnWidth =
        columns <= 1
          ? EXPORT_WIDTH_PX
          : Math.floor(
              (EXPORT_WIDTH_PX - PDF_GRID_COLUMN_GAP_PX * (columns - 1)) /
                columns,
            );

      if (productsPerPage <= 1) return { min: 620, max: 760 };

      const maxByCount =
        productsPerPage <= 2
          ? 520
          : productsPerPage <= 3
            ? 430
            : productsPerPage <= 4
              ? 350
              : productsPerPage <= 6
                ? 260
                : productsPerPage <= 8
                  ? 220
                  : productsPerPage <= 9
                    ? 185
                    : 160;

      const maxByWidth = Math.round(columnWidth * 0.82);
      const max = Math.max(120, Math.min(maxByCount, maxByWidth));
      const min = Math.max(105, Math.round(max * 0.78));

      return { min, max };
    };

    const PDF_PRODUCT_MEDIA = getPdfMediaSize(
      PDF_PRODUCTS_PER_PAGE,
      PDF_GRID_COLUMNS,
    );

    const PDF_BADGE_OR_CONTROL_SELECTOR =
      '[data-featured-badge="true"], [data-category-badge="true"], [data-stock-badge="true"], [data-price-inline="true"], [data-action-hint="true"], [data-pdf-link="product"]';

    const isBadgeOrControl = (el: HTMLElement | null) => {
      return !!el && el.matches(PDF_BADGE_OR_CONTROL_SELECTOR);
    };

    const getMediaInnerWrapper = (media: HTMLElement): HTMLElement | null => {
      // No usar firstElementChild a ciegas.
      // En algunas tarjetas el primer hijo del contenedor de imagen es el badge de categoría.
      // Si se le aplica width/height:100%, el badge se vuelve un óvalo gigante.
      const img = media.querySelector("img") as HTMLElement | null;

      if (img) {
        let candidate: HTMLElement = img;

        while (
          candidate.parentElement &&
          candidate.parentElement !== media &&
          media.contains(candidate.parentElement)
        ) {
          candidate = candidate.parentElement as HTMLElement;
        }

        if (candidate !== img && !isBadgeOrControl(candidate)) return candidate;
      }

      const child = (Array.from(media.children) as HTMLElement[]).find(
        (el) => !isBadgeOrControl(el) && !!el.querySelector("img"),
      );

      return child || null;
    };

    const getProductMediaEls = (root: ParentNode): HTMLElement[] => {
      const isNotBadgeOrControl = (el: HTMLElement) => {
        return !isBadgeOrControl(el);
      };

      const explicit = (
        Array.from(
          root.querySelectorAll(
            '.product-media, [data-product-media="true"], [data-product-image-wrap="true"]',
          ),
        ) as HTMLElement[]
      ).filter((el) => isNotBadgeOrControl(el));

      const inferred = (
        Array.from(root.querySelectorAll(".product-pdf")) as HTMLElement[]
      )
        .map((card) => {
          const img = card.querySelector("img") as HTMLElement | null;
          if (!img) return null;

          let candidate: HTMLElement | null = img;
          while (
            candidate.parentElement &&
            candidate.parentElement !== card &&
            card.contains(candidate.parentElement)
          ) {
            candidate = candidate.parentElement as HTMLElement;
          }

          if (!candidate || !isNotBadgeOrControl(candidate)) return null;
          return candidate;
        })
        .filter((el): el is HTMLElement => !!el);

      return Array.from(new Set([...explicit, ...inferred]));
    };

    const getPrimaryProductMediaEl = (
      card: HTMLElement,
    ): HTMLElement | null => {
      const explicit = card.querySelector(
        '.product-media, [data-product-media="true"], [data-product-image-wrap="true"]',
      ) as HTMLElement | null;

      if (explicit && !isBadgeOrControl(explicit)) return explicit;

      const inferred = getProductMediaEls(card)[0] || null;
      if (inferred && inferred !== card && !inferred.matches(".product-pdf"))
        return inferred;

      return null;
    };

    const flattenProductCardForPdf = (card: HTMLElement) => {
      card.style.background = "#ffffff";
      card.style.backgroundColor = "#ffffff";
      card.style.border = "0";
      card.style.boxShadow = "none";
      card.style.filter = "none";
      card.style.outline = "none";

      (
        Array.from(
          card.querySelectorAll(
            ".product-media, [data-product-media='true'], [data-product-image-wrap='true']",
          ),
        ) as HTMLElement[]
      ).forEach((el) => {
        el.style.background = "#ffffff";
        el.style.backgroundColor = "#ffffff";
        el.style.border = "0";
        el.style.boxShadow = "none";
        el.style.outline = "none";
      });

      (
        Array.from(
          card.querySelectorAll(
            "[data-action-hint='true'], [data-price-inline='true'], [data-stock-badge='true'], [data-category-badge='true']",
          ),
        ) as HTMLElement[]
      ).forEach((el) => {
        el.style.boxShadow = "none";
        el.style.outline = "none";
        el.style.border = "0";
      });

      (Array.from(card.children) as HTMLElement[]).forEach((child) => {
        child.style.background = "#ffffff";
        child.style.backgroundColor = "#ffffff";
        child.style.boxShadow = "none";
        child.style.outline = "none";
      });
    };

    const getPdfTextSizes = (productsPerPage: number) => {
      if (productsPerPage <= 1)
        return { title: 38, description: 31, price: 22, badge: 17, action: 17 };
      if (productsPerPage <= 2)
        return { title: 32, description: 20, price: 20, badge: 16, action: 16 };
      if (productsPerPage <= 4)
        return { title: 26, description: 16, price: 18, badge: 15, action: 15 };
      if (productsPerPage <= 6)
        return { title: 20, description: 13, price: 15, badge: 12, action: 13 };
      return { title: 16, description: 11, price: 13, badge: 11, action: 11 };
    };

    const PDF_TEXT = getPdfTextSizes(PDF_PRODUCTS_PER_PAGE);

    const resolvedQuality = opts?.quality ?? quality;

    // ── FIX iOS: escala reducida para evitar crash de memoria en Safari ──
    const canvasScale = isIOS
      ? 1.0 // iOS: escala baja para no exceder límite de canvas (~16MB)
      : resolvedQuality === "alta"
        ? 1.6
        : 1.25;

    const jpegQuality =
      resolvedQuality === "alta" ? (isIOS ? 0.76 : 0.88) : isIOS ? 0.62 : 0.76;

    const encodeWaText = (t: string) => encodeURIComponent(t);

    // ── FIX iOS: waitFrames con setTimeout en lugar de rAF (Safari throttlea rAF) ──
    const waitFrames = (n = 2) =>
      new Promise<void>((r) => setTimeout(r, n * 32));

    const waitMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    const withTimeout = <T,>(
      promise: Promise<T>,
      timeoutMs: number,
      message: string,
    ) =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        promise.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      });

    const prepareIosCaptureRoot = (root: HTMLElement) => {
      if (!isIOS) return;

      (Array.from(root.querySelectorAll("*")) as HTMLElement[]).forEach(
        (el) => {
          el.style.animation = "none";
          el.style.transition = "none";
          el.style.transform = "none";
          el.style.filter = "none";
          el.style.backdropFilter = "none";
          el.style.boxShadow = "none";
          el.style.textShadow = "none";
          el.style.mixBlendMode = "normal";
          el.style.willChange = "auto";
          el.style.contain = "none";
        },
      );
    };

    const waitLoad = (img: HTMLImageElement, timeoutMs = 8000) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();

      return new Promise<void>((res) => {
        let settled = false;

        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          res();
        };

        // ── FIX iOS: timeout más corto para no bloquear indefinidamente ──
        const timer = setTimeout(done, timeoutMs);
        img.onload = done;
        img.onerror = done;
      });
    };

    const getPos = (el: HTMLElement, stop: HTMLElement) => {
      const elRect = el.getBoundingClientRect();
      const stopRect = stop.getBoundingClientRect();

      return {
        top: elRect.top - stopRect.top,
        left: elRect.left - stopRect.left,
        width: elRect.width || el.offsetWidth,
        height: elRect.height || el.offsetHeight,
      };
    };

    const blobToDataUrl = (blob: Blob) =>
      new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = () => rej(reader.error);
        reader.readAsDataURL(blob);
      });

    const dataUrlToCanvas = (dataUrl: string) =>
      new Promise<HTMLCanvasElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(
            1,
            img.naturalWidth || img.width || EXPORT_WIDTH_PX,
          );
          canvas.height = Math.max(1, img.naturalHeight || img.height || 1);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("No se pudo preparar canvas para PDF"));
            return;
          }

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas);
        };
        img.onerror = () =>
          reject(new Error("No se pudo convertir captura a canvas"));
        img.src = dataUrl;
      });

    const canvasToJpegDataUrl = (
      canvas: HTMLCanvasElement,
      qualityValue: number,
      errorMessage = "No se pudo codificar la pagina del PDF"
    ) => {
      const dataUrl = canvas.toDataURL("image/jpeg", qualityValue);
      if (!dataUrl || dataUrl === "data:,") throw new Error(errorMessage);
      return dataUrl;
    };

    const safeFetchBlob = async (src: string, timeoutMs = 8000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const resp = await fetch(src, {
          mode: "cors",
          credentials: "omit", // ── FIX iOS: sin credenciales evita preflight
          cache: "force-cache", // ── FIX iOS: reutiliza caché del browser
          signal: controller.signal,
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.blob();
      } finally {
        clearTimeout(timer);
      }
    };

    // ── FIX iOS: convertir imagen a data URL via canvas para forzar decode ──
    const imageToDataUrlViaCanvas = (img: HTMLImageElement): string | null => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width || 300;
        canvas.height = img.naturalHeight || img.height || 300;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL("image/jpeg", 0.8);
      } catch {
        return null;
      }
    };

    const loadPdfImage = (src: string, timeoutMs = 8000) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        let settled = false;

        const done = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(img);
        };

        const timer = setTimeout(
          () => done(new Error("Tiempo agotado cargando imagen")),
          timeoutMs,
        );
        img.onload = () => done();
        img.onerror = () => done(new Error("No se pudo cargar la imagen"));
        if (!src.startsWith("data:") && !src.startsWith("blob:"))
          img.crossOrigin = "anonymous";
        img.decoding = "sync";
        img.src = src;
      });

    const imageSourceToPdfDataUrl = async (
      src: string,
      maxSide = isIOS ? 640 : 860,
    ) => {
      const img = await loadPdfImage(src);
      const naturalW = img.naturalWidth || img.width || 1;
      const naturalH = img.naturalHeight || img.height || 1;
      const scale = Math.min(1, maxSide / Math.max(naturalW, naturalH));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(naturalW * scale));
      canvas.height = Math.max(1, Math.round(naturalH * scale));

      const ctx = canvas.getContext("2d");
      if (!ctx) return { src, naturalWidth: naturalW, naturalHeight: naturalH };

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return {
        src: canvas.toDataURL("image/jpeg", isIOS ? 0.7 : 0.78),
        naturalWidth: canvas.width,
        naturalHeight: canvas.height,
      };
    };

    const blobToPdfDataUrl = async (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      objectUrlsToRevoke.push(url);

      try {
        return await imageSourceToPdfDataUrl(url);
      } catch {
        const src = await blobToDataUrl(blob);
        return { src, naturalWidth: 1, naturalHeight: 1 };
      }
    };

    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-99999px";
    container.style.top = "0";
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

      (
        Array.from(
          clone.querySelectorAll(
            "#catalog-capture-area, .products-grid, .catalog-footer, [data-pdf-footer='true']",
          ),
        ) as HTMLElement[]
      ).forEach((el) => {
        el.style.background = "transparent";
        el.style.backgroundColor = "transparent";
        el.style.background = "#ffffff";
        el.style.backgroundColor = "#ffffff";
      });

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
          grid-template-columns:repeat(${PDF_GRID_COLUMNS},minmax(0,1fr)) !important;
          column-gap:${PDF_GRID_COLUMN_GAP_PX}px !important;
          row-gap:${PDF_GRID_ROW_GAP_PX}px !important;
          align-items:start !important;
          width:100% !important;
          box-sizing:border-box !important;
        `;
      }

      // Header PDF un poco más grande y legible
      // No cambia la lógica del PDF; solo aumenta logo, título, redes y botón/teléfono del encabezado.
      const styleHeaderForPdf = (root: HTMLElement) => {
        const headerEls = Array.from(
          root.querySelectorAll(
            '[data-pdf-header="true"], .catalog-header, .pdf-header, header',
          ),
        ) as HTMLElement[];

        headerEls.forEach((header) => {
          header.style.minHeight = "170px";
          header.style.padding = "18px 28px";
          header.style.boxSizing = "border-box";
          header.style.backgroundSize = "cover";
          header.style.backgroundPosition = "center";
          header.style.overflow = "visible";

          (
            Array.from(header.querySelectorAll("h1, h2")) as HTMLElement[]
          ).forEach((title) => {
            title.style.fontSize = "30px";
            title.style.lineHeight = "1.15";
            title.style.fontWeight = "800";
            title.style.margin = "0";
          });

          (
            Array.from(
              header.querySelectorAll(
                '[data-store-name="true"], .store-name, .business-name, .brand-title, .catalog-title',
              ),
            ) as HTMLElement[]
          ).forEach((title) => {
            title.style.fontSize = "26px";
            title.style.lineHeight = "1.2";
            title.style.fontWeight = "800";
          });

          (
            Array.from(
              header.querySelectorAll(
                '[data-store-subtitle="true"], .store-subtitle, .business-subtitle, .catalog-subtitle',
              ),
            ) as HTMLElement[]
          ).forEach((subtitle) => {
            subtitle.style.fontSize = "15px";
            subtitle.style.lineHeight = "1.25";
          });

          const headerImgs = Array.from(
            header.querySelectorAll("img"),
          ) as HTMLImageElement[];
          headerImgs.forEach((img) => {
            const looksLikeLogo =
              img.matches(
                '[data-store-logo="true"], [data-logo="true"], .store-logo img, .logo img, .brand-logo img',
              ) ||
              (img.naturalWidth > 0 &&
                img.naturalHeight > 0 &&
                img.naturalWidth <= 300 &&
                img.naturalHeight <= 300);

            if (looksLikeLogo) {
              img.style.width = "86px";
              img.style.height = "86px";
              img.style.minWidth = "86px";
              img.style.minHeight = "86px";
              img.style.maxWidth = "86px";
              img.style.maxHeight = "86px";
              img.style.objectFit = "contain";
              img.style.display = "block";
            } else {
              img.style.width = "100%";
              img.style.minHeight = "170px";
              img.style.maxHeight = "210px";
              img.style.objectFit = "cover";
            }
          });

          (Array.from(header.querySelectorAll("svg")) as SVGElement[]).forEach(
            (svg) => {
              svg.style.width = "24px";
              svg.style.height = "24px";
            },
          );

          (Array.from(header.querySelectorAll("a")) as HTMLElement[]).forEach(
            (a) => {
              a.style.fontSize = "17px";
              a.style.lineHeight = "1";
            },
          );

          (
            Array.from(
              header.querySelectorAll(
                '[data-store-whatsapp="true"], a[href*="wa.me"], a[href*="whatsapp"], .whatsapp, .phone, .social-link',
              ),
            ) as HTMLElement[]
          ).forEach((el) => {
            el.style.minHeight = "42px";
            el.style.padding = "10px 18px";
            el.style.fontSize = "18px";
            el.style.lineHeight = "1";
            el.style.display = "inline-flex";
            el.style.alignItems = "center";
            el.style.justifyContent = "center";
            el.style.gap = "8px";
          });
        });
      };

      styleHeaderForPdf(clone);

      getProductMediaEls(clone).forEach((media) => {
        media.style.aspectRatio = "unset";
        media.style.height = `${PDF_PRODUCT_MEDIA.max}px`;
        media.style.minHeight = `${PDF_PRODUCT_MEDIA.max}px`;
        media.style.maxHeight = `${PDF_PRODUCT_MEDIA.max}px`;
        media.style.overflow = "hidden";
        media.style.display = "flex";
        media.style.alignItems = "center";
        media.style.justifyContent = "center";
        media.style.boxSizing = "border-box";
        const inner = getMediaInnerWrapper(media);
        if (inner) {
          inner.style.width = "100%";
          inner.style.height = "100%";
          inner.style.minHeight = "0";
          inner.style.maxHeight = "100%";
          inner.style.overflow = "hidden";
        }
      });

      (
        Array.from(clone.querySelectorAll(".product-pdf")) as HTMLElement[]
      ).forEach((card) => {
        flattenProductCardForPdf(card);
        card.style.overflow = "hidden";
      });

      (
        Array.from(clone.querySelectorAll(".product-pdf h3")) as HTMLElement[]
      ).forEach((el) => {
        el.style.fontSize = `${PDF_TEXT.title}px`;
        el.style.lineHeight = "1.22";
      });

      (
        Array.from(
          clone.querySelectorAll(".product-pdf .catalog-html"),
        ) as HTMLElement[]
      ).forEach((el) => {
        // Para 1 producto por página, la descripción debe verse más grande,
        // pero siempre por debajo del tamaño del título.
        el.style.background = "transparent";
        el.style.backgroundColor = "transparent";
        const safeDescriptionSize = Math.min(
          PDF_TEXT.description,
          PDF_TEXT.title - 4,
        );
        el.style.fontSize = `${safeDescriptionSize}px`;
        el.style.lineHeight = PDF_PRODUCTS_PER_PAGE <= 1 ? "1.42" : "1.55";

        // Algunos textos vienen dentro de p, span, strong, li, etc. con estilos propios.
        // Forzamos la herencia para que en móvil/tablet/escritorio se vea igual en el PDF.
        (
          Array.from(
            el.querySelectorAll("p, span, strong, em, b, i, li, div"),
          ) as HTMLElement[]
        ).forEach((child) => {
          child.style.fontSize = "inherit";
          child.style.lineHeight = "inherit";
          child.style.background = "transparent";
          child.style.backgroundColor = "transparent";
        });
      });

      const imgs = (
        Array.from(clone.querySelectorAll("img")) as HTMLImageElement[]
      ).filter((img) => !img.closest(".product-pdf"));
      const productImageById = new Map(
        products.map((product) => [String(product.id), product] as const),
      );
      type ProductPdfImage = {
        src: string;
        naturalWidth: number;
        naturalHeight: number;
      };

      const productPdfImageSrcCache = new Map<
        string,
        Promise<ProductPdfImage>
      >();

      const resolveProductPdfImageSrc = async (
        product: Product,
      ): Promise<ProductPdfImage> => {
        const key = String(product.id);
        const cached = productPdfImageSrcCache.get(key);
        if (cached) return cached;

        const task = (async () => {
          if (product.image?.startsWith("data:")) {
            try {
              return await imageSourceToPdfDataUrl(product.image);
            } catch {
              return { src: product.image, naturalWidth: 1, naturalHeight: 1 };
            }
          }

          if (product.imageId) {
            try {
              const blob = await getImageBlob(product.imageId);
              if (blob) return await blobToPdfDataUrl(blob);
            } catch (error) {
              console.warn(
                "No se pudo leer imagen de producto desde IndexedDB:",
                error,
              );
            }
          }

          let source = product.image || "";
          if (!source && product.imageId) {
            try {
              source = (await getImageUrl(product.imageId)) || "";
            } catch (error) {
              console.warn(
                "No se pudo crear URL de imagen de producto:",
                error,
              );
            }
          }
          if (!source) return { src: "", naturalWidth: 1, naturalHeight: 1 };

          if (source.startsWith("data:")) {
            try {
              return await imageSourceToPdfDataUrl(source);
            } catch {
              return { src: source, naturalWidth: 1, naturalHeight: 1 };
            }
          }
          if (source.startsWith("blob:")) objectUrlsToRevoke.push(source);

          try {
            const blob = source.startsWith("blob:")
              ? await (await fetch(source)).blob()
              : await safeFetchBlob(source, 8000);
            return await blobToPdfDataUrl(blob);
          } catch {
            return { src: source, naturalWidth: 1, naturalHeight: 1 };
          }
        })();

        productPdfImageSrcCache.set(key, task);
        return task;
      };

      updateProgress(18, "Preparando imágenes...");

      // ── Paso 1: asignar src a imágenes que solo tienen data-imgid ──
      await Promise.all(
        imgs.map(async (img) => {
          const id = img.dataset.imgid;

          img.setAttribute("loading", "eager");
          img.setAttribute("decoding", "sync");
          img.referrerPolicy = "no-referrer";

          const attrSrc = img.getAttribute("src") || "";
          if (attrSrc.startsWith("data:") || attrSrc.startsWith("blob:")) {
            img.removeAttribute("crossorigin");
            img.crossOrigin = "";
          } else {
            img.crossOrigin = "anonymous";
          }

          if (!attrSrc && id) {
            const url = await getImageUrl(id);
            if (url) {
              img.src = url;
              if (url.startsWith("blob:")) objectUrlsToRevoke.push(url);
            }
          }
        }),
      );

      updateProgress(25, "Cargando imágenes...");
      await Promise.all(imgs.map((img) => waitLoad(img)));

      updateProgress(35, "Convirtiendo imágenes a data URL...");

      // ── FIX iOS CRÍTICO: convertir TODAS las imágenes a data URL antes de html2canvas ──
      // Safari no puede acceder a imágenes cross-origin en canvas sin este paso
      const BATCH_SIZE = isIOS ? 4 : 8; // iOS: batches más pequeños para no saturar memoria

      for (let i = 0; i < imgs.length; i += BATCH_SIZE) {
        const batch = imgs.slice(i, i + BATCH_SIZE);

        const currentProgress =
          35 +
          Math.min(25, ((i + batch.length) / Math.max(1, imgs.length)) * 25);

        updateProgress(
          currentProgress,
          `Procesando imagen ${i + 1} de ${imgs.length}...`,
        );

        await Promise.all(
          batch.map(async (img) => {
            const id = img.dataset.imgid;
            let src = img.getAttribute("src") || "";

            if (!src && id) {
              const blob = await getImageBlob(id);
              if (blob) {
                src = await blobToDataUrl(blob);
                img.src = src;
                img.setAttribute("src", src);
              } else {
                const url = await getImageUrl(id);
                if (url) {
                  img.src = url;
                  src = url;
                  if (url.startsWith("blob:")) objectUrlsToRevoke.push(url);
                }
              }
            }

            if (!src) return;

            if (src.startsWith("data:") || src.startsWith("blob:")) {
              img.removeAttribute("crossorigin");
              img.crossOrigin = "";
            } else {
              img.crossOrigin = "anonymous";
            }

            // Si ya es data URL, no hacer nada
            if (src.startsWith("data:")) return;

            try {
              let blob: Blob;

              if (src.startsWith("blob:")) {
                const resp = await fetch(src);
                blob = await resp.blob();
              } else {
                blob = await safeFetchBlob(src, 8000);
              }

              const dataUrl = await blobToDataUrl(blob);
              img.src = dataUrl;
              await waitLoad(img, 5000);

              const wrap = img.parentElement;
              wrap
                ?.querySelectorAll(".absolute.inset-0")
                .forEach((el) => el.remove());
            } catch {
              // Intentar via canvas como último recurso en iOS
              if (isIOS && img.complete && img.naturalWidth > 0) {
                const canvasData = imageToDataUrlViaCanvas(img);
                if (canvasData) img.src = canvasData;
              }
              // Si falla todo, continuar sin bloquear
            }
          }),
        );

        // ── FIX iOS: pequeña pausa entre batches para liberar memoria ──
        if (isIOS) await waitMs(50);
      }

      updateProgress(62, "Ajustando diseño del PDF...");

      imgs.forEach((img) => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          img.parentElement
            ?.querySelectorAll(".absolute.inset-0")
            .forEach((el) => el.remove());
        }

        img.style.width = "auto";
        img.style.height = "auto";
        img.style.maxWidth = "100%";
        img.style.maxHeight = "100%";
        img.style.objectFit = "contain";
        img.style.objectPosition = "center";
        img.style.display = "block";
        img.style.margin = "0 auto";
      });

      getProductMediaEls(clone).forEach((media) => {
        media.style.aspectRatio = "unset";
        media.style.height = `${PDF_PRODUCT_MEDIA.max}px`;
        media.style.minHeight = `${PDF_PRODUCT_MEDIA.min}px`;
        media.style.maxHeight = `${PDF_PRODUCT_MEDIA.max}px`;
        media.style.overflow = "hidden";
        media.style.display = "flex";
        media.style.alignItems = "center";
        media.style.justifyContent = "center";
        media.style.boxSizing = "border-box";
        const inner = getMediaInnerWrapper(media);
        if (inner) {
          inner.style.width = "100%";
          inner.style.height = "100%";
          inner.style.minHeight = "0";
          inner.style.maxHeight = "100%";
          inner.style.overflow = "hidden";
        }
      });

      // Reaplicar al final para que los estilos globales de imágenes no achiquen el header.
      styleHeaderForPdf(clone);

      clone.querySelectorAll('[data-price-inline="true"]').forEach((el) => {
        const el_ = el as HTMLElement;
        el_.style.display = "flex";
        el_.style.alignItems = "center";
        el_.style.justifyContent = "center";
        el_.style.lineHeight = "1";
        el_.style.paddingTop = "0";
        el_.style.paddingBottom = "0";
        el_.style.height = "36px";
        el_.style.fontSize = `${PDF_TEXT.price}px`;

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
        el_.style.height = "44px";
        el_.style.fontSize = `${Math.max(11, PDF_TEXT.badge)}px`;
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
        el_.style.height = "34px";
        el_.style.width = "fit-content";
        el_.style.minWidth = "0";
        el_.style.maxWidth = "calc(100% - 24px)";
        el_.style.flex = "0 0 auto";
        el_.style.alignSelf = "flex-start";
        el_.style.fontSize = `${PDF_TEXT.badge}px`;

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
        el_.style.height = "46px";
        el_.style.fontSize = `${PDF_TEXT.badge}px`;
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

      updateProgress(65, "Esperando fuentes...");

      await waitMs(isIOS ? 300 : 100); // iOS necesita más tiempo para aplicar estilos

      if ("fonts" in document) {
        try {
          await Promise.race([
            (document as any).fonts.ready,
            waitMs(2000), // ── FIX iOS: timeout de 2s para fonts.ready que se cuelga
          ]);
        } catch {
          // Ignorar
        }
      }

      await waitMs(isIOS ? 400 : 100);

      void clone.offsetHeight;
      void clone.getBoundingClientRect();

      await waitMs(isIOS ? 200 : 50);

      const fullHeight = clone.scrollHeight || clone.offsetHeight;
      container.style.height = `${fullHeight + 20}px`;

      await waitMs(100);

      updateProgress(70, "Preparando links clickeables...");

      type LinkArea = {
        url: string;
        left: number;
        top: number;
        width: number;
        height: number;
      };

      type ProductImageArea = {
        productId: string;
        src: string;
        naturalWidth: number;
        naturalHeight: number;
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

      const getWatermarkLogoSrc = (): string => {
        const logoImg =
          (clone.querySelector(
            'img[data-store-logo="true"]',
          ) as HTMLImageElement | null) ||
          (clone.querySelector(
            '[data-logo="true"] img',
          ) as HTMLImageElement | null) ||
          (clone.querySelector(
            ".store-logo img, .logo img, .brand-logo img",
          ) as HTMLImageElement | null);

        if (!logoImg) return coverImage || "";

        // Después de convertir las imágenes del catálogo, normalmente el logo ya queda en data URL.
        // Si se puede, lo pasamos por canvas para que jsPDF lo reciba como JPEG confiable.
        return (
          imageToDataUrlViaCanvas(logoImg) ||
          logoImg.src ||
          logoImg.getAttribute("src") ||
          ""
        );
      };

      const watermarkLogoSrc = showWatermarkInPdf
        ? getWatermarkLogoSrc()
        : "";

      // La marca se compone dentro de la captura HTML, no como una capa final
      // de jsPDF. Así las tarjetas, textos e imágenes de producto siempre se
      // dibujan encima, incluso en visores de PDF que manejan distinto la
      // transparencia de las imágenes.
      const createWatermarkBackground = async (): Promise<string> => {
        if (!watermarkLogoSrc) return "";

        try {
          const image = await loadPdfImage(watermarkLogoSrc);
          const naturalWidth = image.naturalWidth || image.width || 1;
          const naturalHeight = image.naturalHeight || image.height || 1;
          const maxSide = 720;
          const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(naturalHeight * scale));

          const context = canvas.getContext("2d");
          if (!context) return "";

          context.globalAlpha = 0.055;
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/png");
        } catch (error) {
          console.warn("No se pudo preparar la marca de agua:", error);
          return "";
        }
      };

      const watermarkBackgroundSrc = await createWatermarkBackground();

      const getImageFormatForPdf = (src: string): "PNG" | "JPEG" | "WEBP" => {
        const value = src.toLowerCase();

        if (value.startsWith("data:image/png") || value.endsWith(".png"))
          return "PNG";
        if (value.startsWith("data:image/webp") || value.endsWith(".webp"))
          return "WEBP";

        return "JPEG";
      };

      const loadImage = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("No se pudo cargar la portada"));
          img.src = src;
        });

      const makeCoverPageImage = async (src: string) => {
        const img = await loadImage(src);
        const canvas = document.createElement("canvas");
        canvas.width = 1600;
        canvas.height = Math.round(canvas.width * (pageH / pageW));

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No se pudo preparar la portada");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const scale = Math.max(
          canvas.width / img.naturalWidth,
          canvas.height / img.naturalHeight,
        );
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        const drawX = (canvas.width - drawW) / 2;
        const drawY = (canvas.height - drawH) / 2;

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        const dataUrl = canvasToJpegDataUrl(
          canvas,
          isIOS ? 0.72 : resolvedQuality === "alta" ? 0.9 : 0.78,
          "No se pudo codificar la portada",
        );
        canvas.width = 1;
        canvas.height = 1;
        return dataUrl;
      };

      const hasCustomCover = !!coverImage;

      if (hasCustomCover && coverImage) {
        updateProgress(74, "Agregando portada personalizada...");

        try {
          const coverDataUrl = await makeCoverPageImage(coverImage);
          pdf.addImage(
            coverDataUrl,
            getImageFormatForPdf(coverDataUrl),
            0,
            0,
            pageW,
            pageH,
            undefined,
            "FAST",
          );
        } catch (err) {
          console.warn("No se pudo agregar la portada personalizada:", err);
        }
      }

      const cssPxPerMm = EXPORT_WIDTH_PX / usableWmm;
      const pageHeightCssPx = Math.floor(usableHmm * cssPxPerMm) - 6;

      const cards = Array.from(
        clone.querySelectorAll(".product-pdf"),
      ) as HTMLElement[];

      type ProductRow = {
        top: number;
        cards: HTMLElement[];
      };

      // Las filas del PDF NO se calculan con offsetTop del navegador móvil.
      // Se crean por orden de productos y por la cantidad de columnas configurada,
      // para que el PDF sea igual en escritorio y móvil.
      const rows: ProductRow[] = [];
      for (let i = 0; i < cards.length; i += PDF_GRID_COLUMNS) {
        rows.push({
          top: i,
          cards: cards.slice(i, i + PDF_GRID_COLUMNS),
        });
      }

      const styleProductCardForPdf = (card: HTMLElement) => {
        card.style.breakInside = "avoid";
        card.style.pageBreakInside = "avoid";
        (card.style as any).webkitColumnBreakInside = "avoid";
        card.style.width = "100%";
        card.style.maxWidth = "100%";
        card.style.minWidth = "0";
        card.style.minHeight = "0";
        card.style.height = "auto";
        card.style.maxHeight = "none";
        card.style.boxSizing = "border-box";
        card.style.overflow = "hidden";
        flattenProductCardForPdf(card);

        const mediaEls = getProductMediaEls(card);
        mediaEls.forEach((media) => {
          media.style.aspectRatio = "unset";
          media.style.height = `${PDF_PRODUCT_MEDIA.max}px`;
          media.style.minHeight = `${PDF_PRODUCT_MEDIA.min}px`;
          media.style.maxHeight = `${PDF_PRODUCT_MEDIA.max}px`;
          media.style.overflow = "hidden";
          media.style.display = "flex";
          media.style.alignItems = "center";
          media.style.justifyContent = "center";
          media.style.boxSizing = "border-box";

          const inner = getMediaInnerWrapper(media);
          if (inner) {
            inner.style.width = "100%";
            inner.style.height = "100%";
            inner.style.minHeight = "0";
            inner.style.maxHeight = "100%";
            inner.style.display = "flex";
            inner.style.alignItems = "center";
            inner.style.justifyContent = "center";
            inner.style.overflow = "hidden";
            inner.style.background = "#ffffff";
            inner.style.backgroundColor = "#ffffff";
            inner.style.border = "0";
            inner.style.boxShadow = "none";
            inner.style.outline = "none";
          }
        });

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

      const compactPageToFit = async (
        page: HTMLElement,
        grid: HTMLElement,
        maxHeightPx: number,
      ) => {
        const factors = [0.92, 0.84, 0.76, 0.68];

        for (const factor of factors) {
          getProductMediaEls(grid).forEach((media) => {
            const nextMin = Math.max(
              120,
              Math.round(PDF_PRODUCT_MEDIA.min * factor),
            );
            const nextMax = Math.max(
              nextMin,
              Math.round(PDF_PRODUCT_MEDIA.max * factor),
            );
            media.style.minHeight = `${nextMin}px`;
            media.style.maxHeight = `${nextMax}px`;
            media.style.height = `${nextMax}px`;
          });

          (
            Array.from(
              grid.querySelectorAll(".product-pdf h3"),
            ) as HTMLElement[]
          ).forEach((el) => {
            el.style.fontSize = `${Math.max(14, Math.round(PDF_TEXT.title * Math.max(0.78, factor)))}px`;
            el.style.lineHeight = "1.18";
          });

          (
            Array.from(
              grid.querySelectorAll(".product-pdf .catalog-html"),
            ) as HTMLElement[]
          ).forEach((el) => {
            const nextSize = Math.max(
              10,
              Math.round(PDF_TEXT.description * Math.max(0.82, factor)),
            );
            el.style.fontSize = `${Math.min(nextSize, Math.max(10, PDF_TEXT.title - 4))}px`;
            el.style.lineHeight = "1.35";
            (
              Array.from(
                el.querySelectorAll("p, span, strong, em, b, i, li, div"),
              ) as HTMLElement[]
            ).forEach((child) => {
              child.style.fontSize = "inherit";
              child.style.lineHeight = "inherit";
            });
          });

          await waitMs(isIOS ? 60 : 16);
          collapseGridParents(page);
          if (getPdfContentHeight(page, grid) <= maxHeightPx) return true;
        }

        return getPdfContentHeight(page, grid) <= maxHeightPx;
      };

      const scalePageCardsForPdf = (grid: HTMLElement, factor: number) => {
        const mediaFactor = Math.min(2.6, Math.max(0.68, factor));
        const textFactor = Math.min(
          1.32,
          Math.max(0.78, 0.92 + (factor - 1) * 0.34),
        );
        const gapFactor = Math.min(
          2.05,
          Math.max(0.8, 0.9 + (factor - 1) * 0.8),
        );

        grid.style.rowGap = `${Math.round(PDF_GRID_ROW_GAP_PX * gapFactor)}px`;

        getProductMediaEls(grid).forEach((media) => {
          const nextMin = Math.max(
            105,
            Math.round(PDF_PRODUCT_MEDIA.min * mediaFactor),
          );
          const nextMax = Math.max(
            nextMin,
            Math.round(PDF_PRODUCT_MEDIA.max * mediaFactor),
          );
          media.style.minHeight = `${nextMin}px`;
          media.style.maxHeight = `${nextMax}px`;
          media.style.height = `${nextMax}px`;
        });

        (
          Array.from(grid.querySelectorAll(".product-pdf h3")) as HTMLElement[]
        ).forEach((el) => {
          el.style.fontSize = `${Math.max(14, Math.round(PDF_TEXT.title * textFactor))}px`;
          el.style.lineHeight = factor > 1 ? "1.2" : "1.18";
        });

        (
          Array.from(
            grid.querySelectorAll(".product-pdf .catalog-html"),
          ) as HTMLElement[]
        ).forEach((el) => {
          const nextSize = Math.max(
            10,
            Math.round(PDF_TEXT.description * Math.min(1.18, textFactor)),
          );
          el.style.fontSize = `${Math.min(nextSize, Math.max(10, Math.round(PDF_TEXT.title * textFactor) - 4))}px`;
          el.style.lineHeight = factor > 1 ? "1.48" : "1.35";

          (
            Array.from(
              el.querySelectorAll("p, span, strong, em, b, i, li, div"),
            ) as HTMLElement[]
          ).forEach((child) => {
            child.style.fontSize = "inherit";
            child.style.lineHeight = "inherit";
          });
        });
      };

      const expandPageToUseSpace = async (
        page: HTMLElement,
        grid: HTMLElement,
        maxHeightPx: number,
      ) => {
        const getProductSpace = () => {
          const pageTop = page.getBoundingClientRect().top;
          const gridRect = grid.getBoundingClientRect();
          const cardsInPage = Array.from(
            grid.querySelectorAll(".product-pdf"),
          ) as HTMLElement[];
          let productBottom = 0;

          cardsInPage.forEach((card) => {
            if (!isElementVisibleForPdf(card)) return;
            const rect = card.getBoundingClientRect();
            productBottom = Math.max(productBottom, rect.bottom - pageTop);
          });

          const footer = (
            Array.from(
              page.querySelectorAll(
                '[data-pdf-footer="true"], .catalog-footer, .pdf-footer, footer',
              ),
            ) as HTMLElement[]
          ).find(isElementVisibleForPdf);

          const footerTop = footer
            ? footer.getBoundingClientRect().top - pageTop
            : maxHeightPx;

          return {
            gridTop: gridRect.top - pageTop,
            productBottom,
            availableBottom: Math.min(maxHeightPx * 0.97, footerTop - 18),
          };
        };

        const initialSpace = getProductSpace();
        if (initialSpace.productBottom <= 0) return;

        const currentBlockHeight = Math.max(
          1,
          initialSpace.productBottom - initialSpace.gridTop,
        );
        const targetBlockHeight = Math.max(
          1,
          initialSpace.availableBottom - initialSpace.gridTop,
        );
        const freeSpace = targetBlockHeight - currentBlockHeight;
        if (freeSpace < 70) return;

        const estimatedFactor = Math.min(
          2.6,
          Math.max(1.04, targetBlockHeight / currentBlockHeight),
        );
        const factors = [
          1.06, 1.12, 1.2, 1.3, 1.42, 1.58, 1.78, 1.98, 2.18, 2.38, 2.6,
        ].filter((factor) => factor <= estimatedFactor + 0.04);

        let bestFactor = 1;

        for (const factor of factors) {
          scalePageCardsForPdf(grid, factor);
          await waitMs(isIOS ? 60 : 16);
          collapseGridParents(page);

          const nextSpace = getProductSpace();
          const nextHeight = getPdfContentHeight(page, grid);
          if (
            nextHeight <= maxHeightPx &&
            nextSpace.productBottom <= nextSpace.availableBottom
          ) {
            bestFactor = factor;
          } else {
            break;
          }
        }

        scalePageCardsForPdf(grid, bestFactor);
        await waitMs(isIOS ? 60 : 16);
        collapseGridParents(page);
      };

      const isElementVisibleForPdf = (el: HTMLElement) => {
        const style = window.getComputedStyle(el);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          el.offsetWidth > 0 &&
          el.offsetHeight > 0
        );
      };

      // IMPORTANTE:
      // En móvil algunos navegadores conservan min-height/100vh o alturas heredadas
      // aunque visualmente no haya contenido. Si medimos page.scrollHeight o escaneamos
      // todo el árbol, Safari/Chrome móvil reportan una página mucho más alta y por eso
      // terminan entrando solo 2 productos.
      // Esta función mide únicamente lo que realmente debe salir en el PDF:
      // encabezado visible + tarjetas visibles + footer visible.
      const getPdfContentHeight = (
        page: HTMLElement,
        grid?: HTMLElement | null,
      ) => {
        const pageTop = page.getBoundingClientRect().top;
        let bottom = 0;

        const addBottom = (el: HTMLElement | null) => {
          if (!el || !isElementVisibleForPdf(el)) return;
          const rect = el.getBoundingClientRect();
          bottom = Math.max(bottom, rect.bottom - pageTop);
        };

        // Encabezados visibles, si esta página los incluye.
        (
          Array.from(
            page.querySelectorAll(
              '[data-pdf-header="true"], .catalog-header, .pdf-header, header',
            ),
          ) as HTMLElement[]
        ).forEach(addBottom);

        const pageGrid =
          grid || (page.querySelector(".products-grid") as HTMLElement | null);

        if (pageGrid && isElementVisibleForPdf(pageGrid)) {
          const cardsInPage = Array.from(
            pageGrid.querySelectorAll(".product-pdf"),
          ) as HTMLElement[];

          if (cardsInPage.length > 0) {
            cardsInPage.forEach(addBottom);
          } else {
            addBottom(pageGrid);
          }
        }

        // Footers visibles, solo en la última página.
        (
          Array.from(
            page.querySelectorAll(
              '[data-pdf-footer="true"], .catalog-footer, .pdf-footer, footer',
            ),
          ) as HTMLElement[]
        ).forEach(addBottom);

        // Un pequeño margen de seguridad para sombras/bordes sin inflar la página.
        return Math.ceil(bottom + 4);
      };

      const collapseGridParents = (page: HTMLElement) => {
        const pageGrid = page.querySelector(
          ".products-grid",
        ) as HTMLElement | null;
        if (!pageGrid) return;

        let current: HTMLElement | null = pageGrid;

        while (current && current !== page) {
          current.style.minHeight = "0";
          current.style.height = "auto";
          current.style.maxHeight = "none";
          current.style.overflow = "visible";
          current.style.alignContent = "start";
          current = current.parentElement as HTMLElement | null;
        }

        page.style.minHeight = "0";
        page.style.height = "auto";
        page.style.maxHeight = "none";
        page.style.overflow = "visible";
      };

      const controlHeaderFooter = (
        page: HTMLElement,
        includeHeader: boolean,
        includeFooter: boolean,
      ) => {
        const pageGrid = page.querySelector(
          ".products-grid",
        ) as HTMLElement | null;

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
              if (index < currentIndex && !includeHeader)
                sibling.style.display = "none";
              if (index > currentIndex && !includeFooter)
                sibling.style.display = "none";
            });

            current = parent;
          }
        }
      };

      const makePage = (includeHeader: boolean) => {
        const page = clone.cloneNode(true) as HTMLElement;

        page.style.position = "absolute";
        page.style.left = "-99999px";
        page.style.top = "0";
        page.style.width = `${EXPORT_WIDTH_PX}px`;
        page.style.maxWidth = `${EXPORT_WIDTH_PX}px`;
        page.style.backgroundColor = "#ffffff";
        if (watermarkBackgroundSrc) {
          page.style.backgroundImage = `url("${watermarkBackgroundSrc}")`;
          page.style.backgroundRepeat = "no-repeat";
          page.style.backgroundPosition = "center center";
          page.style.backgroundSize = "62% auto";
        }
        page.style.boxSizing = "border-box";
        page.style.margin = "0";
        page.style.transform = "none";
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
          return { page, grid: page };
        }

        pageGrid.querySelectorAll(".product-pdf").forEach((el) => el.remove());

        pageGrid.style.cssText += `
          display:grid !important;
          grid-template-columns:repeat(${PDF_GRID_COLUMNS},minmax(0,1fr)) !important;
          column-gap:${PDF_GRID_COLUMN_GAP_PX}px !important;
          row-gap:${PDF_GRID_ROW_GAP_PX}px !important;
          align-items:start !important;
          width:100% !important;
          box-sizing:border-box !important;
          background:#ffffff !important;
        `;

        controlHeaderFooter(page, includeHeader, true);
        collapseGridParents(page);
        document.body.appendChild(page);

        return { page, grid: pageGrid };
      };

      const renderDomPageCanvas = async (
        pageEl: HTMLElement,
        captureHeightCssPx: number,
      ) => {
        await waitMs(isIOS ? 150 : 50); // ── FIX iOS: dar tiempo al DOM antes de capturar

        if (isIOS) {
          prepareIosCaptureRoot(pageEl);

          const captureWithDomToImage = async (scale = 0.58, timeoutMs = 16000) => {
            updateProgress(76, "Renderizando página en iOS...");
            const dataUrl = await withTimeout(
              domtoimage.toJpeg(pageEl, {
                width: EXPORT_WIDTH_PX,
                height: captureHeightCssPx,
                bgcolor: "#ffffff",
                quality: jpegQuality,
                cacheBust: false,
                copyDefaultStyles: true,
                scale,
                style: {
                  width: `${EXPORT_WIDTH_PX}px`,
                  height: `${captureHeightCssPx}px`,
                  minHeight: "0",
                  maxHeight: `${captureHeightCssPx}px`,
                  overflow: "hidden",
                  backgroundColor: "#ffffff",
                  transform: "none",
                  WebkitTransform: "none",
                },
                filter: (node: Node) => {
                  const el = node as HTMLElement;
                  return el?.dataset?.pdfSkipBaseImage !== "true";
                },
                onclone: (clonedEl: HTMLElement) => {
                  clonedEl.style.visibility = "visible";
                  clonedEl.style.opacity = "1";
                  clonedEl.style.backgroundColor = "#ffffff";
                  clonedEl.style.width = `${EXPORT_WIDTH_PX}px`;
                  clonedEl.style.height = `${captureHeightCssPx}px`;
                  clonedEl.style.maxHeight = `${captureHeightCssPx}px`;
                  clonedEl.style.overflow = "hidden";
                  prepareIosCaptureRoot(clonedEl);
                },
              }),
              timeoutMs,
              "Tiempo agotado renderizando la pagina en iOS",
            );

            return await dataUrlToCanvas(dataUrl);
          };

          const buildIosOptions = (
            scale: number,
            imageTimeout: number,
            allowTaint: boolean,
          ): Parameters<typeof html2canvas>[1] => ({
            scale,
            useCORS: true,
            allowTaint,
            backgroundColor: "#ffffff",
            logging: false,
            width: EXPORT_WIDTH_PX,
            height: captureHeightCssPx,
            windowWidth: EXPORT_WIDTH_PX,
            windowHeight: captureHeightCssPx,
            scrollX: 0,
            scrollY: 0,
            removeContainer: true,
            imageTimeout,
            onclone: (_clonedDoc, clonedEl) => {
              clonedEl.style.visibility = "visible";
              clonedEl.style.opacity = "1";
              clonedEl.style.backgroundColor = "#ffffff";
              prepareIosCaptureRoot(clonedEl as HTMLElement);

              Array.from(clonedEl.querySelectorAll("*")).forEach((el) => {
                const htmlEl = el as HTMLElement;
                if (!htmlEl.style) return;
                if (htmlEl.dataset.pdfSkipBaseImage === "true") {
                  htmlEl.style.display = "none";
                  htmlEl.style.visibility = "hidden";
                  htmlEl.style.opacity = "0";
                  return;
                }
                if (htmlEl.style.visibility === "hidden")
                  htmlEl.style.visibility = "visible";
                if (htmlEl.style.opacity === "0") htmlEl.style.opacity = "1";
                htmlEl.style.animation = "none";
                htmlEl.style.transition = "none";
              });
            },
          });

          const captureIos = (
            options: Parameters<typeof html2canvas>[1],
            timeoutMs = 22000,
          ) =>
            withTimeout(
              html2canvas(pageEl, options),
              timeoutMs,
              "Tiempo agotado renderizando la pagina",
            );

          const attempts: Array<{
            label: string;
            run: () => Promise<HTMLCanvasElement>;
          }> = [
            {
              label: "dom-to-image iOS ligero",
              run: () => captureWithDomToImage(0.58, 16000),
            },
            {
              label: "dom-to-image iOS minimo",
              run: () => captureWithDomToImage(0.46, 14000),
            },
            {
              label: "html2canvas iOS base",
              run: () =>
                captureIos(
                  buildIosOptions(Math.min(canvasScale, 0.58), 3500, false),
                ),
            },
            {
              label: "html2canvas iOS ligero",
              run: () => captureIos(buildIosOptions(0.46, 1800, false), 18000),
            },
            {
              label: "html2canvas iOS minimo",
              run: () => captureIos(buildIosOptions(0.34, 1000, true), 15000),
            },
          ];

          let lastError: unknown = null;
          for (
            let attemptIndex = 0;
            attemptIndex < attempts.length;
            attemptIndex++
          ) {
            try {
              if (attemptIndex > 0) {
                updateProgress(77, "Reintentando renderizado en iOS...");
                await waitMs(450);
              }

              return await attempts[attemptIndex].run();
            } catch (error) {
              lastError = error;
              console.warn(`Fallo ${attempts[attemptIndex].label}:`, error);
            }
          }

          throw (
            lastError || new Error("No se pudo renderizar la pagina en iOS")
          );
        }

        return await html2canvas(pageEl, {
          scale: canvasScale,
          useCORS: true,
          allowTaint: false, // ── FIX iOS: false evita taint en Safari
          backgroundColor: "#ffffff",
          logging: false,
          width: EXPORT_WIDTH_PX,
          height: captureHeightCssPx,
          windowWidth: EXPORT_WIDTH_PX,
          windowHeight: captureHeightCssPx,
          scrollX: 0,
          scrollY: 0,
          removeContainer: true,
          imageTimeout: 8000, // ── FIX iOS: timeout explícito para imágenes
          onclone: (_clonedDoc, clonedEl) => {
            clonedEl.style.visibility = "visible";
            clonedEl.style.opacity = "1";
            clonedEl.style.backgroundColor = "#ffffff";

            Array.from(clonedEl.querySelectorAll("*")).forEach((el) => {
              const htmlEl = el as HTMLElement;
              if (!htmlEl.style) return;
              if (htmlEl.dataset.pdfSkipBaseImage === "true") {
                htmlEl.style.display = "none";
                htmlEl.style.visibility = "hidden";
                htmlEl.style.opacity = "0";
                return;
              }
              if (htmlEl.style.visibility === "hidden")
                htmlEl.style.visibility = "visible";
              if (htmlEl.style.opacity === "0") htmlEl.style.opacity = "1";
              htmlEl.style.animation = "none";
              htmlEl.style.transition = "none";
            });
          },
        });
      };

      const collectPageLinks = (page: HTMLElement): LinkArea[] => {
        const pageLinks: LinkArea[] = [];

        const normalizePdfUrl = (url: string) => {
          const value = (url || "").trim();
          if (!value || value === "#") return "";

          if (/^https?:\/\//i.test(value)) {
            try {
              const parsed = new URL(value);
              if (parsed.hostname.replace(/^www\./i, "") === "wa.me") {
                const phone = parsed.pathname.replace(/[^\d]/g, "");
                return phone
                  ? `https://api.whatsapp.com/send?phone=${phone}${parsed.search ? `&${parsed.search.slice(1)}` : ""}`
                  : value;
              }
            } catch {
              return value;
            }

            return value;
          }

          if (value.startsWith("www.")) return `https://${value}`;
          return value;
        };

        const pushPageLink = (el: HTMLElement, url: string) => {
          const normalizedUrl = normalizePdfUrl(url);
          if (!normalizedUrl) return;
          const pos = getPos(el, page);
          if (pos.width <= 0 || pos.height <= 0) return;
          if (el.matches('[data-pdf-link="social"]')) {
            const minTapSize = 44;
            const width = Math.max(pos.width, minTapSize);
            const height = Math.max(pos.height, minTapSize);
            pageLinks.push({
              url: normalizedUrl,
              left: Math.max(0, pos.left - (width - pos.width) / 2),
              top: Math.max(0, pos.top - (height - pos.height) / 2),
              width,
              height,
            });
            return;
          }

          pageLinks.push({ url: normalizedUrl, ...pos });
        };

        (
          Array.from(
            page.querySelectorAll('[data-pdf-link="product"]'),
          ) as HTMLElement[]
        ).forEach((el) => {
          const name = (el.dataset.productName || "").trim();
          const sku = (el.dataset.productSku || "").trim();
          const price = (el.dataset.productPrice || "").trim();

          if (!name) return;

          const productTitle = sku ? `${name} - ${sku}` : name;

          let url = (el as HTMLAnchorElement).getAttribute?.("href") || "";

          if (businessWa) {
            const msg = `Hola 👋, quiero hacer un pedido:\n• Producto: ${productTitle}\n• Precio: ${formatCurrency(
              Number(price || 0),
            )}`;

            url = `https://api.whatsapp.com/send?phone=${businessWa}&text=${encodeWaText(msg)}`;
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

        const socialEls = Array.from(
          page.querySelectorAll('[data-pdf-link="social"]'),
        ) as HTMLElement[];

        socialEls.forEach((el) => {
          const href = (el as HTMLAnchorElement).getAttribute?.("href") || "";
          const isWhatsapp = /wa\.me|whatsapp/i.test(href);
          const directUrl =
            isWhatsapp && businessWa
              ? `https://api.whatsapp.com/send?phone=${businessWa}`
              : href;
          pushPageLink(el, directUrl);
        });

        return pageLinks;
      };

      const collectProductImageAreas = async (
        page: HTMLElement,
      ): Promise<ProductImageArea[]> => {
        const pageTop = page.getBoundingClientRect().top;
        const pageLeft = page.getBoundingClientRect().left;

        const pageCards = Array.from(
          page.querySelectorAll(".product-pdf"),
        ) as HTMLElement[];

        const areas = await Promise.all(
          pageCards.map(async (card): Promise<ProductImageArea | null> => {
            try {
              const productId = String(card.dataset.productId || "");
              const product = productImageById.get(productId);
              if (!product) return null;

              const media = getPrimaryProductMediaEl(card);
              if (!media || !isElementVisibleForPdf(media)) return null;

              const pdfImage = await resolveProductPdfImageSrc(product);
              if (!pdfImage.src) return null;

              const imgEl = card.querySelector(
                "img",
              ) as HTMLImageElement | null;
              const imgRectRaw =
                imgEl && isElementVisibleForPdf(imgEl)
                  ? imgEl.getBoundingClientRect()
                  : null;
              const mediaRectRaw =
                imgRectRaw && imgRectRaw.width >= 12 && imgRectRaw.height >= 12
                  ? imgRectRaw
                  : media.getBoundingClientRect();
              const mediaRect = {
                left: mediaRectRaw.left,
                top: mediaRectRaw.top,
                width: mediaRectRaw.width,
                height: mediaRectRaw.height,
              };
              let topInset = 0;

              (
                Array.from(
                  media.querySelectorAll(
                    '[data-featured-badge="true"], [data-category-badge="true"], [data-stock-badge="true"]',
                  ),
                ) as HTMLElement[]
              ).forEach((badge) => {
                if (!isElementVisibleForPdf(badge)) return;
                const badgeRect = badge.getBoundingClientRect();
                const overlapsTop =
                  badgeRect.bottom > mediaRect.top &&
                  badgeRect.top < mediaRect.top + mediaRect.height * 0.45;

                if (overlapsTop) {
                  topInset = Math.max(
                    topInset,
                    badgeRect.bottom - mediaRect.top + 6,
                  );
                }
              });

              const sideInset = Math.max(8, Math.round(mediaRect.width * 0.08));
              const bottomInset = Math.max(
                8,
                Math.round(mediaRect.height * 0.08),
              );
              const width = Math.max(1, mediaRect.width - sideInset * 2);
              const height = Math.max(
                1,
                mediaRect.height - topInset - bottomInset,
              );
              if (width < 12 || height < 12) return null;

              return {
                productId,
                src: pdfImage.src,
                naturalWidth: pdfImage.naturalWidth,
                naturalHeight: pdfImage.naturalHeight,
                left: mediaRect.left - pageLeft + sideInset,
                top: mediaRect.top - pageTop + topInset,
                width,
                height,
              };
            } catch (error) {
              console.warn(
                "No se pudo preparar imagen de producto para PDF:",
                error,
              );
              return null;
            }
          }),
        );

        return areas.filter((area): area is ProductImageArea => !!area);
      };

      const hideProductImagesForBaseCapture = (
        page: HTMLElement,
        imageAreas: ProductImageArea[],
      ) => {
        const replaceableProductIds = new Set(
          imageAreas.map((area) => area.productId),
        );
        if (replaceableProductIds.size <= 0) return;

        (
          Array.from(page.querySelectorAll(".product-pdf")) as HTMLElement[]
        ).forEach((card) => {
          const productId = String(card.dataset.productId || "");
          if (!replaceableProductIds.has(productId)) return;

          (
            Array.from(card.querySelectorAll("img")) as HTMLImageElement[]
          ).forEach((img) => {
            img.dataset.pdfSkipBaseImage = "true";
            img.style.display = "none";
            img.style.visibility = "hidden";
            img.style.opacity = "0";
          });

          card.querySelectorAll(".absolute.inset-0").forEach((el) => {
            const htmlEl = el as HTMLElement;
            htmlEl.dataset.pdfSkipBaseImage = "true";
            htmlEl.style.display = "none";
            htmlEl.style.visibility = "hidden";
            htmlEl.style.opacity = "0";
          });
        });
      };

      const inlineProductImagesForBaseCapture = async (
        page: HTMLElement,
        imageAreas: ProductImageArea[],
      ) => {
        const imageByProductId = new Map(
          imageAreas.map((area) => [area.productId, area.src]),
        );
        if (imageByProductId.size <= 0) return;

        (
          Array.from(page.querySelectorAll(".product-pdf")) as HTMLElement[]
        ).forEach((card) => {
          const productId = String(card.dataset.productId || "");
          const src = imageByProductId.get(productId);
          if (!src) return;

          (
            Array.from(card.querySelectorAll("img")) as HTMLImageElement[]
          ).forEach((img) => {
            img.removeAttribute("data-pdf-skip-base-image");
            delete img.dataset.pdfSkipBaseImage;
            img.src = src;
            img.setAttribute("src", src);
            img.style.display = "block";
            img.style.visibility = "visible";
            img.style.opacity = "1";
            img.style.width = "auto";
            img.style.height = "auto";
            img.style.maxWidth = "100%";
            img.style.maxHeight = "100%";
            img.style.objectFit = "contain";
            img.style.objectPosition = "center";
            img.style.margin = "0 auto";
          });
        });

        await Promise.all(
          (
            Array.from(
              page.querySelectorAll(".product-pdf img"),
            ) as HTMLImageElement[]
          ).map((img) => waitLoad(img, 5000)),
        );
      };

      let pageIndex = 0;
      let rowIndex = 0;
      const totalPagesEstimate = Math.max(
        1,
        Math.ceil(cards.length / PDF_PRODUCTS_PER_PAGE),
      );

      updateProgress(75, `Renderizando página 1 de ${totalPagesEstimate}...`);

      while (rowIndex < rows.length) {
        const { page, grid } = makePage(pageIndex === 0);

        let rowsAdded = 0;
        let pageWasCompacted = false;
        let productsAddedOnPage = 0;

        while (rowIndex < rows.length) {
          if (rowsAdded >= PDF_ROWS_PER_PAGE) break;
          if (productsAddedOnPage >= PDF_PRODUCTS_PER_PAGE) break;

          const currentRow = rows[rowIndex];
          const remainingSlots = PDF_PRODUCTS_PER_PAGE - productsAddedOnPage;
          const rowCardsForPage = currentRow.cards.slice(0, remainingSlots);
          const leftoverRowCards = currentRow.cards.slice(remainingSlots);
          if (rowCardsForPage.length <= 0) break;

          const rowClones: HTMLElement[] = rowCardsForPage.map((card) => {
            const clonedCard = card.cloneNode(true) as HTMLElement;
            styleProductCardForPdf(clonedCard);
            return clonedCard;
          });

          rowClones.forEach((clonedCard) => grid.appendChild(clonedCard));

          await waitMs(isIOS ? 80 : 16); // ── FIX iOS: tiempo para recalcular layout

          collapseGridParents(page);
          let currentHeight = getPdfContentHeight(page, grid);

          if (currentHeight > pageHeightCssPx && rowsAdded > 0) {
            const fitted = await compactPageToFit(page, grid, pageHeightCssPx);
            currentHeight = getPdfContentHeight(page, grid);
            pageWasCompacted = true;

            if (!fitted || currentHeight > pageHeightCssPx) {
              rowClones.forEach((clonedCard) => clonedCard.remove());
              break;
            }
          }

          rowsAdded++;
          productsAddedOnPage += rowCardsForPage.length;

          if (leftoverRowCards.length > 0) {
            rows[rowIndex] = { ...currentRow, cards: leftoverRowCards };
            break;
          }

          rowIndex++;
        }

        controlHeaderFooter(page, pageIndex === 0, true);
        collapseGridParents(page);

        await waitMs(isIOS ? 200 : 50);
        const shouldExpandPageCards = !isMobile || pageIndex > 0;

        if (!pageWasCompacted && shouldExpandPageCards) {
          await expandPageToUseSpace(page, grid, pageHeightCssPx);
        }

        const contentHeightCssPx = Math.min(
          pageHeightCssPx,
          Math.max(1, getPdfContentHeight(page, grid) + 4),
        );

        page.style.minHeight = "0";
        page.style.height = `${contentHeightCssPx}px`;
        page.style.maxHeight = `${contentHeightCssPx}px`;
        page.style.overflow = "hidden";

        updateProgress(
          75 + (pageIndex / Math.max(1, totalPagesEstimate)) * 20,
          `Renderizando página ${pageIndex + 1}...`,
        );

        updateProgress(
          75 + (pageIndex / Math.max(1, totalPagesEstimate)) * 20,
          `Preparando imÃ¡genes de pÃ¡gina ${pageIndex + 1}...`,
        );

        const productImageAreas = await collectProductImageAreas(page);
        const shouldCaptureProductImagesInDom =
          isMobile && !isIOS && pageIndex === 0;
        let productImageOverlayAreas = shouldCaptureProductImagesInDom
          ? []
          : productImageAreas;

        if (shouldCaptureProductImagesInDom) {
          await inlineProductImagesForBaseCapture(page, productImageAreas);
        } else {
          hideProductImagesForBaseCapture(page, productImageAreas);
        }

        let pageCanvas: HTMLCanvasElement;
        try {
          pageCanvas = await renderDomPageCanvas(page, contentHeightCssPx);
        } catch (error) {
          if (!isIOS || !shouldCaptureProductImagesInDom) throw error;

          console.warn(
            "Reintentando primera pagina iOS con imagenes optimizadas:",
            error,
          );
          updateProgress(78, "Optimizando primera pagina en iOS...");
          productImageOverlayAreas = productImageAreas;
          hideProductImagesForBaseCapture(page, productImageAreas);
          await waitMs(500);
          pageCanvas = await renderDomPageCanvas(page, contentHeightCssPx);
        }

        const imgData = canvasToJpegDataUrl(pageCanvas, jpegQuality);
        const pageHmm = Math.min(usableHmm, contentHeightCssPx / cssPxPerMm);

        if (hasCustomCover || pageIndex > 0) pdf.addPage();

        // Centrado vertical de las páginas internas:
        // La primera página conserva el hero/header arriba.
        // Las demás páginas centran el bloque real de productos dentro del área útil A4,
        // evitando que cuando hay 1 o 2 tarjetas quede todo pegado arriba con mucho aire abajo.
        const pageYmm =
          pageIndex === 0
            ? PDF_MARGIN_MM
            : PDF_MARGIN_MM + Math.max(0, (usableHmm - pageHmm) / 2);

        pdf.addImage(
          imgData,
          "JPEG",
          PDF_MARGIN_MM,
          pageYmm,
          usableWmm,
          pageHmm,
          undefined,
          "FAST",
        );

        for (const imageArea of productImageOverlayAreas) {
          try {
            const naturalW = imageArea.naturalWidth || 1;
            const naturalH = imageArea.naturalHeight || 1;
            const areaWmm = imageArea.width / cssPxPerMm;
            const areaHmm = imageArea.height / cssPxPerMm;
            const imageRatio = naturalW / naturalH;
            const areaRatio = areaWmm / areaHmm;
            const drawWmm =
              imageRatio > areaRatio ? areaWmm : areaHmm * imageRatio;
            const drawHmm =
              imageRatio > areaRatio ? areaWmm / imageRatio : areaHmm;
            const drawXmm =
              PDF_MARGIN_MM +
              imageArea.left / cssPxPerMm +
              (areaWmm - drawWmm) / 2;
            const drawYmm =
              pageYmm + imageArea.top / cssPxPerMm + (areaHmm - drawHmm) / 2;

            pdf.addImage(
              imageArea.src,
              getImageFormatForPdf(imageArea.src),
              drawXmm,
              drawYmm,
              drawWmm,
              drawHmm,
              undefined,
              "FAST",
            );
          } catch (error) {
            console.warn(
              "No se pudo superponer imagen de producto en PDF:",
              error,
            );
          }
        }

        const pageLinkAreas = collectPageLinks(page);
        for (const la of pageLinkAreas) {
          pdf.link(
            PDF_MARGIN_MM + la.left / cssPxPerMm,
            pageYmm + la.top / cssPxPerMm,
            la.width / cssPxPerMm,
            la.height / cssPxPerMm,
            { url: la.url },
          );
        }

        // ── FIX iOS: liberar canvas inmediatamente para recuperar memoria ──
        pageCanvas.width = 1;
        pageCanvas.height = 1;

        page.remove();
        pageIndex++;

        updateProgress(
          75 + (pageIndex / Math.max(1, totalPagesEstimate)) * 20,
          `Página ${pageIndex} lista...`,
        );

        // ── FIX iOS: pausa entre páginas para que Safari libere memoria del canvas ──
        if (isIOS) await waitMs(300);
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

  const downloadBlob = async (
    blob: Blob,
    outName: string,
    opts: { preferNativeShare?: boolean } = {},
  ) => {
    const preferNativeShare = opts.preferNativeShare ?? true;
    // 1) Móvil: Web Share API (más confiable en iOS y Android)
    if (
      preferNativeShare &&
      isMobile &&
      typeof navigator.share === "function"
    ) {
      const file = new File([blob], outName, { type: "application/pdf" });
      const canShare = canSharePdfFile(file);

      if (canShare) {
        try {
          await sharePdfFileNow(
            file,
            "Catalogo PDF",
            "Te comparto el catalogo en PDF",
          );
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
          // Continúa con fallback
        }
      }
    }

    if (isIOS) {
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }

    // 2) Fallback: data URL base64 (evita el visor nativo de Android/iOS)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = outName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 500);
      return;
    } catch {
      // Continúa con último fallback
    }

    // 3) Último fallback: object URL clásico
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const prepareMobilePdfAction = (
    blob: Blob,
    outName: string,
    title = "Catalogo",
    text = "Te comparto el catalogo en PDF",
  ) => {
    const file = new File([blob], outName, { type: "application/pdf" });
    setSharedFileName(outName);
    setPendingShareFile(file);
    setPendingShareTitle(title);
    setPendingShareText(text);
    setShowNativeShareReady(true);
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
      setProgressText(isMobile ? "PDF listo..." : "Descargando PDF...");

      if (isMobile) {
        prepareMobilePdfAction(blob, outName);
      } else {
        await downloadBlob(blob, outName);
      }
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
      setProgressText(isMobile ? "PDF listo..." : "Descargando PDF...");

      if (isMobile) {
        prepareMobilePdfAction(
          blob,
          outName,
          `Catalogo - ${selectedCategory}`,
          `Te comparto el catalogo de ${selectedCategory} en PDF`,
        );
      } else {
        await downloadBlob(blob, outName);
      }
    } catch (error) {
      console.error(error);
      alert("Error generando/descargando PDF por categoría.");
    } finally {
      resetProgressLater();
    }
  };

  const openWhatsApp = () => {
    const message = encodeURIComponent(
      `Hola, te comparto el catálogo PDF${selectedCategory !== "__ALL__" ? ` de la categoría ${selectedCategory}` : ""} 📄`,
    );

    if (isMobile) {
      window.location.href = `whatsapp://send?text=${message}`;

      // Fallback por si el navegador no abre el esquema whatsapp://
      window.setTimeout(() => {
        window.open(
          `https://wa.me/?text=${message}`,
          "_blank",
          "noopener,noreferrer",
        );
      }, 900);
      return;
    }

    window.open(
      `https://web.whatsapp.com/send?text=${message}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const isUserGestureError = (error: any) => {
    return (
      error?.name === "NotAllowedError" ||
      String(error?.message || error || "")
        .toLowerCase()
        .includes("user gesture")
    );
  };

  const canSharePdfFile = (file: File) => {
    return (
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" ||
        navigator.canShare({ files: [file] }))
    );
  };

  const sharePdfFileNow = async (file: File, title: string, text: string) => {
    // Este método debe llamarse directamente desde un onClick cuando el PDF ya existe.
    // Así Android/Chrome conserva el gesto del usuario y WhatsApp recibe el PDF adjunto.
    await navigator.share({
      title,
      text,
      files: [file],
    });
  };

  const handleSharePreparedPdf = async () => {
    if (!pendingShareFile) return;

    try {
      if (canSharePdfFile(pendingShareFile)) {
        await sharePdfFileNow(
          pendingShareFile,
          pendingShareTitle,
          pendingShareText,
        );
      } else {
        await downloadBlob(pendingShareFile, pendingShareFile.name, {
          preferNativeShare: false,
        });
      }

      setShowNativeShareReady(false);
      setPendingShareFile(null);
    } catch (error: any) {
      if (error?.name === "AbortError") return;

      console.error(error);
      alert(
        `No se pudo abrir el compartir con PDF adjunto. Intenta tocar de nuevo el botón.\n\nDetalle: ${error?.name ?? ""}: ${error?.message ?? String(error)}`,
      );
    }
  };

  const handleShareWhatsApp = async () => {
    try {
      setLoading(true);
      setProgress(1);
      setProgressText("Preparando PDF para compartir...");

      const categoryToShare =
        selectedCategory !== "__ALL__" ? selectedCategory : undefined;

      const outBase = categoryToShare
        ? `${fileName}-${slug(categoryToShare)}`
        : fileName;

      const { blob, fileName: fn } = await generatePdf({
        category: categoryToShare,
        overrideFileName: outBase,
        quality,
      });

      const file = new File([blob], fn, { type: "application/pdf" });
      const shareTitle = categoryToShare
        ? `Catálogo - ${categoryToShare}`
        : "Catálogo";
      const shareText = categoryToShare
        ? `Te comparto el catálogo de ${categoryToShare} en PDF`
        : "Te comparto el catálogo en PDF";

      setSharedFileName(fn);
      setPendingShareFile(file);
      setPendingShareTitle(shareTitle);
      setPendingShareText(shareText);

      setProgress(100);
      setProgressText("PDF listo para compartir...");

      if (isMobile && canSharePdfFile(file)) {
        try {
          await sharePdfFileNow(file, shareTitle, shareText);
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") return;

          if (isUserGestureError(shareErr)) {
            setShowNativeShareReady(true);
            return;
          }
          console.warn("share() falló, usando fallback:", shareErr);
          setShowNativeShareReady(true);
          return;
        }
      }

      setProgressText("Descargando PDF...");
      await downloadBlob(blob, fn);
      setShowShareInstructions(true);
    } catch (error: any) {
      if (error?.name === "AbortError") return;
      console.error(error);
      alert(
        `Error generando el PDF. Intenta de nuevo.\n\nDetalle: ${error?.name ?? ""}: ${error?.message ?? String(error)}`,
      );
    } finally {
      resetProgressLater();
    }
  };

  return (
    <>
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

      {showNativeShareReady && pendingShareFile && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 px-4 pb-8"
          onClick={() => setShowNativeShareReady(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-xl">
                📎
              </div>
              <div>
                <p className="font-bold text-slate-800 text-base leading-tight">
                  PDF listo
                </p>
                <p className="text-xs text-slate-400">{sharedFileName}</p>
              </div>
            </div>

            <p className="text-sm text-slate-500 mb-4">
              Toca el botón de abajo. Se abrirá el compartir del celular;
              selecciona WhatsApp u otra app, elige la persona o grupo y el PDF
              ira adjunto.
            </p>

            <button
              onClick={handleSharePreparedPdf}
              className="w-full h-12 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] transition mb-2"
            >
              Compartir PDF
            </button>

            <button
              onClick={async () => {
                if (pendingShareFile) {
                  await downloadBlob(pendingShareFile, pendingShareFile.name, {
                    preferNativeShare: false,
                  });
                  setShowNativeShareReady(false);
                  setShowShareInstructions(true);
                }
              }}
              className="w-full h-10 rounded-xl text-sm text-slate-500 hover:text-slate-700 transition mb-1"
            >
              Abrir o descargar PDF
            </button>

            <button
              onClick={() => setShowNativeShareReady(false)}
              className="w-full h-10 rounded-xl text-sm text-slate-400 hover:text-slate-600 transition"
            >
              Cerrar
            </button>
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
                openWhatsApp();
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
                  className={`px-3 py-1.5 transition ${
                    quality === "normal"
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Normal
                </button>
                <button
                  onClick={() => setQuality("alta")}
                  disabled={loading}
                  className={`px-3 py-1.5 transition ${
                    quality === "alta"
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
