export const fnv1a32 = (data) => {
    let hash = 0x811c9dc5 >>> 0; // offset basis
    for (let i = 0; i < data.length; i++) {
        hash ^= data[i];
        // FNV prime 16777619
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
};
export const hashString = (s) => {
    const enc = new TextEncoder();
    return fnv1a32(enc.encode(s));
};
//# sourceMappingURL=checksum.js.map