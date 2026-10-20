import { ft as ftHu, idotartam as idotartamHu, maStr, napCim as napCimHu, napokRovid as napokRovidHu, napRovidCim as napRovidCimHu } from './format'
import { EGYSEG, type MeasureUnit } from './types'

export type Nyelv = 'hu' | 'en'

export const NYELVEK: Nyelv[] = ['hu', 'en']

export const nyelviUt = (ut: string, nyelv: Nyelv) => (nyelv === 'en' ? `${ut}?lang=en` : ut)

const TZ = 'Europe/Budapest'
const datum = (d: string) => new Date(`${d}T12:00:00Z`)

const enHosszu = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: TZ })
const enRovid = new Intl.DateTimeFormat('en-GB', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ })
const EN_HONAP = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const EN_EGYSEG: Record<MeasureUnit, [string, string]> = {
  DB: ['pc', 'pcs'], AJTO: ['door', 'doors'], ULES: ['seat', 'seats'], LITER: ['litre', 'litres'], ALKALOM: ['time', 'times'],
}

function enNapok(tol: string, ig: string): string {
  const [ev1, ho1, nap1] = tol.slice(0, 10).split('-').map(Number)
  const [ev2, ho2, nap2] = ig.slice(0, 10).split('-').map(Number)
  const ev = (e: number) => (e !== Number(maStr().slice(0, 4)) ? ` ${e}` : '')
  if (tol.slice(0, 10) === ig.slice(0, 10)) return `${nap1} ${EN_HONAP[ho1 - 1]}${ev(ev1)}`
  if (ev1 === ev2 && ho1 === ho2) return `${nap1}–${nap2} ${EN_HONAP[ho1 - 1]}${ev(ev1)}`
  return `${nap1} ${EN_HONAP[ho1 - 1]}${ev1 !== ev2 ? ev(ev1) : ''} – ${nap2} ${EN_HONAP[ho2 - 1]}${ev(ev2)}`
}

export interface Formatum {
  nyelv: Nyelv
  ft: (v: number | null | undefined) => string
  tol: (v: number) => string
  napCim: (d: string) => string
  napRovidCim: (d: string) => string
  napokRovid: (tol: string, ig: string) => string
  idotartam: (perc: number | null | undefined) => string
  kb: (s: string) => string
  egyseg: (u: MeasureUnit, db?: number) => string
  kozott: (a: string, b: string) => string
  hetNapjai: string[]
  kisbetu: (s: string) => string
}

const HU: Formatum = {
  nyelv: 'hu',
  ft: ftHu,
  tol: (v) => `${ftHu(v)}-tól`,
  napCim: napCimHu,
  napRovidCim: napRovidCimHu,
  napokRovid: napokRovidHu,
  idotartam: idotartamHu,
  kb: (s) => `kb. ${s}`,
  egyseg: (u) => EGYSEG[u],
  kozott: (a, b) => `${a} és ${b} között`,
  hetNapjai: ['H', 'K', 'Sze', 'Cs', 'P', 'Szo'],
  kisbetu: (s) => s.charAt(0).toLocaleLowerCase('hu-HU') + s.slice(1),
}

const EN: Formatum = {
  nyelv: 'en',
  ft: (v) => (v === null || v === undefined ? '—' : `HUF ${v.toLocaleString('en-GB')}`),
  tol: (v) => `from HUF ${v.toLocaleString('en-GB')}`,
  napCim: (d) => enHosszu.format(datum(d)),
  napRovidCim: (d) => enRovid.format(datum(d)),
  napokRovid: enNapok,
  idotartam: (perc) => {
    if (perc === null || perc === undefined) return '—'
    if (perc < 60) return `${perc} min`
    const o = Math.floor(perc / 60)
    const p = perc % 60
    return p === 0 ? `${o} hr` : `${o} hr ${p} min`
  },
  kb: (s) => `approx. ${s}`,
  egyseg: (u, db = 1) => EN_EGYSEG[u][db === 1 ? 0 : 1],
  kozott: (a, b) => `between ${a} and ${b}`,
  hetNapjai: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  kisbetu: (s) => s.charAt(0).toLocaleLowerCase('en-GB') + s.slice(1),
}

export const formatum = (nyelv: Nyelv): Formatum => (nyelv === 'en' ? EN : HU)

export const FELIRAT = {
  hu: {
    bennevan: 'benne van',
    nincsbenne: 'nincs benne',
    egyedi: 'egyedi',
    terkepen: (nev: string) => `${nev} a térképen`,
    kevesebb: 'kevesebb',
    tobb: 'több',
    arHiba: 'Nem sikerült kiszámolni az árat és az időt:',
    napHiba: 'Nem sikerült betölteni a szabad időpontokat:',
    elozo: 'Előző hetek',
    kovetkezo: 'Következő hetek',
    forditas: '',
    hatalyos: 'Hatályos',
    tervezet: 'Tervezet: a szöveg jogi átnézés alatt áll, az adatok véglegesítése folyamatban van.',
    menu: 'Menü',
    menuBezar: 'Menü bezárása',
    fomenu: 'Főmenü',
    cegesValtozas: 'Ha bármi változás van, ezen a telefonszámon elérsz:',
  },
  en: {
    bennevan: 'included',
    nincsbenne: 'not included',
    egyedi: 'custom',
    terkepen: (nev: string) => `${nev} on the map`,
    kevesebb: 'fewer',
    tobb: 'more',
    arHiba: 'We could not calculate the price and duration:',
    napHiba: 'We could not load the available times:',
    elozo: 'Previous weeks',
    kovetkezo: 'Next weeks',
    forditas: 'This is an English translation provided for information. In case of any discrepancy, the Hungarian version prevails.',
    hatalyos: 'Effective from',
    tervezet: 'Draft: this text is under legal review and the details are being finalised.',
    menu: 'Menu',
    menuBezar: 'Close menu',
    fomenu: 'Main menu',
    cegesValtozas: 'If anything changes, you can reach us on this number:',
  },
} as const

