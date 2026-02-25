import React from 'react';
import { StoreInfo } from '../types';
import { Store, Image as ImageIcon, Facebook, Instagram, MessageCircle } from 'lucide-react';
import { compressImage } from '../constants';
import { cleanHandle } from '@/helper/social';

interface StoreFormProps {
  storeInfo: StoreInfo;
  onUpdate: (info: Partial<StoreInfo>) => void;
}

export const StoreForm: React.FC<StoreFormProps> = ({ storeInfo, onUpdate }) => {
  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await compressImage(file);
        onUpdate({ logo: base64 });
      } catch (err) {
        console.error("Error compressing logo", err);
      }
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <Store className="w-5 h-5 text-blue-600" />
        Datos de tu Tienda
      </h2>

      <div className="space-y-4">

        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Nombre del Negocio
          </label>
          <input
            type="text"
            value={storeInfo.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Ej. Mi Tienda Increíble"
            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* WhatsApp */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            WhatsApp de Contacto
          </label>
          <div className="relative">
            <MessageCircle className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-green-500" />
            <input
              type="tel"
              value={storeInfo.whatsapp}
              onChange={(e) => onUpdate({ whatsapp: e.target.value })}
              placeholder="3001234567"
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Facebook */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Facebook</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-600">
              <Facebook className="w-4 h-4" />
            </span>

            {/* prefijo */}
            <span className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
              facebook.com/
            </span>

            <input
              type="text"
              value={storeInfo.facebook || ""}
              onChange={(e) => onUpdate({ facebook: cleanHandle(e.target.value) })}
              placeholder="tuusuario"
              className="w-full pl-[150px] pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>
        </div>

        {/* Instagram */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Instagram</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-pink-500">
              <Instagram className="w-4 h-4" />
            </span>

            {/* prefijo */}
            <span className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
              instagram.com/
            </span>

            <input
              type="text"
              value={storeInfo.instagram || ""}
              onChange={(e) => onUpdate({ instagram: cleanHandle(e.target.value) })}
              placeholder="tuusuario"
              className="w-full pl-[160px] pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>
        </div>

        {/* Color y Logo */}
        <div className="grid grid-cols-2 gap-4">
          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Color de Marca
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={storeInfo.color}
                onChange={(e) => onUpdate({ color: e.target.value })}
                className="w-10 h-10 rounded-lg cursor-pointer border-none"
              />
              <span className="text-xs text-slate-500 font-mono uppercase">
                {storeInfo.color}
              </span>
            </div>
          </div>

          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Logo
            </label>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 p-2 rounded-lg flex items-center gap-2 text-sm text-slate-600">
                <ImageIcon className="w-4 h-4" />
                Subir
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </label>
              {storeInfo.logo && (
                <img
                  src={storeInfo.logo}
                  alt="Logo preview"
                  className="w-10 h-10 object-cover rounded-lg border border-slate-200"
                />
              )}
            </div>
          </div>
        </div>

        {/* Checkbox */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <input
            id="showQuantityInPdf"
            type="checkbox"
            checked={!!storeInfo.showQuantityInPdf}
            onChange={(e) => onUpdate({ showQuantityInPdf: e.target.checked })}
            className="w-4 h-4 text-blue-600"
          />
          <label htmlFor="showQuantityInPdf" className="text-sm text-slate-700 font-medium">
            Mostrar cantidad en el PDF
          </label>
        </div>
        
      </div>
    </div>
  );
};