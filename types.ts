
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
}


export type TemplateId = 'minimalist' | 'classic' | 'modern';

export interface StoreInfo {
  name: string;
  whatsapp: string;
  logo: string; // Base64
  color: string;
  templateId: TemplateId;
}

export type ViewMode = 'editor' | 'preview';
