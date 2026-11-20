// Datum LLLL-MM-DD -> "1. 10. 2026" (brez pretvorbe časovnih pasov)
export const prikazDatuma = (d: string | null) => {
  if (!d) return "–";
  const [l, m, dan] = d.slice(0, 10).split("-");
  return `${Number(dan)}. ${Number(m)}. ${l}`;
};

// Današnji lokalni datum v obliki LLLL-MM-DD
export const danes = () => new Date().toLocaleDateString("sv-SE");

// Računanje z datumi LLLL-MM-DD (lokalno, brez časovnih pasov)
const vDatum = (d: string) => {
  const [l, m, dan] = d.slice(0, 10).split("-").map(Number);
  return new Date(l, m - 1, dan);
};
const izDatuma = (d: Date) => d.toLocaleDateString("sv-SE");

export const pristejDni = (d: string, n: number) => {
  const x = vDatum(d);
  x.setDate(x.getDate() + n);
  return izDatuma(x);
};

// Pristej mesece; ob krajšem mesecu zadnji dan meseca (31. 1. + 1 mesec = 28. 2.)
export const pristejMesece = (d: string, n: number) => {
  const x = vDatum(d);
  const dan = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  x.setDate(Math.min(dan, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return izDatuma(x);
};

// Število dni od a do b (b - a)
export const razlikaDni = (a: string, b: string) => Math.round((vDatum(b).getTime() - vDatum(a).getTime()) / 86_400_000);

// "še 5 dni" / "danes" / "poteklo pred 3 dnevi" glede na danes
export function doRoka(d: string) {
  const n = razlikaDni(danes(), d);
  if (n === 0) return "danes";
  if (n > 0) return `še ${n} ${n === 1 ? "dan" : n === 2 ? "dneva" : n <= 4 ? "dnevi" : "dni"}`;
  const p = -n;
  return `poteklo pred ${p} ${p === 1 ? "dnem" : p === 2 ? "dnevoma" : "dnevi"}`;
}
