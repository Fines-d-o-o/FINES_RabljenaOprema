// Delno iskanje besedila (vsa iskalna polja): vnos se razdeli na besede, zadetek mora vsebovati VSE besede
// v poljubnem vrstnem redu in kjerkoli, brez razlikovanja velikih črk in šumnikov ("pec" najde "Peč").
export const normaliziraj = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

export function ujemaIskanje(iskanje: string, ...polja: (string | number | null | undefined)[]) {
  const besede = normaliziraj(iskanje).split(/\s+/).filter(Boolean);
  if (besede.length === 0) return true;
  const besedilo = normaliziraj(polja.filter((p) => p !== null && p !== undefined).join(" "));
  return besede.every((b) => besedilo.includes(b));
}
