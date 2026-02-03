
import React from 'react';
import { TemplateId } from '../types';
import { Layout, Check } from 'lucide-react';

interface TemplateOption {
  id: TemplateId;
  name: string;
  description: string;
}

const templates: TemplateOption[] = [
  { id: 'minimalist', name: 'Minimalista', description: 'Limpio y espacioso.' },
  { id: 'classic', name: 'Clásico', description: 'Elegante y estructurado.' },
  { id: 'modern', name: 'Moderno', description: 'Audaz y dinámico.' },
];

interface TemplateSelectorProps {
  selectedId: TemplateId;
  onSelect: (id: TemplateId) => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ selectedId, onSelect }) => {
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
            onClick={() => onSelect(template.id)}
            className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
              selectedId === template.id
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
    </div>
  );
};
