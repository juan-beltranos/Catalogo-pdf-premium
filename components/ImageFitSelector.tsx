import React from 'react';
import { ImageIcon, Check } from 'lucide-react';

export type ImageFit =
    | 'contain'
    | 'cover'
    | 'cover-top'
    | 'square-contain'
    | 'tall-cover'
    | 'wide-contain'
    | 'circle-contain'
    | 'polaroid';

interface ImageFitOption {
    id: ImageFit;
    name: string;
    description: string;
}

const options: ImageFitOption[] = [
    { id: 'contain', name: 'Clásica', description: 'Imagen completa con fondo.' },
    { id: 'cover', name: 'Relleno', description: 'Llena toda la tarjeta.' },
    { id: 'cover-top', name: 'Relleno arriba', description: 'Enfoca la parte superior.' },
    { id: 'square-contain', name: 'Cuadrada', description: 'Con margen interior.' },
    { id: 'tall-cover', name: 'Alta', description: 'Formato retrato/vertical.' },
    { id: 'wide-contain', name: 'Panorámica', description: 'Formato ancho/horizontal.' },
    { id: 'circle-contain', name: 'Circular', description: 'Imagen recortada en círculo.' },
    { id: 'polaroid', name: 'Polaroid', description: 'Con borde blanco inferior.' },
];

export const getImageFitStyle = (fit: ImageFit): React.CSSProperties => {
    switch (fit) {
        case 'cover': return { objectFit: 'cover', objectPosition: 'center' };
        case 'cover-top': return { objectFit: 'cover', objectPosition: 'top' };
        case 'square-contain': return { objectFit: 'contain', objectPosition: 'center', padding: '10px', backgroundColor: 'white' };
        case 'tall-cover': return { objectFit: 'cover', objectPosition: 'center top' };
        case 'wide-contain': return { objectFit: 'contain', objectPosition: 'center', backgroundColor: '#f8fafc' };
        case 'circle-contain': return { objectFit: 'cover', objectPosition: 'center', borderRadius: '50%' };
        case 'polaroid': return { objectFit: 'contain', objectPosition: 'center', padding: '6px 6px 20px 6px', backgroundColor: 'white' };
        case 'contain':
        default: return { objectFit: 'contain', objectPosition: 'center', backgroundColor: 'white' };
    }
};

const previewBg: Record<ImageFit, string> = {
    contain: '#dbeafe',
    cover: '#dcfce7',
    'cover-top': '#fce7f3',
    'square-contain': '#fef9c3',
    'tall-cover': '#ede9fe',
    'wide-contain': '#e0f2fe',
    'circle-contain': '#fef3c7',
    polaroid: '#f1f5f9',
};

const previewGradient: Record<ImageFit, string> = {
    contain: 'linear-gradient(135deg,#93c5fd,#2563eb)',
    cover: 'linear-gradient(135deg,#86efac,#16a34a)',
    'cover-top': 'linear-gradient(135deg,#f9a8d4,#db2777)',
    'square-contain': 'linear-gradient(135deg,#fcd34d,#d97706)',
    'tall-cover': 'linear-gradient(135deg,#c4b5fd,#7c3aed)',
    'wide-contain': 'linear-gradient(135deg,#7dd3fc,#0284c7)',
    'circle-contain': 'linear-gradient(135deg,#fde68a,#f59e0b)',
    polaroid: 'linear-gradient(135deg,#cbd5e1,#64748b)',
};

const FitPreview: React.FC<{ id: ImageFit; active: boolean }> = ({ id, active }) => {
    const innerStyle: React.CSSProperties = (() => {
        switch (id) {
            case 'contain': return { inset: '8px', borderRadius: '4px' };
            case 'cover': return { inset: '-2px', borderRadius: '4px' };
            case 'cover-top': return { top: '-2px', left: '-2px', right: '-2px', bottom: '12px', borderRadius: '4px' };
            case 'square-contain': return { inset: '10px', borderRadius: '4px' };
            case 'tall-cover': return { top: '-2px', left: '8px', right: '8px', bottom: '-2px', borderRadius: '4px' };
            case 'wide-contain': return { top: '12px', left: '2px', right: '2px', bottom: '12px', borderRadius: '4px' };
            case 'circle-contain': return { inset: '5px', borderRadius: '50%' };
            case 'polaroid': return { top: '4px', left: '4px', right: '4px', bottom: '14px', borderRadius: '3px' };
            default: return { inset: '8px', borderRadius: '4px' };
        }
    })();

    return (
        <div
            className={`w-14 h-14 rounded-xl border-2 overflow-hidden flex-shrink-0 relative transition-all ${active ? 'border-blue-500 shadow-md shadow-blue-100' : 'border-slate-200'
                }`}
            style={{ background: id === 'polaroid' ? 'white' : previewBg[id] }}
        >
            <div
                style={{
                    position: 'absolute',
                    background: previewGradient[id],
                    ...innerStyle,
                }}
            />
        </div>
    );
};

interface ImageFitSelectorProps {
    selected: ImageFit;
    onSelect: (fit: ImageFit) => void;
}

export const ImageFitSelector: React.FC<ImageFitSelectorProps> = ({ selected, onSelect }) => {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6">
            <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-blue-600" />
                Estilo de Imágenes
            </h2>
            <p className="text-xs text-slate-400 mb-4">
                Elige cómo se muestran las fotos en las tarjetas.
            </p>

            <div className="grid grid-cols-2 gap-2">
                {options.map((opt) => {
                    const active = selected === opt.id;
                    return (
                        <button
                            key={opt.id}
                            onClick={() => onSelect(opt.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${active
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-slate-100 hover:border-slate-300 bg-slate-50 hover:bg-white'
                                }`}
                        >
                            <div className="relative flex-shrink-0">
                                <FitPreview id={opt.id} active={active} />
                                {active && (
                                    <div className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white p-0.5 rounded-full shadow">
                                        <Check className="w-3 h-3" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <span className={`block font-semibold text-xs truncate ${active ? 'text-blue-700' : 'text-slate-800'}`}>
                                    {opt.name}
                                </span>
                                <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">
                                    {opt.description}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};