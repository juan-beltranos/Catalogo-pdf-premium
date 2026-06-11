export type CatalogTemplateId = 'minimalist' | 'classic' | 'modern';

type ProductCardTheme = {
  card: string;
  mediaWrap: string;
  mediaInner: string;
  image: string;
  featuredBadge: string;
  categoryBadge: string;
  stockBadge: string;
  priceInline: string;
  body: string;
  title: string;
  description: string;
  actionHintWrap: string;
  actionHint: string;
  footerLine?: string;
};

export const getProductCardTheme = (
  templateId: CatalogTemplateId,
  primaryColor: string
): ProductCardTheme => {
  if (templateId === 'modern') {
    return {
      card: `
        group product-pdf relative flex flex-col overflow-hidden
        rounded-[1.35rem] border border-slate-200 bg-white
        shadow-[0_16px_40px_rgba(15,23,42,0.08)]
        transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(15,23,42,0.12)]
      `,
      mediaWrap: `
        relative bg-slate-50 p-3
      `,
      mediaInner: `
        product-media relative aspect-[4/3] w-full overflow-hidden
        rounded-[1.05rem] bg-white
        flex items-center justify-center ring-1 ring-slate-100
      `,
      image: `
  relative z-[2]
  w-full h-full object-contain mx-auto block
      `,
      featuredBadge: `
        absolute top-3 right-3 z-10 w-9 h-9 rounded-full
        flex items-center justify-center text-white shadow-lg
      `,
      categoryBadge: `
  absolute top-3 left-3 z-10 max-w-[62%] truncate
  inline-flex items-center justify-center h-7 px-3 py-0 rounded-full shadow-sm
  text-[10px] leading-none font-extrabold
  uppercase tracking-[0.10em]
  text-white
      `,
      stockBadge: `
        inline-flex items-center gap-1 rounded-full h-7 px-3
        text-[11px] leading-none font-semibold border
        bg-white text-emerald-700 border-emerald-300
      `,
      priceInline: `
        inline-flex items-center justify-center h-9 rounded-lg px-3
        text-[14px] leading-none font-extrabold text-white shadow-sm
      `,
      body: `
        relative px-5 pb-5 pt-4
      `,
      title: `
        text-[19px] leading-[1.12] font-extrabold text-slate-950
      `,
      description: `
        mt-2 text-[13px] leading-[1.55] text-slate-500
      `,
      actionHintWrap: `
        mt-4 flex items-center justify-center
      `,
      actionHint: `
        px-4 h-9 inline-flex items-center justify-center rounded-lg
        text-[10px] font-extrabold uppercase tracking-[0.08em]
        border border-slate-200 text-slate-800 bg-slate-50
      `,
      footerLine: `
        mt-4 h-[3px] w-14 rounded-full
      `,
    };
  }

  if (templateId === 'classic') {
    return {
      card: `
        group product-pdf relative flex flex-col overflow-hidden
        rounded-[0.95rem] border border-slate-200 bg-white
        shadow-[0_10px_30px_rgba(15,23,42,0.06)]
        transition-all duration-300
      `,
      mediaWrap: `
        relative px-4 pt-4
      `,
      mediaInner: `
        product-media relative aspect-[4/3] w-full overflow-hidden
        rounded-[0.75rem] bg-stone-50
        flex items-center justify-center border border-stone-100
      `,
      image: `
        w-full h-full object-contain mx-auto block
      `,
      featuredBadge: `
        absolute top-3 right-3 z-10 w-9 h-9 rounded-full
        flex items-center justify-center text-white
      `,
      categoryBadge: `
  absolute top-3 left-3 z-10 max-w-[62%] truncate
  inline-flex items-center justify-center h-7 px-3 py-0 rounded-full
  text-[10px] leading-none font-bold
  uppercase tracking-[0.10em]
  text-white border border-white/20
      `,
      stockBadge: `
        inline-flex items-center gap-1 rounded-full h-7 px-3
        text-[11px] leading-none font-semibold border
        bg-white text-stone-700 border-stone-300
      `,
      priceInline: `
        inline-flex items-center justify-center h-9 rounded-sm px-4
        text-[14px] leading-none font-bold text-white
      `,
      body: `
        relative px-5 pb-5 pt-4 text-center
      `,
      title: `
        text-[19px] leading-[1.18] font-bold font-serif text-stone-950
      `,
      description: `
        mt-3 text-[13px] leading-[1.6] text-stone-500
      `,
      actionHintWrap: `
        mt-4 flex items-center justify-center
      `,
      actionHint: `
        px-4 h-9 inline-flex items-center justify-center rounded-full
        text-[11px] font-extrabold uppercase tracking-[0.08em]
        border border-stone-300 text-stone-900 bg-white
      `,
      footerLine: `
        mt-4 mx-auto h-[2px] w-20 rounded-full bg-stone-300
      `,
    };
  }

  return {
    card: `
      group product-pdf relative flex flex-col overflow-hidden
      rounded-xl border border-slate-200 bg-white
      shadow-[0_8px_24px_rgba(15,23,42,0.05)]
      transition-all duration-300
    `,
    mediaWrap: `
      relative p-3 pb-2
    `,
    mediaInner: `
      product-media relative aspect-[4/3] w-full overflow-hidden
      rounded-lg bg-white
      flex items-center justify-center border border-slate-100
    `,
    image: `
  relative z-[2]
  w-full h-full object-contain mx-auto block
    `,
    featuredBadge: `
      absolute top-3 right-3 z-10 w-8 h-8 rounded-full
      flex items-center justify-center text-white
    `,
    categoryBadge: `
absolute top-3 left-3 z-10 max-w-[62%] truncate
  inline-flex items-center justify-center h-7 px-3 py-0 rounded-full
  text-[10px] leading-none font-bold
  uppercase tracking-[0.08em]
  text-white border border-white/20
    `,
    stockBadge: `
      inline-flex items-center gap-1 rounded-full h-7 px-3
      text-[11px] leading-none font-medium border
      bg-white text-emerald-700 border-emerald-300
    `,
    priceInline: `
      inline-flex items-center justify-center h-8 rounded-md px-3
      text-[14px] leading-none font-extrabold text-white
    `,
    body: `
      relative px-4 pb-4 pt-3
    `,
    title: `
      text-[17px] leading-[1.2] font-extrabold text-slate-950
    `,
    description: `
      mt-2 text-[13px] leading-[1.55] text-slate-500
    `,
    actionHintWrap: `
      mt-4 flex items-center justify-center
    `,
    actionHint: `
      px-4 h-9 inline-flex items-center justify-center rounded-md
      text-[11px] font-extrabold uppercase tracking-[0.08em]
      border border-slate-200 text-slate-800 bg-slate-50
    `,
    footerLine: `
      mt-4 h-[3px] w-14 rounded-full
    `,
  };
};

