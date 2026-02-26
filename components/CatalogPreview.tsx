import React, { useMemo } from 'react';
import { Product, StoreInfo } from '../types';
import { formatCurrency } from '../constants';
import { Phone, Facebook, Instagram, MessageCircle } from 'lucide-react';
import { ProductThumb } from './ProductThumb';
import { facebookUrl, instagramUrl, facebookLabel, instagramLabel } from '@/helper/social';


interface CatalogPreviewProps {
  storeInfo: StoreInfo;
  products: Product[];
  previewRef: React.RefObject<HTMLDivElement>;
  productsOverride?: Product[];
}

export const CatalogPreview: React.FC<CatalogPreviewProps> = ({
  storeInfo,
  products,
  previewRef,
  productsOverride,
}) => {
  const { templateId = 'minimalist', color: primaryColor = '#3b82f6', showQuantityInPdf = false } = storeInfo;

  // Template-specific styles
  const isMinimalist = templateId === 'minimalist';
  const isClassic = templateId === 'classic';
  const isModern = templateId === 'modern';

  const sourceProducts = productsOverride ?? products;

  const orderedProducts = useMemo(() => {
    const arr = [...sourceProducts]
      .filter((p) => !p.hidden);

    arr.sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : Number(a.id);
      const bo = typeof b.order === 'number' ? b.order : Number(b.id);
      return ao - bo;
    });

    return arr;
  }, [sourceProducts]);


  return (
    <div className="flex justify-center w-full min-h-screen p-4 md:p-8 bg-slate-200/30">
      <div
        ref={previewRef}
        id="catalog-capture-area"
        className={`bg-white w-[800px] shadow-2xl overflow-hidden text-slate-900 flex flex-col ${isModern ? 'rounded-[2.5rem]' : isMinimalist ? 'rounded-none' : 'rounded-lg'
          }`}
        style={{
          minHeight: '1120px',
          width: '800px',
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

  /* TEXTO */
  .catalog-html p { margin: 0.25rem 0; }
  .catalog-html strong { font-weight: 700; }
  .catalog-html em { font-style: italic; }

  /* LISTAS */
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

  /* TABLAS (CLAVE) */
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
         /* ====== SOLO PDF (html2canvas NO respeta @media print) ====== */
  .pdf-mode .products-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    column-gap: 0 !important;         /* si quieres exacto como tailwind gap-x-?? */
    row-gap: 3rem !important;         /* gap-y-12 = 3rem */
  }

  /* Evitar cortes */
  .pdf-mode .product-pdf {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  /* Precios: siempre tag y nunca móvil */
  .pdf-mode [data-price-mobile="true"] {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .pdf-mode [data-price-tag="true"] {
    display: flex !important;
    position: absolute !important;
    right: 70% !important;
    bottom: 10px !important;
    z-index: 999 !important;
  }

.pdf-mode .product-media img {
  max-width: 75% !important;  
  max-height: 75% !important;
  width: auto !important;
  height: auto !important;
}
.pdf-mode img {
  max-width: 100% !important;
  max-height: 100% !important;
  width: auto !important;
  height: auto !important;
  object-fit: contain !important;
  object-position: center !important;
  display: block !important;
}
`}</style>

        {/* Header Section */}
        <div
          className={`p-10 relative overflow-hidden ${isMinimalist ? 'bg-white !text-slate-900 border-b border-slate-100' : 'text-white'
            }`}
          style={!isMinimalist ? { backgroundColor: primaryColor } : {}}
        >
          {isModern && (
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
          )}

          <div
            className={`flex flex-col md:flex-row justify-between items-center gap-6 relative z-10 ${isClassic ? 'text-center md:text-left' : ''
              }`}
          >
            <div className={`flex items-center gap-6 ${isClassic ? 'flex-col md:flex-row' : ''}`}>
              {storeInfo.logo && (
                <div
                  className={`${isModern
                    ? 'w-24 h-24 rounded-3xl rotate-3'
                    : isMinimalist
                      ? 'w-16 h-16 rounded-none border border-slate-200'
                      : 'w-20 h-20 rounded-2xl'
                    } bg-white p-2 shadow-lg flex items-center justify-center`}
                >
                  <img src={storeInfo.logo} alt="Logo" className="max-w-full max-h-full object-contain" />
                </div>
              )}
              <div>
                <h1
                  className={`font-extrabold uppercase tracking-tight ${isMinimalist ? 'text-2xl' : 'text-4xl'
                    } ${isClassic ? 'font-serif tracking-widest' : ''}`}
                >
                  {storeInfo.name || 'Mi Catálogo'}
                </h1>
                <p className={`opacity-90 font-medium ${isMinimalist ? 'text-slate-400' : 'text-white/80'}`}>
                  {isClassic ? 'Catálogo de Exclusividad' : 'Catálogo de Productos'}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-center md:items-end gap-3">
              {/* ICONOS (solo iconos) */}
              {(storeInfo.whatsapp || storeInfo.facebook || storeInfo.instagram) && (
                <div
                  className={`flex items-center gap-3 ${isMinimalist ? 'text-slate-600' : 'text-white'}`}
                >
                  {/* WhatsApp */}
                  {storeInfo.whatsapp && (
                    <a
                      href={`https://wa.me/${storeInfo.whatsapp}`}
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
                      className={`p-2 rounded-full transition-colors ${isMinimalist ? "hover:bg-slate-100" : "hover:bg-white/15"
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
                      className={`p-2 rounded-full transition-colors ${isMinimalist ? "hover:bg-slate-100" : "hover:bg-white/15"
                        }`}
                    >
                      <Instagram className="w-5 h-5" />
                    </a>
                  )}

                </div>
              )}

              {/* Mantener tu badge con número (opcional) */}
              {storeInfo.whatsapp && (
                <div
                  className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold ${isMinimalist
                    ? 'bg-slate-100 text-slate-900 border border-slate-200'
                    : 'bg-black/20 text-white border border-white/20'
                    } backdrop-blur-md`}
                >
                  <Phone className="w-4 h-4" />
                  <span data-store-whatsapp="true">{storeInfo.whatsapp}</span>
                </div>
              )}
            </div>
          </div>

          {!isMinimalist && !isModern && <div className="absolute -bottom-6 left-0 right-0 h-12 bg-white rounded-t-[3rem]" />}
        </div>

        {/* Products Grid Area */}
        <div className={`p-10 flex-grow ${isMinimalist ? 'pt-8' : isModern ? 'pt-12' : 'pt-6'}`}>
          <div className="products-grid grid grid-cols-2 gap-y-12">
            {orderedProducts.map((product) => (
              <div
                key={product.id}
                className={`flex flex-col gap-4 group product-pdf ${isClassic ? 'items-center text-center' : ''}`}
                data-category={(product.category || 'Sin categoría').trim()}
                data-pdf-link="product"
                data-product-name={product.name}
                data-product-price={String(product.price ?? '')}
              >
                <div
                  className={`product-media aspect-[4/3] w-full overflow-hidden shadow-sm relative flex items-center justify-center ${isModern
                    ? 'rounded-[2rem]'
                    : isMinimalist
                      ? 'rounded-none border border-slate-100'
                      : 'rounded-2xl border border-slate-100'
                    }`}
                >
                  {product.featured && (
                    <div
                      data-featured-badge="true"
                      className="absolute top-3 right-3 z-10 flex items-center justify-center
                      w-8 h-8 rounded-full
                      bg-yellow-400 shadow-md"
                      style={{
                        border: "2px solid #fff",
                      }}
                    >
                      {/* ✅ SVG estrella (no texto) */}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        style={{ display: "block" }}
                      >
                        <path
                          d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                          fill="#ffffff"
                        />
                      </svg>
                    </div>
                  )}


                  {(product.image || product.imageId) ? (
                    <ProductThumb product={product} className="max-w-[200px] max-h-full object-contain mx-auto block" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-200">
                      <span className="text-4xl font-bold">Sin Foto</span>
                    </div>
                  )}

                  {/* Price Tag (solo desktop) */}
                  <div
                    data-price-tag="true"
                    className={`hidden sm:flex absolute bottom-3 px-4 py-2 font-bold shadow-lg ${isModern
                      ? 'bg-white rounded-2xl text-slate-900'
                      : isMinimalist
                        ? 'bg-slate-900 text-white rounded-none'
                        : 'bg-white rounded-full text-slate-900'
                      }`}
                  >
                    {formatCurrency(product.price)}
                  </div>
                </div>

                {/* PRICE (solo móvil) */}
                <div
                  data-price-mobile="true"
                  className={`sm:hidden -mt-1 font-bold ${isClassic ? 'text-center' : 'text-left'} ${isMinimalist
                    ? 'text-sm uppercase tracking-wide text-slate-900'
                    : isModern
                      ? 'text-lg text-slate-900'
                      : 'text-base text-slate-800'
                    }`}
                >
                  {formatCurrency(product.price)}
                </div>

                <div className={isClassic ? 'px-2' : ''}>
                  <h3
                    className={`font-bold text-slate-900 leading-tight ${isMinimalist ? 'text-base uppercase tracking-wider' : 'text-xl'
                      } ${isClassic ? 'font-serif' : ''}`}
                  >
                    {product.name}
                  </h3>
                  {showQuantityInPdf && (product.quantity ?? 0) > 0 && (
                    <div className={`mt-1 text-slate-600 ${isMinimalist ? 'text-[10px]' : 'text-xs'}`}>
                      Stock : <span className="font-semibold">{product.quantity}</span>
                    </div>
                  )}

                  {product.description && (
                    <div
                      className={`mt-2 text-slate-500 leading-relaxed ${isMinimalist ? 'text-[10px]' : 'text-xs'
                        } catalog-html break-words whitespace-normal overflow-x-auto`}
                      style={{
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                      }}
                      dangerouslySetInnerHTML={{ __html: product.description }}
                    />
                  )}

                  {isClassic && <div className="w-10 h-[1px] bg-slate-200 mx-auto mt-4" />}
                </div>
              </div>
            ))}
          </div>

          {orderedProducts.length === 0 && (
            <div className="py-32 text-center text-slate-300">
              <p className="text-xl font-light italic">
                Tu catálogo cobra vida aquí. Agrega productos para comenzar.
              </p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className={`mt-auto p-10 border-t border-slate-50 ${isClassic ? 'bg-slate-50/50' : ''}`}>
          <div className="flex flex-col gap-4">

            {/* Redes Sociales */}
            {(storeInfo.whatsapp || storeInfo.facebook || storeInfo.instagram) && (
              <div className="flex flex-wrap justify-center items-center gap-6 text-slate-600 text-xs font-medium">

                {/* WhatsApp */}
                {storeInfo.whatsapp && (
                  <a
                    href={`https://wa.me/${storeInfo.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-pdf-link="social"
                    className="flex items-center gap-2 hover:text-green-600 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{storeInfo.whatsapp}</span>
                  </a>
                )}

                {/* Facebook */}
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

                {/* Instagram */}
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
            {/* Línea inferior */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-slate-400 text-[10px] uppercase tracking-widest font-medium">
              <p>© {new Date().getFullYear()} {storeInfo.name || 'Empresa'}</p>
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
