import { formazo, type Formazo, type Nyelv } from './formaz.ts'
import type { FoglalasomAdat, LemondasAllapot, Level, Uzlet } from './tipusok.ts'

const ZOLD = '#1f7a4d'
const SZOVEG = '#171a17'
const HALK = '#6b736a'
const KERET = '#e2e5df'
const HATTER = '#f4f5f3'
const BETU = "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export interface LevelOpciok {
  nyelv?: Nyelv
  ceges?: boolean
  most?: Date
}

interface Keret {
  nyelv: Nyelv
  targy: string
  megszolitas: string
  bevezeto: string
  sorok: [string, string][]
  megjegyzes: string | null
  doboz: string
  gomb: string
  link: string
  uzlet: Uzlet
}

function felepit(cimzett: string, k: Keret): Level {
  const tablaSorok = k.sorok.map(([cimke, ertek]) => `
            <tr>
              <td style="padding:8px 0;border-top:1px solid ${KERET};color:${HALK};font-size:13px;width:38%;vertical-align:top">${esc(cimke)}</td>
              <td style="padding:8px 0;border-top:1px solid ${KERET};color:${SZOVEG};font-size:15px;font-weight:600;vertical-align:top">${esc(ertek)}</td>
            </tr>`).join('')
  const telefon = k.nyelv === 'en' ? 'Phone' : 'Telefon'

  const html = `<!doctype html>
<html lang="${k.nyelv}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(k.targy)}</title>
</head>
<body style="margin:0;padding:0;background:${HATTER};font-family:${BETU}">
  <div style="display:none;max-height:0;overflow:hidden">${esc(k.bevezeto)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${HATTER}">
    <tr>
      <td align="center" style="padding:24px 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${KERET};border-radius:12px">
          <tr>
            <td style="padding:20px 24px;border-bottom:3px solid ${ZOLD}">
              <div style="font-size:20px;font-weight:700;color:${SZOVEG};letter-spacing:.02em">${esc(k.uzlet.nev)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:${SZOVEG}">${esc(k.megszolitas)}</h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:${SZOVEG}">${esc(k.bevezeto)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tablaSorok}
              </table>${k.megjegyzes ? `
              <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${HALK}">${esc(k.megjegyzes)}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${KERET}">
                <tr>
                  <td style="padding:16px 0 4px;font-size:14px;line-height:1.5;color:${SZOVEG}">${esc(k.doboz)}</td>
                </tr>
                <tr>
                  <td style="padding:12px 0 4px">
                    <a href="${esc(k.link)}" style="display:inline-block;padding:13px 22px;background:${ZOLD};border-radius:8px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">${esc(k.gomb)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#fafbf9;border-top:1px solid ${KERET};border-radius:0 0 12px 12px;font-size:12px;line-height:1.6;color:${HALK}">
              ${esc(k.uzlet.nev)}${k.uzlet.cim ? `<br>${esc(k.uzlet.cim)}` : ''}<br>
              ${telefon}: <a href="tel:${esc(k.uzlet.telefon.replace(/\s+/g, ''))}" style="color:${HALK}">${esc(k.uzlet.telefon)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const szoveg = [
    k.megszolitas,
    '',
    k.bevezeto,
    '',
    ...k.sorok.map(([cimke, ertek]) => `${cimke}: ${ertek}`),
    ...(k.megjegyzes ? ['', k.megjegyzes] : []),
    '',
    k.doboz,
    `${k.gomb}: ${k.link}`,
    '',
    k.uzlet.nev,
    ...(k.uzlet.cim ? [k.uzlet.cim] : []),
    `${telefon}: ${k.uzlet.telefon}`,
  ].join('\n')

  return { cimzett, targy: k.targy, html, szoveg }
}

function idopont(f: Formazo, iso: string): string {
  return `${f.rovidNap(iso)} ${f.ora(iso)}`
}

export function visszaigazolasLevel(
  cimzett: string,
  a: LemondasAllapot,
  link: string,
  uzlet: Uzlet,
  o: LevelOpciok = {},
): Level {
  const fog = a.foglalas
  if (!fog) throw new Error('Hiányzik a foglalás adata.')
  const nyelv = o.nyelv ?? 'hu'
  const en = nyelv === 'en'
  const f = formazo(nyelv)
  const most = o.most ?? new Date()

  const kezdes = fog.start_at ?? fog.drop_off_at
  const mikor = kezdes ? idopont(f, kezdes) : f.rovidNap(`${fog.service_date}T12:00:00Z`)
  const targy = en ? `Booking confirmed: ${mikor}` : `Foglalás visszaigazolva: ${mikor}`
  const lemondhato = a.allapot === 'LEMONDHATO' && a.hatarido !== undefined && new Date(a.hatarido) > most
  const hatarido = a.hatarido ? idopont(f, a.hatarido) : ''

  const sorok: [string, string][] = [
    ...f.idopontSorok(fog),
    [en ? 'Car' : 'Autó', f.auto(fog)],
    [en ? 'Service' : 'Szolgáltatás', f.szolgaltatas(fog)],
  ]
  if (fog.extras_summary) sorok.push([en ? 'Extras' : 'Extrák', fog.extras_summary])
  if (!o.ceges && fog.estimated_price_huf != null) sorok.push([en ? 'Estimated price' : 'Becsült ár', f.ft(fog.estimated_price_huf)])
  if (fog.notes) sorok.push([en ? 'Your note' : 'Megjegyzésed', fog.notes])

  const oldalSzoveg = en
    ? 'On your booking page you can check the details at any time, and if you need to change something (for example bring the car earlier), just write it there, no need to call.'
    : 'A foglalásod oldalán bármikor megnézheted az adatait, és ha valamin változtatnál (például korábban hoznád az autót), ott megírhatod, nem kell telefonálnod.'
  const lemondasSzoveg = lemondhato
    ? (en ? ` You can also cancel there until ${hatarido}.` : ` Lemondási határidő: ${hatarido}, addig ott le is mondhatod.`)
    : (en ? ` To cancel, please call us: ${uzlet.telefon}.` : ` Lemondani már csak telefonon tudod: ${uzlet.telefon}.`)

  return felepit(cimzett, {
    nyelv,
    targy,
    megszolitas: en ? `Dear ${fog.customer_name.trim()},` : `Kedves ${fog.customer_name.trim()}!`,
    bevezeto: en ? 'We have confirmed your booking and look forward to seeing you.' : 'Visszaigazoltuk a foglalásodat, várunk szeretettel.',
    sorok,
    megjegyzes: o.ceges ? null : (en
      ? 'The price is an estimate made without seeing the car. If it is very dirty, a surcharge may apply after we have talked it over.'
      : 'Az ár látatlanban számolt becslés. Erősen szennyezett állapotnál egyeztetés után felár lehetséges.'),
    doboz: oldalSzoveg + lemondasSzoveg,
    gomb: en ? 'Open my booking' : 'Foglalásom megnyitása',
    link,
    uzlet,
  })
}

export function keszLevel(
  cimzett: string,
  o: FoglalasomAdat,
  link: string,
  uzlet: Uzlet,
  opciok: LevelOpciok = {},
): Level {
  const m = o.most
  if (!m) throw new Error('Hiányzik a foglalás adata.')
  const nyelv = opciok.nyelv ?? o.nyelv ?? 'hu'
  const en = nyelv === 'en'
  const f = formazo(nyelv)
  const auto = f.auto({ plate_raw: m.rendszam, brand: m.marka, model: m.modell })

  const sorok: [string, string][] = [[en ? 'Car' : 'Autó', auto]]
  if (o.kesz_ig) sorok.push([en ? 'Collect by' : 'Átvehető legkésőbb', idopont(f, o.kesz_ig)])
  if (o.ar?.vegleges != null) sorok.push([en ? 'Total' : 'Végösszeg', f.ft(o.ar.vegleges)])
  if (o.ar?.felar_indok) sorok.push([en ? 'Why it costs more' : 'A felár oka', o.ar.felar_indok])
  if (o.ar?.kimaradt) sorok.push([en ? 'Left out' : 'Kimaradt', o.ar.kimaradt])

  const hol = uzlet.cim
    ? (en ? `You can collect it here: ${uzlet.cim}. ` : `Itt veheted át: ${uzlet.cim}. `)
    : ''
  return felepit(cimzett, {
    nyelv,
    targy: en ? `Your car is ready: ${m.rendszam}` : `Elkészült az autód: ${m.rendszam}`,
    megszolitas: en ? `Dear ${(o.nev ?? '').trim()},` : `Kedves ${(o.nev ?? '').trim()}!`,
    bevezeto: en ? 'Your car is ready, you can collect it now.' : 'Elkészült az autód, már átveheted.',
    sorok,
    megjegyzes: null,
    doboz: hol + (en
      ? `If something comes up, call us: ${uzlet.telefon}.`
      : `Ha közbejön valami, hívj minket: ${uzlet.telefon}.`),
    gomb: en ? 'Open my booking' : 'Foglalásom megnyitása',
    link,
    uzlet,
  })
}
