import { useState, useEffect, useCallback, useRef } from 'react';
import { Product, StoreInfo } from '../types.ts';
import { STORAGE_KEY } from '../constants.ts';
import { putImageFromBase64 } from '@/helper/imageDB.ts';

export const useCatalog = () => {
  const [storeInfo, setStoreInfo] = useState<StoreInfo>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_info`);
    return saved
      ? JSON.parse(saved)
      : {
        name: '',
        whatsapp: '',
        logo: '',
        color: '#3b82f6',
        templateId: 'minimalist',
      };
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_products`);
    return saved ? JSON.parse(saved) : [];
  });

  // Evita loops si estamos migrando
  const isMigratingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_info`, JSON.stringify(storeInfo));
  }, [storeInfo]);

  useEffect(() => {
    const persistAndMigrate = async () => {
      // Si este effect se disparó por nuestra propia migración, no migrar otra vez
      if (isMigratingRef.current) {
        isMigratingRef.current = false;
      }

      // 1) Migrar base64 -> IndexedDB si hace falta
      const needsMigration = products.some(
        (p) => !!p.image && p.image.startsWith('data:image') && !p.imageId
      );

      if (needsMigration) {
        isMigratingRef.current = true;

        const migrated = await Promise.all(
          products.map(async (p) => {
            if (p.image && p.image.startsWith('data:image') && !p.imageId) {
              const imageId = `img-${p.id}`; // estable y único
              try {
                await putImageFromBase64(imageId, p.image);
                return {
                  ...p,
                  imageId,
                  image: '', // IMPORTANTÍSIMO: sacar base64 del estado/LS
                };
              } catch (e) {
                console.warn('Falló migración de imagen a IndexedDB', e);
                return p; // si falla, no rompas
              }
            }
            return p;
          })
        );

        // Actualizamos state con los productos migrados (ya sin base64)
        setProducts(migrated);
        return; // en el siguiente render se persistirá liviano
      }

      // 2) Guardar en localStorage solo "liviano"
      const lightweight = products.map((p) => ({
        ...p,
        // por si se cuela un base64, lo vaciamos al guardar
        image: p.image?.startsWith('data:image') ? '' : (p.image ?? ''),
      }));

      try {
        localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(lightweight));
      } catch (e) {
        console.warn('LocalStorage lleno. Guardando versión más liviana...', e);

        // Fallback extremo (por si hay demasiados productos/texto)
        const ultra = products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          description: p.description,
          imageId: p.imageId,
          image: '', // nunca base64
        }));

        localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(ultra));
      }
    };

    persistAndMigrate();
  }, [products]);

  const updateStoreInfo = (info: Partial<StoreInfo>) => {
    setStoreInfo((prev) => ({ ...prev, ...info }));
  };

  const addProduct = (product: Product) => {
    setProducts((prev) => [product, ...prev]);
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removeProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const clearAll = useCallback(() => {
    if (confirm('¿Estás seguro de que quieres borrar todos los datos?')) {
      setProducts([]);
      setStoreInfo({
        name: '',
        whatsapp: '',
        logo: '',
        color: '#3b82f6',
        templateId: 'minimalist',
      });
      localStorage.removeItem(`${STORAGE_KEY}_products`);
      localStorage.removeItem(`${STORAGE_KEY}_info`);
    }
  }, []);

  return {
    storeInfo,
    products,
    updateStoreInfo,
    addProduct,
    updateProduct,
    removeProduct,
    clearAll,
  };
};
