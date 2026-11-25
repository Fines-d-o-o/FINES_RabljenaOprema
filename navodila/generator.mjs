// Generator navodil za uporabnike: video MP4 s podnapisi in PDF (ena stran na funkcijo).
//
//   npm --prefix navodila run navodila -- posoja-rezervacija            (video + slike + PDF)
//   npm --prefix navodila run navodila -- posoja-rezervacija --samo-pdf (PDF iz shranjenih slik)
//   npm --prefix navodila run navodila -- posoja-rezervacija --objavi   (naloži video.mp4 in navodilo.pdf v bucket
//                                                                       rbo-navodila/<ime>/ - aplikacija ju pokaže v oknu "i")
//
// - Aplikacija mora teči lokalno (npm run lokalno v web/, http://localhost:3002) ali NAVODILA_URL.
// - Prijava: ob prvem zagonu se odpre brskalnik, prijaviš se ročno; seja se shrani v
//   navodila/.prijava.json (ni v gitu, brez gesla). Snemanje teče v nevidnem brskalniku.
// - Testna oprema se doda neposredno v bazo (obrazec bi poslal obvestilo v Teams), koraki se izvajajo
//   samo na njej, na koncu se skrije (visible = false, kot gumb Izbriši).
// - Video se sestavi sličico za sličico (30 sličic/s): vsak premik (pomik strani, kazalec, obroba,
//   prehodi) je izračunan, ni snemanja v realnem času, zato ni utripanja in skokov.
// - Izhod: navodila/izhod/<ime>/ (video.mp4, navodilo.pdf, slike/) - ni v gitu.

import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KOREN = dirname(fileURLToPath(import.meta.url));
const WEB = join(KOREN, "..", "web");
const ime = process.argv[2];
const SAMO_PDF = process.argv.includes("--samo-pdf");
const OBJAVI = process.argv.includes("--objavi");
const BUCKET = "rbo-navodila"; // migracija 20261125000000_navodila.sql
if (!ime || ime.startsWith("--")) {
  console.error("Uporaba: npm --prefix navodila run navodila -- <ime> [--samo-pdf | --objavi]   (opis: navodila/opisi/<ime>.mjs)");
  process.exit(1);
}
const spec = (await import(pathToFileURL(join(KOREN, "opisi", `${ime}.mjs`)).href)).default;

