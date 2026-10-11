import { auto, ft, idopontSorok, ora, rovidNap, szolgaltatas } from './formaz.ts'
import type { LemondasAllapot, Level, Uzlet } from './tipusok.ts'

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

export function visszaigazolasLevel(
  cimzett: string,
  a: LemondasAllapot,
  lemondoLink: string,
  uzlet: Uzlet,
  most: Date = new Date(),
): Level {
  const f = a.foglalas
  if (!f) throw new Error('Hiányzik a foglalás adata.')

  const kezdes = f.start_at ?? f.drop_off_at
  const targy = `Foglalás visszaigazolva: ${kezdes ? `${rovidNap(kezdes)} ${ora(kezdes)}` : rovidNap(`${f.service_date}T12:00:00Z`)}`
  const lemondhato = a.allapot === 'LEMONDHATO' && a.hatarido !== undefined && new Date(a.hatarido) > most
  const hatarido = a.hatarido ? `${rovidNap(a.hatarido)} ${ora(a.hatarido)}` : ''

  const sorok: [string, string][] = [
    ...idopontSorok(f),
    ['Autó', auto(f)],
    ['Szolgáltatás', szolgaltatas(f)],
  ]
  if (f.extras_summary) sorok.push(['Extrák', f.extras_summary])
  if (f.estimated_price_huf != null) sorok.push(['Becsült ár', ft(f.estimated_price_huf)])
  if (f.notes) sorok.push(['Megjegyzésed', f.notes])

  const megszolitas = `Kedves ${f.customer_name.trim()}!`
  const bevezeto = 'Visszaigazoltuk a foglalásodat, várunk szeretettel.'
  const arMegjegyzes = 'Az ár látatlanban számolt becslés. Erősen szennyezett állapotnál egyeztetés után felár lehetséges.'
  const lemondasSzoveg = lemondhato
    ? `Ha mégsem jó az időpont, online lemondhatod. Lemondási határidő: ${hatarido}. Utána már csak telefonon: ${uzlet.telefon}.`
    : `Ha mégsem jó az időpont, kérjük, hívj minket: ${uzlet.telefon}.`

  const tablaSorok = sorok.map(([cimke, ertek]) => `
            <tr>
              <td style="padding:8px 0;border-top:1px solid ${KERET};color:${HALK};font-size:13px;width:38%;vertical-align:top">${esc(cimke)}</td>
              <td style="padding:8px 0;border-top:1px solid ${KERET};color:${SZOVEG};font-size:15px;font-weight:600;vertical-align:top">${esc(ertek)}</td>
            </tr>`).join('')

  const gomb = lemondhato ? `
          <tr>
            <td style="padding:8px 0 4px">
              <a href="${esc(lemondoLink)}" style="display:inline-block;padding:12px 20px;border:2px solid ${SZOVEG};border-radius:8px;color:${SZOVEG};font-weight:600;font-size:15px;text-decoration:none">Foglalás lemondása</a>
            </td>
          </tr>` : ''

  const html = `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(targy)}</title>
</head>
<body style="margin:0;padding:0;background:${HATTER};font-family:${BETU}">
  <div style="display:none;max-height:0;overflow:hidden">${esc(bevezeto)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${HATTER}">
    <tr>
      <td align="center" style="padding:24px 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${KERET};border-radius:12px">
          <tr>
            <td style="padding:20px 24px;border-bottom:3px solid ${ZOLD}">
              <div style="font-size:20px;font-weight:700;color:${SZOVEG};letter-spacing:.02em">${esc(uzlet.nev)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:${SZOVEG}">${esc(megszolitas)}</h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:${SZOVEG}">${esc(bevezeto)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tablaSorok}
              </table>
              <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${HALK}">${esc(arMegjegyzes)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${KERET}">
                <tr>
                  <td style="padding:16px 0 4px;font-size:14px;line-height:1.5;color:${SZOVEG}">${esc(lemondasSzoveg)}</td>
                </tr>${gomb}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#fafbf9;border-top:1px solid ${KERET};border-radius:0 0 12px 12px;font-size:12px;line-height:1.6;color:${HALK}">
              ${esc(uzlet.nev)}${uzlet.cim ? `<br>${esc(uzlet.cim)}` : ''}<br>
              Telefon: <a href="tel:${esc(uzlet.telefon.replace(/\s+/g, ''))}" style="color:${HALK}">${esc(uzlet.telefon)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const szoveg = [
    megszolitas,
    '',
    bevezeto,
    '',
    ...sorok.map(([cimke, ertek]) => `${cimke}: ${ertek}`),
    '',
    arMegjegyzes,
    '',
    lemondasSzoveg,
    ...(lemondhato ? [`Lemondás: ${lemondoLink}`] : []),
    '',
    uzlet.nev,
    ...(uzlet.cim ? [uzlet.cim] : []),
    `Telefon: ${uzlet.telefon}`,
  ].join('\n')

  return { cimzett, targy, html, szoveg }
}
