import "server-only";

// Obvestilo v Teams prek Power Automate flowa (sprožilec "When a Teams webhook request is received").
// URL flowa je skrivnost: samo v TEAMS_WEBHOOK_URL na strežniku (nikoli NEXT_PUBLIC_).
// Imena polj so enaka kot v prejšnjem flowu iz Power Apps.

export type TeamsNovaOprema = {
  id: number;
  datumPrejema: string | null; // LLLL-MM-DD
  ident: string | null;
  naziv: string;
  serijska: string | null;
  ocena: number | null;
  komentar: string | null;
  povezava: string; // URL opreme v aplikaciji
};

const datumSl = (d: string | null) => {
  const iso = d ?? new Date().toLocaleDateString("sv-SE");
  const [l, m, dan] = iso.split("-");
  return `${dan}.${m}.${l}`;
};

// Vrne null ob uspehu ali če obvestila niso nastavljena, sicer besedilo napake.
export async function obvestiTeamsNovaOprema(o: TeamsNovaOprema): Promise<string | null> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) return null;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ID: String(o.id),
        Date: datumSl(o.datumPrejema),
        Ident: o.ident ?? "",
        Serial: o.serijska ?? "",
        Komentar: o.komentar ?? "",
        Ocena: o.ocena != null ? String(o.ocena) : "",
        Naziv: o.naziv,
        Povezava: o.povezava,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) return null;
    // npr. {"error":{"code":"DirectApiAuthorizationRequired", ...}} -> pokažemo kodo napake
    const odgovor = await r.text().catch(() => "");
    const koda = odgovor.match(/"code"\s*:\s*"([^"]+)"/)?.[1];
    console.error(`[Teams] HTTP ${r.status}: ${odgovor.slice(0, 500)}`);
    return `HTTP ${r.status}${koda ? ` ${koda}` : ""}`;
  } catch (e) {
    console.error("[Teams]", e);
    return e instanceof Error ? e.message : String(e);
  }
}

// ---------------------------------------------------------------------------------------------
// Obvestilo "Oprema prodana" (standard: Adaptive Card 1.4 sestavi aplikacija, flow jo samo objavi).
// Flow: "When a Teams webhook request is received" -> Parse JSON -> za vsako priponko
// "Post card in a chat or channel". URL je v TEAMS_WEBHOOK_PRODANO (samo strežnik, Vercel).

export type TeamsProdano = {
  id: number;
  naziv: string;
  ident: string | null;
  serijska: string | null;
  skupina: string | null;
  skladisce: string | null;
  kupec: string | null;
  datumProdaje: string | null; // LLLL-MM-DD
  prodajnaCena: number | null;
  prodajalec: string | null;
  garancijaMeseci: number | null;
  komentar: string | null;
  poslal: string | null; // e-mail uporabnika, ki je označil prodajo
  povezava: string; // URL opreme v aplikaciji
};

// Kartica za kanal skupine: kaj se je zgodilo, kaj naj naredijo (odpis na odpremni nalog) in osnovni podatki.
// Vzorec kartice: data/teams_kartica_prodano.json (za Adaptive Card Designer).
export function karticaProdano(o: TeamsProdano) {
  const zdaj = new Date().toLocaleString("sl-SI", {
    timeZone: "Europe/Ljubljana",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const podatki: { title: string; value: string }[] = [
    { title: "ID opreme", value: String(o.id) },
    { title: "Ident", value: o.ident ?? "" },
    { title: "Serijska št.", value: o.serijska ?? "" },
    { title: "Skupina", value: o.skupina ?? "" },
    { title: "Skladišče", value: o.skladisce ?? "" },
    { title: "Kupec", value: o.kupec ?? "" },
    { title: "Datum prodaje", value: o.datumProdaje ? datumSl(o.datumProdaje) : "" },
    { title: "Prodajalec", value: o.prodajalec ?? "" },
  ].filter((f) => f.value !== "");

  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    msteams: { width: "Full" },
    body: [
      {
        type: "TextBlock",
        text: "✅ Oprema je bila označena kot PRODANA",
        size: "Large",
        weight: "Bolder",
        color: "Good",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: [zdaj, o.poslal ? `označil ${o.poslal}` : null].filter(Boolean).join(" · "),
        isSubtle: true,
        size: "Small",
        wrap: true,
        spacing: "None",
      },
      {
        type: "Container",
        style: "warning",
        spacing: "Medium",
        items: [{ type: "TextBlock", text: "📦 Peč odpišite na odpremni nalog.", weight: "Bolder", wrap: true }],
      },
      {
        type: "Container",
        style: "emphasis",
        spacing: "Medium",
        items: [
          { type: "TextBlock", text: o.naziv, weight: "Bolder", size: "Medium", wrap: true },
          { type: "FactSet", facts: podatki, spacing: "Small" },
          ...(o.komentar ? [{ type: "TextBlock", text: o.komentar, wrap: true, isSubtle: true, spacing: "Small" }] : []),
        ],
      },
    ],
    actions: [{ type: "Action.OpenUrl", title: "Odpri opremo", url: o.povezava }],
  };
}

// Vrne null ob uspehu ali če obvestilo ni nastavljeno (TEAMS_WEBHOOK_PRODANO prazen), sicer besedilo napake.
export async function obvestiTeamsProdano(o: TeamsProdano): Promise<string | null> {
  const url = process.env.TEAMS_WEBHOOK_PRODANO;
  if (!url) return null;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "message",
        attachments: [
          { contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: karticaProdano(o) },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) return null;
    const odgovor = await r.text().catch(() => "");
    const koda = odgovor.match(/"code"\s*:\s*"([^"]+)"/)?.[1];
    console.error(`[Teams prodano] HTTP ${r.status}: ${odgovor.slice(0, 500)}`);
    return `HTTP ${r.status}${koda ? ` ${koda}` : ""}`;
  } catch (e) {
    console.error("[Teams prodano]", e);
    return e instanceof Error ? e.message : String(e);
  }
}
