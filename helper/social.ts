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

export function normalizeWaNumber(input: string, defaultCountry = "57") {
    if (!input) return "";

    // deja solo dígitos (quita +, espacios, guiones, paréntesis)
    let digits = input.replace(/[^\d]/g, "");

    // soporta números con prefijo 00 (ej: 0057...)
    if (digits.startsWith("00")) digits = digits.slice(2);

    // si ya viene con el país (57...), lo dejamos
    if (digits.startsWith(defaultCountry)) return digits;

    // si parece celular colombiano (10 dígitos y empieza por 3), agrega 57
    if (defaultCountry === "57" && digits.length === 10 && digits.startsWith("3")) {
        return defaultCountry + digits;
    }

    // si no puedes inferir, devuélvelo como está (o valida y muestra error)
    return digits;
}