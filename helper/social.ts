export const cleanHandle = (v: string) => {
    const s = (v || "").trim();
    if (!s) return "";
    // quita @, espacios, y URLs pegadas
    return s
        .replace(/^@+/, "")
        .replace(/^https?:\/\/(www\.)?/i, "")
        .replace(/^facebook\.com\//i, "")
        .replace(/^instagram\.com\//i, "")
        .replace(/^fb\.com\//i, "")
        .replace(/\/+$/, "")
        .trim();
};

export const facebookUrl = (handle: string) => {
    const h = cleanHandle(handle);
    return h ? `https://facebook.com/${h}` : "";
};

export const instagramUrl = (handle: string) => {
    const h = cleanHandle(handle);
    return h ? `https://instagram.com/${h}` : "";
};

export const facebookLabel = (handle: string) => {
    const h = cleanHandle(handle);
    return h ? `facebook.com/${h}` : "";
};

export const instagramLabel = (handle: string) => {
    const h = cleanHandle(handle);
    return h ? `instagram.com/${h}` : "";
};