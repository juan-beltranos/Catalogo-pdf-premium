import React from 'react';
import { TemplateId } from '../types';
import { Layout, Check } from 'lucide-react';

interface TemplateOption {
  id: TemplateId;
  name: string;
  description: string;
}

const templates: TemplateOption[] = [
  { id: 'minimalist', name: 'Editorial', description: 'Claro, versatil y muy legible.' },
  { id: 'classic', name: 'Boutique', description: 'Elegante, sobrio y premium.' },
  { id: 'modern', name: 'Showcase', description: 'Visual, actual y comercial.' },
];

const pdfLayoutOptions = [
  { value: 1, label: '1 producto', description: 'Producto grande, ocupa casi toda la página.' },
  { value: 2, label: '2 productos', description: 'Dos tarjetas grandes por página.' },
  { value: 4, label: '4 productos', description: 'Grid clásico de 2 × 2.' },
  { value: 6, label: '6 productos', description: 'Grid compacto de 2 × 3.' },
];

interface TemplateSelectorProps {
  selectedId: TemplateId;
  onSelect: (id: TemplateId) => void;
  pdfProductsPerPage?: number;
  onPdfProductsPerPageChange?: (value: number) => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  selectedId,
  onSelect,
  pdfProductsPerPage = 4,
  onPdfProductsPerPageChange,
}) => {
  const selectedPdfLayout = Math.min(12, Math.max(1, Math.round(Number(pdfProductsPerPage) || 4)));

  const handleCustomPdfLayout = (value: string) => {
    const next = Math.min(12, Math.max(1, Math.round(Number(value) || 4)));
    onPdfProductsPerPageChange?.(next);
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Layout className="w-5 h-5 text-blue-600" />
        Plantilla del Catálogo
      </h2>

      <div className="grid grid-cols-1 gap-3">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect(template.id)}
            className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${selectedId === template.id
              ? 'border-blue-600 bg-blue-50'
              : 'border-slate-100 hover:border-slate-200 bg-slate-50'
              }`}
          >
            <div className="text-left">
              <span className={`block font-bold ${selectedId === template.id ? 'text-blue-700' : 'text-slate-900'}`}>
                {template.name}
              </span>
              <span className="text-xs text-slate-500">{template.description}</span>
            </div>
            {selectedId === template.id && (
              <div className="bg-blue-600 text-white p-1 rounded-full">
                <Check className="w-4 h-4" />
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Layout del PDF</h3>
        <p className="text-xs text-slate-500 mb-3">
          Define cuántos productos quieres intentar mostrar por página. Si una tarjeta queda muy alta, el PDF hará el salto antes para no cortarla.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {pdfLayoutOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onPdfProductsPerPageChange?.(option.value)}
              className={`rounded-xl border-2 p-3 text-left transition-all ${selectedPdfLayout === option.value
                ? 'border-blue-600 bg-blue-50'
                : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                }`}
            >
              <span className={`block text-sm font-bold ${selectedPdfLayout === option.value ? 'text-blue-700' : 'text-slate-800'}`}>
                {option.label}
              </span>
              <span className="block text-[11px] leading-snug text-slate-500 mt-1">
                {option.description}
              </span>
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="block text-xs font-semibold text-slate-500 mb-1">Cantidad personalizada por página</span>
          <input
            type="number"
            min={1}
            max={6}
            step={1}
            value={selectedPdfLayout}
            onChange={(e) => handleCustomPdfLayout(e.target.value)}
            className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </div>
    </div>
  );
};
