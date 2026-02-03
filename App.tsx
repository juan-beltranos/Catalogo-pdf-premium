
import React, { useState, useRef } from 'react';
import { useCatalog } from './hooks/useCatalog.ts';
import { StoreForm } from './components/StoreForm.tsx';
import { ProductManager } from './components/ProductManager.tsx';
import { CatalogPreview } from './components/CatalogPreview.tsx';
import { ExportButton } from './components/ExportButton.tsx';
import { TemplateSelector } from './components/TemplateSelector.tsx';
import { ViewMode, TemplateId } from './types.ts';
import { Eye, Edit3, Sparkles, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const App: React.FC = () => {
  const { storeInfo, products, updateStoreInfo, addProduct, updateProduct, removeProduct, clearAll } = useCatalog();
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const previewRef = useRef<HTMLDivElement>(null);

  const handleTemplateSelect = (id: TemplateId) => {
    updateStoreInfo({ templateId: id });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="font-bold text-lg tracking-tight hidden sm:block">Catálogo Instantáneo</h1>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('editor')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${viewMode === 'editor' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              <Edit3 className="w-4 h-4" />
              <span className="hidden sm:inline">Editor</span>
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${viewMode === 'preview' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">Previsualizar</span>
            </button>
          </div>

          <button
            onClick={clearAll}
            className="text-slate-400 hover:text-red-500 transition-colors p-2"
            title="Limpiar todo"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Content Area */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {viewMode === 'editor' ? (
            <motion.div
              key="editor"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              <div className="lg:col-span-4">
                <TemplateSelector
                  selectedId={storeInfo.templateId}
                  onSelect={handleTemplateSelect}
                />
                <StoreForm storeInfo={storeInfo} onUpdate={updateStoreInfo} />
                <div className="hidden lg:block bg-blue-50 p-6 rounded-2xl border border-blue-100">
                  <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Tip Pro
                  </h4>
                  <p className="text-sm text-blue-700 leading-relaxed">
                    Personaliza los colores y la tipografía eligiendo una de nuestras plantillas. Tus datos se guardan automáticamente.
                  </p>
                </div>
              </div>
              <div className="lg:col-span-8">
                <ProductManager
                  products={products}
                  onAdd={addProduct}
                  onRemove={removeProduct}
                  onUpdate={updateProduct}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center"
            >
              <div className="mb-6 text-center max-w-xl">
                <h2 className="text-2xl font-bold mb-2">Previsualización de tu PDF</h2>
                <p className="text-slate-500 text-sm">Así es como se verá tu catálogo cuando tus clientes lo reciban por WhatsApp.</p>
              </div>
              <div className="w-full flex justify-center">
                <CatalogPreview
                  storeInfo={storeInfo}
                  products={products}
                  previewRef={previewRef}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="mt-20 py-10 border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-sm flex items-center justify-center gap-2">
            Hecho con ❤️ para emprendedores imparables
          </p>
        </div>
      </footer>

      {/* Floating Export Button */}
      {viewMode === 'preview' && (
        <ExportButton
          targetRef={previewRef}
          fileName={storeInfo.name || 'mi-catalogo'}
          products={products}
        />
      )}
    </div>
  );
};