export const getProductCardInlineStyles = (
  templateId: CatalogTemplateId,
  primaryColor: string
) => {
  const featuredStyle =
    templateId === 'modern'
      ? {
        background: '#f59e0b',
        border: '2px solid #ffffff',
      }
      : templateId === 'classic'
        ? {
          background: primaryColor || '#44403c',
          border: '2px solid #ffffff',
        }
        : {
          background: primaryColor || '#1e293b',
          border: '2px solid #ffffff',
        };

  const priceStyle =
    templateId === 'modern'
      ? {
        background: primaryColor || '#0f172a',
      }
      : templateId === 'classic'
        ? {
          background: brandSafe(primaryColor, '#57534e'),
        }
        : {
          background: primaryColor || '#1e293b',
        };

  const mediaAccent = undefined;

  const footerLineStyle =
    templateId === 'modern'
      ? {
        background: primaryColor || '#0f172a',
      }
      : templateId === 'minimalist'
        ? {
          background: primaryColor || '#1e293b',
        }
        : undefined;

  const actionStyle = {
    background: '#ffffff',
    color: '#0f172a',
    border: '1px solid #cbd5e1',
  };

  const categoryBadgeStyle = {
    background: primaryColor || '#00000011',
  };

  const minimalistHeroStyle = undefined;
  const minimalistOrbStyle = undefined;

  return {
    featuredStyle,
    priceStyle,
    mediaAccent,
    footerLineStyle,
    actionStyle,
    minimalistHeroStyle,
    minimalistOrbStyle,
    categoryBadgeStyle
  };
};

function brandSafe(primaryColor: string, fallback: string) {
  return primaryColor || fallback;
}
