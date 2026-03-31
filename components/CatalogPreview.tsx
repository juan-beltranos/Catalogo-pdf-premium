import React, { useMemo } from 'react';
import { Product, StoreInfo } from '../types';
import { formatCurrency } from '../constants';
import { Phone, Facebook, Instagram, MessageCircle } from 'lucide-react';
import { ProductThumb } from './ProductThumb';
import {
  facebookUrl,
  instagramUrl,
  facebookLabel,
  instagramLabel,
  normalizeWaNumber,
} from '@/helper/social';
import {
  getProductCardTheme,
  getProductCardInlineStyles,
  CatalogTemplateId,
} from '@/helper/productCardStyles';

interface CatalogPreviewProps {
  storeInfo: StoreInfo;
  products: Product[];
  previewRef: React.RefObject<HTMLDivElement | null>;
  productsOverride?: Product[];
}

export const CatalogPreview: React.FC<CatalogPreviewProps> = ({
  storeInfo,
  products,
  previewRef,
  productsOverride,
}) => {
  const {
    templateId = 'minimalist',
    color: primaryColor = '#3b82f6',
    showQuantityInPdf = false,
  } = storeInfo;

  const isMinimalist = templateId === 'minimalist';
  const isClassic = templateId === 'classic';
  const isModern = templateId === 'modern';

  const sourceProducts = productsOverride ?? products;

  const orderedProducts = useMemo(() => {
    const arr = [...sourceProducts].filter((p) => !p.hidden);

    arr.sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : Number(a.id);
      const bo = typeof b.order === 'number' ? b.order : Number(b.id);
      return ao - bo;
    });

    return arr;
  }, [sourceProducts]);

  const wa = useMemo(
    () => normalizeWaNumber(storeInfo.whatsapp || '', '57'),
    [storeInfo.whatsapp]
  );

  const buildWaLink = (product: Product) => {
    const text =
      `Hola 👋, quiero hacer un pedido:\n` +
      `• Producto: ${product.name}\n` +
      `• Precio: ${formatCurrency(product.price)}\n` +
      `¿Me confirmas disponibilidad y tiempo de entrega?`;

    return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
  };

  const theme = getProductCardTheme(templateId as CatalogTemplateId, primaryColor);
  const inlineTheme = getProductCardInlineStyles(
    templateId as CatalogTemplateId,
    primaryColor
  );

  return (
    <div className="flex justify-center w-full min-h-screen p-4 md:p-8 bg-slate-200/30">
      <div
        ref={previewRef}
        id="catalog-capture-area"
        className={`bg-white w-full max-w-[800px] overflow-hidden text-slate-900 flex flex-col ${isModern ? 'rounded-[2rem]' : isMinimalist ? 'rounded-none' : 'rounded-lg'
          }`}
        style={{
          minHeight: '1120px',
          ['--brand-color' as any]: storeInfo.color || '#f97316',
        }}
      >
        <style>{`
          .product-pdf {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          @media print {
            .product-pdf {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }

          @media print {
            .products-grid {
              display: block;
            }

            .product-pdf {
              width: 48%;
              display: inline-block;
              vertical-align: top;
              margin-bottom: 24px;
            }
          }

          .catalog-html p { margin: 0.25rem 0; font-size: 15px; }
          .catalog-html strong { font-weight: 700; }
          .catalog-html em { font-style: italic; }

          .catalog-html ul {
            list-style: disc;
            padding-left: 1.1rem;
            margin: 0.25rem 0;
          }

          .catalog-html ol {
            list-style: decimal;
            padding-left: 1.1rem;
            margin: 0.25rem 0;
          }

          .catalog-html li { margin: 0.1rem 0; }

          .catalog-html table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 0.5rem;
            font-size: 11px;
          }

          .catalog-html th,
          .catalog-html td {
            border: 1px solid #e5e7eb;
            padding: 6px 8px;
            text-align: left;
            vertical-align: top;
          }

          .catalog-html th {
            background: var(--brand-color);
            color: white;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 10px;
          }

          .catalog-html tr:nth-child(even) td {
            background: #f8fafc;
          }

          .pdf-mode .products-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            column-gap: 18px !important;
            row-gap: 24px !important;
          }

          .pdf-mode .product-pdf {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .pdf-mode [data-price-inline="true"] {
            display: inline-flex !important;
            visibility: visible !important;
            opacity: 1 !important;
          }

        .pdf-mode .product-media img {
          max-width: 100% !important;
          max-height: 100% !important;
          width: auto !important;
          height: auto !important;
          object-fit: contain !important;
          object-position: center !important;
          display: block !important;
          margin: 0 auto !important;
        }

        .pdf-mode img {
          max-width: 100% !important;
          max-height: 100% !important;
          width: auto !important;
          height: auto !important;
          object-fit: contain !important;
          object-position: center !important;
          display: block !important;
          margin: 0 auto !important;
        }

        .pdf-mode .product-pdf img {
          max-width: 100% !important;
          max-height: 100% !important;
          width: auto !important;
          height: auto !important;
          object-fit: contain !important;
          object-position: center !important;
          display: block !important;
          margin: 0 auto !important;
        }

      .pdf-mode .product-media {
        aspect-ratio: unset !important;
        height: 500px !important;
        min-height: 500px !important;
        max-height: 500px !important;
      }

          .pdf-mode .product-pdf h3 {
            font-size: 24px !important;
            line-height: 1.15 !important;
          }

          .pdf-mode .product-pdf .catalog-html,
        .pdf-mode .product-pdf [class*="description"] {
          font-size: 18px !important;
          line-height: 1.6 !important;
          margin-top: 6px !important;
        }

          .pdf-mode a[data-pdf-link="product"] {
            pointer-events: none !important;
          }

          .pdf-mode [data-price-inline="true"],
          .pdf-mode [data-category-badge="true"] {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            vertical-align: top !important;
            line-height: 1 !important;
            box-sizing: border-box !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            white-space: nowrap !important;
          }

          .pdf-mode [data-price-inline="true"] > span,
          .pdf-mode [data-category-badge="true"] > span {
            display: block !important;
            line-height: 1 !important;
          }
        `}</style>

        <div
          className={`px-4 py-6 md:p-10 relative overflow-hidden ${isMinimalist ? 'bg-white text-slate-900 border-b border-slate-100' : 'text-white'
            }`}
          style={!isMinimalist ? { backgroundColor: primaryColor } : {}}
        >
          <div
            className={`flex flex-col md:flex-row justify-between items-center gap-6 relative z-10 ${isClassic ? 'text-center md:text-left' : ''
              }`}
          >
            <div className={`flex items-center gap-6 ${isClassic ? 'flex-col md:flex-row' : ''}`}>
              {storeInfo.logo && (
                <div
                  className={`${isModern
                    ? 'w-24 h-24 rounded-2xl'
                    : isMinimalist
                      ? 'w-16 h-16 rounded-none border border-slate-200'
                      : 'w-20 h-20 rounded-xl border border-white/30'
                    } bg-white p-2 border border-slate-200 flex items-center justify-center`}
                >
                  <img
                    src={storeInfo.logo}
                    alt="Logo"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}
              <div
                className={`flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 relative z-10 ${isClassic ? 'text-center md:text-left' : ''
                  }`}
              >
                <h1
                  className={`font-extrabold uppercase tracking-tight ${isMinimalist ? 'text-xl md:text-2xl text-slate-900' : 'text-2xl md:text-4xl'
                    } ${isClassic ? 'font-serif tracking-[0.12em]' : ''}`}
                >
                  {storeInfo.name || 'Mi Catálogo'}
                </h1>
              </div>
            </div>

            <div className="flex flex-col items-center md:items-end gap-3">
              {(storeInfo.whatsapp || storeInfo.facebook || storeInfo.instagram) && (
                <div
                  className={`flex items-center gap-3 ${isMinimalist ? 'text-slate-600' : 'text-white'
                    }`}
                >
                  {storeInfo.whatsapp && (
                    <a
                      href={`https://wa.me/${wa}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="WhatsApp"
                      title="WhatsApp"
                      data-pdf-link="social"
                      className={`p-2 rounded-full transition-colors ${isMinimalist ? 'hover:bg-slate-100' : 'hover:bg-white/15'
                        }`}
                    >
                      <MessageCircle className="w-5 h-5" />
                    </a>
                  )}

                  {storeInfo.facebook && (
                    <a
                      data-pdf-link="social"
                      href={facebookUrl(storeInfo.facebook)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Facebook"
                      title={facebookLabel(storeInfo.facebook)}
                      className={`p-2 rounded-full transition-colors ${isMinimalist ? 'hover:bg-slate-100' : 'hover:bg-white/15'
                        }`}
                    >
                      <Facebook className="w-5 h-5" />
                    </a>
                  )}

                  {storeInfo.instagram && (
                    <a
                      data-pdf-link="social"
                      href={instagramUrl(storeInfo.instagram)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Instagram"
                      title={instagramLabel(storeInfo.instagram)}
                      className={`p-2 rounded-full transition-colors ${isMinimalist ? 'hover:bg-slate-100' : 'hover:bg-white/15'
                        }`}
                    >
                      <Instagram className="w-5 h-5" />
                    </a>
                  )}
                </div>
              )}

              {storeInfo.whatsapp && (
                <div
                  className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold ${isMinimalist
                    ? 'bg-slate-100 text-slate-900 border border-slate-200'
                    : 'bg-white text-slate-900 border border-white/40'
                    }`}
                >
                  <Phone className="w-4 h-4" />
                  <span data-store-whatsapp="true">{wa}</span>
                </div>
              )}
            </div>
          </div>

          {!isMinimalist && !isModern && (
            <div className="absolute -bottom-6 left-0 right-0 h-12 bg-white rounded-t-[3rem]" />
          )}
        </div>

        {storeInfo.whatsapp && (
          <div
            className={`px-4 md:px-10 py-2 border-b ${isMinimalist
              ? 'bg-white border-slate-100 text-slate-500'
              : isClassic
                ? 'bg-stone-50 border-stone-100 text-stone-600'
                : 'bg-slate-50 border-slate-100 text-slate-600'
              }`}
          >
            <div className="flex items-center justify-center gap-2 text-xs">
              <MessageCircle className="w-4 h-4 text-green-600" />
              <span>Toca cualquier producto para pedirlo por WhatsApp</span>
            </div>
          </div>
        )}

        <div className="px-4 py-6 md:p-10 md:pt-4 flex-grow">
          <div
            className={`products-grid grid grid-cols-1 md:grid-cols-2 ${isMinimalist ? 'gap-x-7 gap-y-8' : 'gap-x-5 gap-y-6'
              }`}
          >
            {orderedProducts.map((product) => {
              const waLink = storeInfo.whatsapp ? buildWaLink(product) : '#';

              return (
                <a
                  key={product.id}
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${theme.card} product-pdf`}
                  style={{ textDecoration: 'none' }}
                  data-category={(product.category || 'Sin categoría').trim()}
                  data-pdf-link="product"
                  data-product-name={product.name}
                  data-product-price={String(product.price ?? '')}
                  title="Haz clic para pedir por WhatsApp"
                >
                  <div className={theme.mediaWrap}>
                    <div className={theme.mediaInner}>
                      {product.featured && (
                        <div
                          data-featured-badge="true"
                          className={theme.featuredBadge}
                          style={inlineTheme.featuredStyle}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            style={{ display: 'block' }}
                          >
                            <path
                              d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                              fill="#ffffff"
                            />
                          </svg>
                        </div>
                      )}

                      {product.category && (
                        <div data-category-badge="true" className={theme.categoryBadge} style={inlineTheme.categoryBadgeStyle}>
                          <span style={{ display: 'block', lineHeight: 1, paddingTop: '1px' }}>{product.category}</span>
                        </div>
                      )}

                      {(product.image || product.imageId) ? (
                        <ProductThumb
                          product={product}
                          className={`${theme.image} !w-full !h-full !object-contain`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-300">
                          <span className="text-4xl font-bold">Sin Foto</span>
                        </div>
                      )}

                    </div>
                  </div>

                  <div className={theme.body}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div
                        data-price-inline="true"
                        className={theme.priceInline}
                        style={inlineTheme.priceStyle}
                      >
                        <span>{formatCurrency(product.price)}</span>
                      </div>

                      {showQuantityInPdf && (product.quantity ?? 0) > 0 && (
                        <span className={theme.stockBadge} data-stock-badge="true">
                          Stock: <span>{product.quantity}</span>
                        </span>
                      )}
                    </div>

                    <h3 className={theme.title}>{product.name}</h3>

                    {product.description && (
                      <div
                        className={`${theme.description} catalog-html break-words whitespace-normal overflow-x-auto`}
                        style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                        dangerouslySetInnerHTML={{ __html: product.description }}
                      />
                    )}

                    {storeInfo.whatsapp && (
                      <div className={theme.actionHintWrap}>
                        <div className={theme.actionHint} style={inlineTheme.actionStyle} data-action-hint="true">
                          <span className="inline-flex items-center gap-2">
                            <MessageCircle className="w-3 h-3 text-green-600" />
                            {isMinimalist
                              ? 'Pedir por WhatsApp'
                              : isClassic
                                ? 'Comprar'
                                : 'Comprar Ahora'}
                          </span>
                        </div>
                      </div>
                    )}

                    {theme.footerLine && (
                      <div
                        className={theme.footerLine}
                        style={inlineTheme.footerLineStyle}
                      />
                    )}
                  </div>
                </a>
              );
            })}
          </div>

          {orderedProducts.length === 0 && (
            <div className="py-32 text-center text-slate-300">
              <p className="text-xl font-light italic">
                Tu catálogo cobra vida aquí. Agrega productos para comenzar.
              </p>
            </div>
          )}
        </div>

        <div
          className={`mt-auto px-4 py-6 md:p-10 border-t border-slate-50 ${isClassic ? 'bg-stone-50/70' : ''
            }`}
        >
          <div className="flex flex-col gap-4">
            {(storeInfo.whatsapp || storeInfo.facebook || storeInfo.instagram) && (
              <div className="flex flex-wrap justify-center items-center gap-6 text-slate-600 text-xs font-medium">
                {storeInfo.whatsapp && (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-pdf-link="social"
                    className="flex items-center gap-2 hover:text-green-600 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{wa}</span>
                  </a>
                )}

                {storeInfo.facebook && (
                  <a
                    data-pdf-link="social"
                    href={facebookUrl(storeInfo.facebook)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                  >
                    <Facebook className="w-4 h-4" />
                    <span className="break-all">{facebookLabel(storeInfo.facebook)}</span>
                  </a>
                )}

                {storeInfo.instagram && (
                  <a
                    data-pdf-link="social"
                    href={instagramUrl(storeInfo.instagram)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-pink-600 transition-colors"
                  >
                    <Instagram className="w-4 h-4" />
                    <span className="break-all">{instagramLabel(storeInfo.instagram)}</span>
                  </a>
                )}
              </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-slate-400 text-[10px] uppercase tracking-widest font-medium">
              <p>
                © {new Date().getFullYear()} {storeInfo.name || 'Empresa'}
              </p>
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <p>Diseño: {templateId}</p>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <p>Catálogo - Intelia SB</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};