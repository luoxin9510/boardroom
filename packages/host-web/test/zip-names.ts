/** Clears the "names are UTF-8" flag (bit 11) in every zip header, like Finder's Compress does. */
export function stripUtf8Flag(zip: Uint8Array): Uint8Array {
  const out = zip.slice();
  const view = new DataView(out.buffer);
  for (let i = 0; i + 4 <= out.length; i++) {
    const sig = view.getUint32(i, true);
    const at = sig === 0x04034b50 ? i + 6 : sig === 0x02014b50 ? i + 8 : -1;
    if (at >= 0) view.setUint16(at, view.getUint16(at, true) & ~0x0800, true);
  }
  return out;
}
