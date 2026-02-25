
export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  category?: string;
  image?: string; // base64 o url
  imageId?: string; // apunta a IndexedDB
  order?: number;
  featured?: boolean;
  hidden?: boolean;
  quantity?: number;
}


export type TemplateId = 'minimalist' | 'classic' | 'modern';

export interface StoreInfo {
  name: string;
  whatsapp: string;
  facebook?: string;
  instagram?: string;
  color: string;
  logo?: string;
  templateId: TemplateId;
  showQuantityInPdf?: boolean;
}

export type ViewMode = 'editor' | 'preview';