const HU_HONAP = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december']
const EN_HONAP_HOSSZU = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function datumAngolul(hu: string): string {
  const m = /^(\d{4})\.\s*([a-záéíóöőúüű]+)\s+(\d{1,2})\.?$/i.exec(hu.trim())
  const ho = m ? HU_HONAP.indexOf(m[2].toLowerCase()) : -1
  return m && ho >= 0 ? `${Number(m[3])} ${EN_HONAP_HOSSZU[ho]} ${m[1]}` : hu
}

const HALOZATI = /load failed|failed to fetch|networkerror|network request failed|nem sikerült elérni a szervert/i

const HIBAK: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Add meg a neved\./, () => 'Please enter your name.'],
  [/^Add meg a telefonszámod\./, () => 'Please enter your phone number.'],
  [/^Add meg a rendszámot\./, () => 'Please enter the licence plate.'],
  [/^Válassz csomagot\./, () => 'Please choose a package.'],
  [/^Az e-mail cím formátuma nem (jó|megfelelő)\./, () => 'The e-mail address is not valid.'],
  [/^Válassz napot\./, () => 'Please choose a day.'],
  [/^Online legkorábban holnapra lehet foglalni\./, () => 'Online bookings can be made from tomorrow at the earliest.'],
  [/^Legfeljebb 8 hétre előre lehet foglalni\./, () => 'You can book up to 8 weeks in advance.'],
  [/^Ezen a napon zárva vagyunk\./, () => 'We are closed on this day.'],
  [/^Online csak/, () => 'Online you can only choose “I’ll wait” or “I’ll leave it”.'],
  [/^Full Service-nél az autót itt kell hagyni\./, () => 'With Full Service the car has to be left with us.'],
  [/^Válaszd ki, milyen az ülés\./, () => 'Please choose the seat type.'],
  [/^Ehhez az autóhoz a Full Service árát egyeztetni kell/, () => 'The Full Service price for this car has to be agreed in advance. Please give us a call.'],
  [/^A következő két hétben nincs olyan nap/, () => 'There is no day in the next two weeks when you could collect the car.'],
  [/^A határidő legkésőbb (\S+) lehet\./, (m) => `The latest possible ready time is ${m[1]}.`],
  [/^Ez a határidő túl korai: a munka legkorábban (\S+) körül készül el\./, (m) => `This ready time is too early: the work will be finished around ${m[1]} at the earliest.`],
  [/^A kérés nem küldhető el\./, () => 'The request cannot be sent.'],
  [/^A név legfeljebb 80 karakter/, () => 'The name can be at most 80 characters long.'],
  [/^A telefonszám túl hosszú\./, () => 'The phone number is too long.'],
  [/^Az e-mail cím túl hosszú\./, () => 'The e-mail address is too long.'],
  [/^A rendszám túl hosszú\./, () => 'The licence plate is too long.'],
  [/^A márka és a modell legfeljebb 40/, () => 'The make and the model can be at most 40 characters long each.'],
  [/^A megjegyzés legfeljebb 1000/, () => 'The note can be at most 1000 characters long.'],
  [/^Erről a telefonszámról már több kérés vár visszaigazolásra\. Kérjük, hívj minket: (.+?)\.?$/,
    (m) => `Several requests from this phone number are already waiting for confirmation. Please call us: ${m[1]}.`],
  [/^Most túl sok kérés érkezett\. Kérjük, próbáld újra később, vagy hívj minket: (.+?)\.?$/,
    (m) => `We are receiving too many requests right now. Please try again later, or call us: ${m[1]}.`],
  [/^Ez a foglalási link már nem érvényes\. Kérjük, hívj minket: (.+?)\.?$/,
    (m) => `This booking link is no longer valid. Please call us: ${m[1]}.`],
  [/^Ehhez a céghez most túl sok kérés vár visszaigazolásra\. Kérjük, hívj minket: (.+?)\.?$/,
    (m) => `Too many requests from this company are waiting for confirmation. Please call us: ${m[1]}.`],
  [/^Ez a csomag nem szerepel a cég szerződésében\./, () => 'This package is not part of your company’s contract.'],
  [/^Céges foglalásnál 7:30 és 17:00 között lehet időpontot választani\./, () => 'Company bookings can be made between 7:30 and 17:00.'],
  [HALOZATI, () => 'We could not reach the server. Please check your internet connection and try again.'],
]

export function hibaFordit(uzenet: string, nyelv: Nyelv): string {
  if (nyelv === 'hu') return uzenet
  for (const [minta, ki] of HIBAK) {
    const m = minta.exec(uzenet)
    if (m) return ki(m)
  }
  return `Something went wrong. Please try again, or give us a call. (${uzenet})`
}