const env = Object.fromEntries(
  readFileSync(join(WEB, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((v) => /^[A-Z_]+=/.test(v))
    .map((v) => [v.slice(0, v.indexOf("=")), v.slice(v.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const URL_APP = process.env.NAVODILA_URL ?? "http://localhost:3002";
const PRIJAVA = join(KOREN, ".prijava.json");
const IZHOD = join(KOREN, "izhod", ime);
const SLIKE = join(IZHOD, "slike");
const W = 1280; // CSS pike; video je 1920 × 1200 (DSF 1,5)
const H = 800;
const DSF = 1.5;
const FPS = 30;
const ORANZNA = "#ca5010";

const cakaj = (ms) => new Promise((r) => setTimeout(r, ms));
const gladko = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const omeji = (v, a, b) => Math.min(b, Math.max(a, v));
const danes = () => new Date().toISOString().slice(0, 10);

// ---------- Prijava in testna oprema ----------
async function zagotoviPrijavo(browser) {
  if (existsSync(PRIJAVA)) {
    const ctx = await browser.newContext({ storageState: PRIJAVA });
    const p = await ctx.newPage();
    await p.goto(`${URL_APP}/`);
    const ok = !p.url().includes("/prijava");
    // aplikacija ob obisku osveži sejo (žeton velja 1 uro) - shrani osveženo, da jo uporabi tudi dostop do baze
    if (ok) await ctx.storageState({ path: PRIJAVA });
    await ctx.close();
    if (ok) return;
    console.log("Shranjena prijava je potekla.");
  }
  console.log("Odpira se brskalnik - prijavi se v aplikacijo (čakam do 15 minut) ...");
  const vidni = await chromium.launch({ headless: false });
  const ctx = await vidni.newContext();
  const p = await ctx.newPage();
  await p.goto(`${URL_APP}/prijava`);
  await p.waitForURL((u) => !u.pathname.startsWith("/prijava"), { timeout: 15 * 60_000 });
  await p.waitForLoadState("networkidle");
  await ctx.storageState({ path: PRIJAVA });
  await vidni.close();
  console.log("Prijava shranjena.");
}

function supabase() {
  const { cookies } = JSON.parse(readFileSync(PRIJAVA, "utf8"));
  const deli = cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  let v = deli.map((c) => c.value).join("");
  if (v.startsWith("base64-")) v = Buffer.from(v.slice(7), "base64url").toString("utf8");
  const zeton = JSON.parse(decodeURIComponent(v)).access_token;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${zeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function dodajTestnoOpremo(sb, naziv) {
  const { data, error } = await sb
    .from("rbo_oprema")
    .insert({
      oprema_naziv: naziv,
      koda: "100-601.1014",
      serijska_stevilka: "24.1234.123",
      datum_prejema: danes(),
      kolicina: 1,
      em: "kos",
      ocena: 4,
      komentar: "Primer opreme za navodilo.",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Testne opreme ni bilo mogoče dodati: ${error.message}`);
  return data.id;
}

async function skrijTestnoOpremo(sb, id) {
  const pov = await sb.from("ln_rbo_oprema_prodaja").select("id_prodaja").eq("id_oprema", id);
  const idProdaj = (pov.data ?? []).map((p) => p.id_prodaja);
  if (idProdaj.length) await sb.from("rbo_prodaja").update({ visible: false }).in("id_prodaja", idProdaj);
  const { error } = await sb.from("rbo_oprema").update({ visible: false }).eq("id", id);
  if (error) console.error(`POZOR: testna oprema ${id} ni skrita (${error.message}) - izbriši jo ročno v aplikaciji.`);
  else console.log(`Testna oprema ${id} je skrita.`);
}

// ---------- Prekrivni sloj: celotno stanje se nariše pred vsako sličico (brez CSS prehodov) ----------
const NARISI = (s) => {
  const el = (id, z, css) => {
    let e = document.getElementById(id);
    if (!e) {
      e = document.createElement("div");
      e.id = id;
      e.style.cssText = `position:fixed;pointer-events:none;z-index:${2147483600 + z};${css}`;
      document.documentElement.appendChild(e);
    }
    return e;
  };
  const vsebina = (e, k, html) => {
    if (e.dataset.k !== k) {
      e.innerHTML = html;
      e.dataset.k = k;
    }
  };

  const n = el(
    "nav-naslovnica",
    1,
    `inset:0;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:0 120px;background:#fff;border-top:10px solid ${s.oranzna};font-family:'Segoe UI',Arial,sans-serif;text-align:center`,
  );
  if (s.naslovnica) {
    const { nad, naslov, pod } = s.naslovnica;
    vsebina(
      n,
      JSON.stringify(s.naslovnica),
      `<img src="/fines-logo.png" style="height:46px;margin-bottom:28px">` +
        (nad ? `<div style="font-size:20px;font-weight:600;color:${s.oranzna};letter-spacing:.08em;text-transform:uppercase">${nad}</div>` : "") +
        `<div style="font-size:46px;font-weight:700;color:#1c1c1f;line-height:1.15">${naslov}</div>` +
        (pod ? `<div style="font-size:22px;color:#6b6b72;max-width:860px;line-height:1.4">${pod}</div>` : ""),
    );
    n.style.display = "flex";
  } else n.style.display = "none";

  const o = el("nav-obroba", 2, `border:4px solid ${s.oranzna};border-radius:10px;box-shadow:0 0 0 6px rgba(202,80,16,.22),0 0 22px rgba(202,80,16,.45)`);
  if (s.obroba && s.obroba.a > 0) {
    const r = s.obroba.r;
    Object.assign(o.style, { display: "block", opacity: s.obroba.a, left: `${r.x - 8}px`, top: `${r.y - 8}px`, width: `${r.width + 16}px`, height: `${r.height + 16}px` });
  } else o.style.display = "none";

  const v = el("nav-val", 3, "border-radius:50%;background:rgba(202,80,16,.5)");
  if (s.val) {
    const r = 12 + 26 * s.val.t;
    Object.assign(v.style, { display: "block", opacity: 0.9 * (1 - s.val.t), left: `${s.val.x - r}px`, top: `${s.val.y - r}px`, width: `${2 * r}px`, height: `${2 * r}px` });
  } else v.style.display = "none";

  const c = el(
    "nav-podnapis",
    4,
    `left:50%;bottom:26px;transform:translateX(-50%);max-width:90%;align-items:center;gap:14px;background:rgba(28,28,31,.93);color:#fff;border-left:6px solid ${s.oranzna};border-radius:10px;padding:13px 22px;font:600 22px/1.3 'Segoe UI',Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:nowrap`,
  );
  if (s.podnapis) {
    vsebina(
      c,
      s.podnapis.oznaka + s.podnapis.besedilo,
      `<span style="background:${s.oranzna};border-radius:999px;padding:3px 12px;font-size:16px">${s.podnapis.oznaka}</span><span>${s.podnapis.besedilo}</span>`,
    );
    c.style.display = "flex";
  } else c.style.display = "none";

  const k = el("nav-kazalec", 5, "left:0;top:0;width:30px;height:30px");
  vsebina(k, "svg", '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.6L9.4 21z" fill="#1c1c1f" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>');
  if (s.kazalec && !s.naslovnica) {
    k.style.display = "block";
    k.style.transform = `translate(${s.kazalec.x - 5}px,${s.kazalec.y - 3}px)`;
  } else k.style.display = "none";

  const pr = el("nav-prehod", 9, "inset:0;background-size:100% 100%");
  if (s.prehod) {
    if (pr.dataset.k !== s.prehod.k) {
      pr.style.backgroundImage = `url(${s.prehod.src})`;
      pr.dataset.k = s.prehod.k;
    }
    pr.style.display = "block";
    pr.style.opacity = s.prehod.a;
  } else pr.style.display = "none";

  if (s.scrollY !== null && s.scrollY !== undefined) window.scrollTo(0, s.scrollY);
};

// ---------- Snemalnik ----------
class Snemalnik {
  constructor(p, pot) {
    this.p = p;
    this.S = { oranzna: ORANZNA, naslovnica: null, podnapis: null, kazalec: { x: W / 2, y: H / 2 }, obroba: null, val: null, prehod: null, scrollY: null };
    this.zadnji = null;
    this.stevec = 0;
    this.enc = spawn(
      ffmpegPath,
      ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", pot],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    this.konec = new Promise((res, rej) => this.enc.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg je končal z napako ${c}`)))));
  }

  async kadr() {
    await this.p.evaluate(NARISI, { ...this.S, prehod: this.S.prehod && { ...this.S.prehod } });
    // logo na naslovnici (po menjavi strani se ustvari na novo) mora biti naložen pred sličico
    if (this.S.naslovnica) {
      await this.p.evaluate(() =>
        Promise.all([...document.querySelectorAll("#nav-naslovnica img")].map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r))))),
      );
    }
    this.zadnji = await this.p.screenshot({ type: "jpeg", quality: 90, scale: "device" });
    return this.zadnji;
  }

  async zapisi(buf, n = 1) {
    for (let i = 0; i < n; i++) {
      this.stevec++;
      if (!this.enc.stdin.write(buf)) await once(this.enc.stdin, "drain");
    }
  }

  /** n sličic animacije; f(t) nastavi stanje za t v (0, 1]. */
  async animiraj(n, f) {
    for (let i = 1; i <= n; i++) {
      f(i / n);
      await this.zapisi(await this.kadr());
    }
  }

  async drzi(ms) {
    await this.zapisi(await this.kadr(), Math.round((ms / 1000) * FPS));
  }

  /** Prehod iz zadnje zapisane sličice v trenutno stanje (pretapljanje). */
  async prehod(n = 8) {
    if (!this.zadnji) return;
    const src = `data:image/jpeg;base64,${this.zadnji.toString("base64")}`;
    const k = String(this.stevec);
    await this.animiraj(n, (t) => (this.S.prehod = { k, src, a: 1 - gladko(t) }));
    this.S.prehod = null;
  }

  async koncaj() {
    this.enc.stdin.end();
    await this.konec;
  }
}

// ---------- Izvajanje korakov ----------
async function sredina(loc) {
  const r = await loc.boundingBox();
  return { r, x: r.x + Math.min(r.width / 2, 36), y: r.y + Math.min(r.height / 2, 22) };
}

/** Gladek pomik strani, da je element v vidnem delu (ne pri oknih in lepljivih vrsticah). */
async function pomakniDo(sn, loc) {
  const nepremicen = await loc.evaluate((e) => {
    for (let x = e; x; x = x.parentElement) {
      const pos = getComputedStyle(x).position;
      if (pos === "fixed" || pos === "sticky" || x.getAttribute?.("role") === "dialog") return true;
    }
    return false;
  });
  if (nepremicen) return;
  const r = await loc.boundingBox();
  const c = r.y + r.height / 2;
  if (c > H * 0.18 && c < H * 0.72) return;
  const { y0, maks } = await sn.p.evaluate(() => ({ y0: scrollY, maks: document.documentElement.scrollHeight - innerHeight }));
  const cilj = omeji(y0 + c - H * 0.42, 0, maks);
  const d = cilj - y0;
  if (Math.abs(d) < 8) return;
  await sn.animiraj(omeji(Math.round(Math.abs(d) / 22), 14, 42), (t) => (sn.S.scrollY = y0 + d * gladko(t)));
  sn.S.scrollY = null;
}

async function premakniKazalec(sn, x, y) {
  const { x: x0, y: y0 } = sn.S.kazalec;
  const dist = Math.hypot(x - x0, y - y0);
  if (dist < 3) return;
  await sn.animiraj(omeji(Math.round(dist / 28), 10, 24), (t) => {
    const e = gladko(t);
    sn.S.kazalec = { x: x0 + (x - x0) * e, y: y0 + (y - y0) * e };
  });
}

async function klikVal(sn) {
  const { x, y } = sn.S.kazalec;
  const a0 = sn.S.obroba?.a ?? 0;
  await sn.animiraj(9, (t) => {
    sn.S.val = { x, y, t };
    if (sn.S.obroba) sn.S.obroba.a = a0 * (1 - t);
  });
  sn.S.val = null;
  sn.S.obroba = null;
}

async function izvedi(sn, d, cilj, ctx) {
  const p = sn.p;
  const lok = (v) => (typeof v === "function" ? v(p) : cilj);
  if (d.pojdi) {
    await p.goto(`${URL_APP}${d.pojdi(ctx)}`);
    await p.waitForLoadState("networkidle");
    await cakaj(300);
    await sn.prehod(10);
    return;
  }
  const loc = lok(d.klik ?? d.tipkaj ?? d.izberi ?? d.shrani);
  await loc.waitFor({ state: "visible", timeout: 20_000 });
  await pomakniDo(sn, loc);
  const { x, y } = await sredina(loc);
  await premakniKazalec(sn, x, y);
  await klikVal(sn);
  if (d.tipkaj) {
    await loc.click();
    if (d.pocisti) await loc.fill(""); // { tipkaj, besedilo, pocisti: true } = najprej izprazni polje
    const besedilo = d.besedilo.replace("{naziv}", ctx.naziv);
    for (const znak of besedilo) {
      await loc.pressSequentially(znak);
      await sn.zapisi(await sn.kadr(), 2);
    }
    await sn.drzi(300);
    return;
  }
  if (d.izberi) await loc.selectOption(d.vrednost);
  else await loc.click();
  if (d.shrani) {
    await p.waitForFunction(() => /shranjen/i.test(document.querySelector("[role=status]")?.textContent ?? ""), null, { timeout: 20_000 });
  }
  await cakaj(450);
  await sn.prehod(d.izberi || d.shrani ? 9 : 7);
}

/** Slika za PDF: brez podnapisa, kazalca in obrobe; stran se po sliki vrne na isti položaj (ne gre v video). */
/**
 * Slika za PDF: brez podnapisa, kazalca in obrobe; ne gre v video (stran se nato vrne na isti položaj in širino).
 * slika.obmocje vrne lokator ali seznam lokatorjev (izrez = skupni okvir obstoječih);
 * slika.sirina = širina strani za sliko (npr. 820: zadetki v dveh stolpcih, večja pisava v PDF).
 */
async function slikaZaPdf(sn, slika, pot) {
  const p = sn.p;
  const y0 = await p.evaluate(() => scrollY);
  if (slika.sirina) {
    await p.setViewportSize({ width: slika.sirina, height: H });
    await cakaj(400);
  }
  const sirina = slika.sirina ?? W;
  await p.evaluate(NARISI, { ...sn.S, podnapis: null, kazalec: null, obroba: null, val: null, prehod: null, naslovnica: null });
  const vsi = [slika.obmocje(p)].flat();
  const lokatorji = [];
  for (const l of vsi) if ((await l.count()) > 0) lokatorji.push(l.first());
  // visoko območje (npr. seznam zadetkov) od vrha, sicer na sredino
  const okvir = async () => {
    const bb = (await Promise.all(lokatorji.map((l) => l.boundingBox()))).filter(Boolean);
    const x = Math.min(...bb.map((b) => b.x));
    const y = Math.min(...bb.map((b) => b.y));
    return { x, y, width: Math.max(...bb.map((b) => b.x + b.width)) - x, height: Math.max(...bb.map((b) => b.y + b.height)) - y };
  };
  const visina = (await okvir()).height;
  await lokatorji[0].evaluate((e, blok) => e.scrollIntoView({ block: blok, behavior: "instant" }), visina > H * 0.85 ? "start" : "center");
  const r = await okvir();
  const x = Math.max(0, r.x - 3);
  const y = Math.max(0, r.y - 3);
  const clip = { x, y, width: Math.min(sirina, r.x + r.width + 3) - x, height: Math.min(H, r.y + r.height + 3) - y };
  await p.screenshot({ path: pot, clip, scale: "device" });
  if (slika.sirina) {
    await p.setViewportSize({ width: W, height: H });
    await cakaj(400);
  }
  await p.evaluate((y) => window.scrollTo(0, y), y0);
}

// ---------- PDF: ena stran na funkcijo - levo diagram poteka, desno slike ----------
function pdfHtml(slike) {
  const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
  const strela = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>';
  const kamera =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b6b72" stroke-width="2"><path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  const strani = spec.funkcije
    .map((f, fi) => {
      // Številke = koraki z videom; rezultati (slika.rezultat) dobijo črke A, B ... in so na koncu desnega stolpca
      let st = 0;
      let crka = 0;
      const vozlisca = [];
      const slikeKorakov = [];
      const slikeRezultatov = [];
      for (const [ki, k] of f.koraki.entries()) {
        const oznaka = k.cilj ? `<span class="st">${++st}</span>` : `<span class="st">${strela}</span>`;
        const s = slike[`${fi}-${ki}`];
        const ikona = k.slika?.opis && s ? `<span class="ima">${kamera}</span>` : "";
        vozlisca.push(`<div class="vozel ${k.dogodek ? "dogodek" : "korak"}${k.cilj ? "" : " samo"}">${oznaka}<span class="bes">${k.naslov}</span>${ikona}</div>`);
        if (!k.slika || !s) continue;
        if (k.slika.rezultat) {
          const c = String.fromCharCode(65 + crka++);
          vozlisca.push(`<div class="vozel rezultat"><span class="st">${c}</span><span class="bes">${k.slika.rezultat}</span><span class="ima">${kamera}</span></div>`);
          slikeRezultatov.push(`<figure><figcaption><span class="st">${c}</span>${k.slika.rezultat}</figcaption><img src="${b64(s)}"></figure>`);
        } else {
          slikeKorakov.push(`<figure${k.dogodek ? ' class="dogodek"' : ""}><figcaption><span class="st">${st}</span>${k.slika.opis}</figcaption><img src="${b64(s)}"></figure>`);
        }
      }
      const desno =
        (slikeKorakov.length ? `<h2>Koraki</h2>${slikeKorakov.join("")}` : "") +
        (slikeRezultatov.length ? `<h2 class="rez">Rezultat</h2>${slikeRezultatov.join("")}` : "");
      return `<section class="stran">
        <header><img src="${b64(join(WEB, "public", "fines-logo.png"))}"><div>Rabljena oprema · navodilo<br>verzija ${spec.verzije.join(", ")} · ${new Date().toLocaleDateString("sl-SI")}</div></header>
        <h1><span>${fi + 1}</span>${f.naslov}</h1>
        <p class="kdaj"><b>Kdaj:</b> ${f.kdaj}</p>
        <div class="telo">
          <div class="tok"><h2>Potek</h2>${vozlisca.join('<div class="puscica"></div>')}
            <div class="legenda"><span><i class="k"></i>korak uporabnika</span><span><i class="d"></i>zgodi se samo</span><span><i class="r"></i>rezultat</span></div>
          </div>
          <div class="slike">${desno}</div>
        </div>
        <div class="spodaj">
          <div class="info"><h3>Dobro je vedeti</h3><ul>${f.dobroVedeti.map((v) => `<li>${v}</li>`).join("")}</ul></div>
          <div class="pozor"><h3>Pozor</h3><p>${f.pozor}</p></div>
        </div>
      </section>`;
    })
    .join("");
  return `<!doctype html><html lang="sl"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #1c1c1f; font-size: 9.5pt; line-height: 1.35; }
    .stran { width: 210mm; height: 297mm; padding: 11mm 12mm 10mm; display: flex; flex-direction: column; gap: 3.5mm; page-break-after: always; overflow: hidden; }
    .stran:last-child { page-break-after: auto; }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid ${ORANZNA}; padding-bottom: 2.5mm; }
    header img { height: 8mm; }
    header div { color: #6b6b72; font-size: 8pt; text-align: right; }
    h1 { margin: 1mm 0 0; font-size: 19pt; display: flex; align-items: center; gap: 3mm; }
    h1 span { background: ${ORANZNA}; color: #fff; border-radius: 50%; width: 9mm; height: 9mm; display: inline-flex; align-items: center; justify-content: center; font-size: 13pt; }
    .kdaj { margin: 0; background: #fdf3ed; border: 1px solid #f3bf9f; border-radius: 2.5mm; padding: 2.5mm 3.5mm; }
    .telo { flex: 1; display: grid; grid-template-columns: 76mm 1fr; gap: 6mm; min-height: 0; }
    h2 { font-size: 10pt; margin: 0 0 2.5mm; color: #6b6b72; text-transform: uppercase; letter-spacing: .06em; }
    .vozel { display: flex; align-items: center; gap: 2.5mm; border-radius: 2.5mm; padding: 2.2mm 3mm; border: 1.3px solid ${ORANZNA}; background: #fff; }
    .vozel.dogodek { border-color: #2563eb; background: #eff6ff; }
    .vozel.samo { border-style: dashed; }
    .vozel .bes { flex: 1; font-weight: 600; }
    .vozel .ima { display: inline-flex; }
    .vozel.rezultat { border-color: #16a34a; background: #f0fdf4; }
    .rezultat .st { background: #16a34a; }
    .st { flex: none; width: 6mm; height: 6mm; border-radius: 50%; background: ${ORANZNA}; color: #fff; font-weight: 700; font-size: 9pt; display: inline-flex; align-items: center; justify-content: center; }
    .dogodek .st, figure.dogodek .st { background: #2563eb; }
    .puscica { width: 0; height: 4.2mm; margin-left: 6mm; border-left: 1.5px solid #9a9aa1; position: relative; }
    .puscica::after { content: ""; position: absolute; left: -4.2px; bottom: -1px; border: 3.5px solid transparent; border-top: 5px solid #9a9aa1; }
    .legenda { display: flex; gap: 4mm; margin-top: 4mm; font-size: 7.5pt; color: #6b6b72; }
    .legenda i { display: inline-block; width: 3mm; height: 3mm; border-radius: .8mm; margin-right: 1.2mm; vertical-align: -.4mm; }
    .legenda .k { border: 1.3px solid ${ORANZNA}; } .legenda .d { border: 1.3px solid #2563eb; background: #eff6ff; } .legenda .r { border: 1.3px solid #16a34a; background: #f0fdf4; }
    .slike { display: flex; flex-direction: column; gap: 3mm; min-height: 0; }
    .slike h2 { margin: 0; } .slike h2.rez { margin-top: 1.5mm; color: #16a34a; }
    .slike h2.rez ~ figure .st { background: #16a34a; }
    figure { margin: 0; display: flex; flex-direction: column; gap: 1.5mm; }
    figcaption { display: flex; gap: 2mm; align-items: flex-start; font-weight: 600; }
    figure img { display: block; width: auto; height: auto; max-width: 100%; max-height: 52mm; align-self: flex-start; filter: drop-shadow(0 0 .5px #9a9aa1) drop-shadow(0 .6mm 1.2mm rgba(0,0,0,.12)); }
    .spodaj { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
    .spodaj > div { border-radius: 2.5mm; padding: 2.5mm 3.5mm; }
    .spodaj h3 { margin: 0 0 1mm; font-size: 9.5pt; }
    .spodaj ul { margin: 0; padding-left: 4mm; } .spodaj p { margin: 0; }
    .info { background: #eff6ff; border: 1px solid #93c5fd; }
    .pozor { background: #fffbeb; border: 1px solid #fcd34d; }
  </style></head><body>${strani}</body></html>`;
}

async function narediPdf(browser, slike) {
  const p = await browser.newPage();
  await p.setContent(pdfHtml(slike), { waitUntil: "load" });
  let pot = join(IZHOD, "navodilo.pdf");
  const buf = await p.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  try {
    writeFileSync(pot, buf);
  } catch (e) {
    if (e.code !== "EBUSY" && e.code !== "EPERM") throw e;
    pot = join(IZHOD, `navodilo-${Date.now().toString().slice(-6)}.pdf`);
    writeFileSync(pot, buf);
    console.warn(`navodilo.pdf je odprt v drugem programu - shranjeno kot ${pot}`);
  }
  await p.close();
  const strani = (readFileSync(pot, "latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (strani !== spec.funkcije.length) console.warn(`POZOR: PDF ima ${strani} strani, pričakovano ${spec.funkcije.length} (ena na funkcijo).`);
  return `${strani} strani -> ${pot}`;
}

// ---------- Objava v Supabase Storage (po pregledu) ----------
async function objavi(sb) {
  for (const [ime_d, vrsta] of [["video.mp4", "video/mp4"], ["navodilo.pdf", "application/pdf"]]) {
    const pot = join(IZHOD, ime_d);
    if (!existsSync(pot)) throw new Error(`Ni datoteke ${pot} - najprej generiraj navodilo.`);
    const { error } = await sb.storage.from(BUCKET).upload(`${ime}/${ime_d}`, readFileSync(pot), { contentType: vrsta, upsert: true });
    if (error) throw new Error(`Nalaganje ${ime_d} ni uspelo: ${error.message} (je migracija 20261125000000_navodila.sql pognana?)`);
    console.log(`Objavljeno: ${BUCKET}/${ime}/${ime_d}`);
  }
  console.log(`V aplikaciji: verzija s poljem navodilo: "${ime}" (web/src/lib/verzije.ts) pokaže ikono videa v oknu "i".`);
}

// ---------- Glavni potek ----------
const browser = await chromium.launch({ args: ["--lang=sl-SI"] }); // datumska polja v slovenski obliki
try {
  if (OBJAVI) {
    await zagotoviPrijavo(browser);
    await objavi(supabase());
  } else if (SAMO_PDF) {
    const slike = JSON.parse(readFileSync(join(IZHOD, "slike.json"), "utf8"));
    console.log(`PDF: ${await narediPdf(browser, slike)}`);
  } else {
    await posnemi();
  }
} finally {
  await browser.close();
}

async function posnemi() {
  rmSync(IZHOD, { recursive: true, force: true });
  mkdirSync(SLIKE, { recursive: true });
  await zagotoviPrijavo(browser);
  const sb = supabase();
  // spec.testnaOprema === false: navodilo samo bere (npr. iskanje) - v bazo se nič ne zapiše
  const naziv = "FBM 40 - primer";
  const id = spec.testnaOprema === false ? null : await dodajTestnoOpremo(sb, naziv);
  const ctx = { id, naziv };
  if (id) console.log(`Testna oprema ${id}: ${naziv}`);
  const slike = {};
  try {
    const bctx = await browser.newContext({ storageState: PRIJAVA, viewport: { width: W, height: H }, deviceScaleFactor: DSF, locale: "sl-SI" });
    const p = await bctx.newPage();
    p.on("dialog", (d) => d.accept());
    await p.goto(`${URL_APP}${spec.zacetek ? spec.zacetek(ctx) : `/oprema/${id}`}`);
    await p.waitForLoadState("networkidle");

    const sn = new Snemalnik(p, join(IZHOD, "video.mp4"));
    const S = sn.S;
    // Uvodna naslovnica (prva sličica je že naslovnica)
    S.naslovnica = { naslov: spec.naslov, pod: spec.funkcije.map((f, i) => `${i + 1}. ${f.naslov}`).join("  ·  ") };
    await sn.drzi(2600);

    for (const [fi, f] of spec.funkcije.entries()) {
      const vVideu = f.koraki.filter((k) => k.cilj);
      S.podnapis = null;
      S.naslovnica = { nad: `Poglavje ${fi + 1}`, naslov: f.naslov, pod: f.kdaj };
      await sn.prehod(12);
      if (f.zacetek) {
        // stran se zamenja pod naslovnico (ni vidno), ob prehodu se pokaže nova stran
        await p.goto(`${URL_APP}${f.zacetek(ctx)}`);
        await p.waitForLoadState("networkidle");
      }
      await sn.drzi(3000);
      S.naslovnica = null;
      await sn.prehod(14);
      await sn.drzi(400);

      for (const [ki, k] of f.koraki.entries()) {
        if (!k.cilj) continue;
        const st = vVideu.indexOf(k) + 1;
        console.log(`  ${fi + 1}.${st} ${k.naslov}`);
        S.podnapis = { oznaka: `${st}/${vVideu.length}`, besedilo: k.naslov };
        await sn.drzi(250);
        for (const d of k.pred ?? []) await izvedi(sn, d, null, ctx);

        const cilj = k.cilj(p);
        await cilj.waitFor({ state: "visible", timeout: 20_000 });
        await pomakniDo(sn, cilj);
        const { r, x, y } = await sredina(cilj);
        await premakniKazalec(sn, x, y);
        await sn.animiraj(8, (t) => (S.obroba = { r, a: gladko(t) }));
        await sn.drzi(Math.max(1700, k.naslov.length * 55));

        if (k.slika?.pred) {
          slike[`${fi}-${ki}`] = join(SLIKE, `${fi + 1}-${st}.png`);
          await slikaZaPdf(sn, k.slika, slike[`${fi}-${ki}`]);
        }
        for (const d of k.dejanja ?? []) await izvedi(sn, d, cilj, ctx);
        if (S.obroba) await sn.animiraj(6, (t) => (S.obroba.a = 1 - t));
        S.obroba = null;
        await sn.drzi(k.drziPo ?? 900); // drziPo = čas za ogled rezultata (npr. zadetkov iskanja)

        if (k.slika && !k.slika.pred) {
          slike[`${fi}-${ki}`] = join(SLIKE, `${fi + 1}-${st}.png`);
          await slikaZaPdf(sn, k.slika, slike[`${fi}-${ki}`]);
        }
      }
    }

    S.podnapis = null;
    S.naslovnica = { naslov: "Konec", pod: "Navodilo v PDF ima isti potek na eni strani za vsako funkcijo." };
    await sn.prehod(12);
    await sn.drzi(2500);
    await sn.koncaj();
    await bctx.close();
    console.log(`Video: ${(sn.stevec / FPS).toFixed(1)} s (${sn.stevec} sličic)`);

    writeFileSync(join(IZHOD, "slike.json"), JSON.stringify(slike, null, 2));
    console.log(`PDF: ${await narediPdf(browser, slike)}`);
    console.log(`\nGotovo: ${IZHOD}\n  video.mp4\n  navodilo.pdf`);
  } finally {
    if (id) await skrijTestnoOpremo(sb, id);
  }
}
