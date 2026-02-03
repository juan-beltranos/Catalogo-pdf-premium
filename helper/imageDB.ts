const DB_NAME = 'instacatalog_db';
const STORE = 'images';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE); // key-value: key = imageId, value = Blob
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function base64ToBlob(dataUrl: string): Blob {
    // data:image/png;base64,....
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

export async function putImageFromBase64(imageId: string, dataUrl: string) {
    const db = await openDB();
    const blob = base64ToBlob(dataUrl);

    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(blob, imageId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });

    db.close();
}

export async function getImageUrl(imageId: string): Promise<string | null> {
    const db = await openDB();

    const blob = await new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(imageId);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });

    db.close();
    if (!blob) return null;

    // OJO: esto crea un objectURL que deberías revocar si lo cambias muchas veces
    return URL.createObjectURL(blob);
}

export async function deleteImage(imageId: string) {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(imageId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}
