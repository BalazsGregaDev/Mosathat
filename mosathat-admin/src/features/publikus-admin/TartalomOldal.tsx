import {
  useDeferredValue, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import { useApp } from '../../state/AppContext'
import { useMentetlen } from '../../state/useMentetlen'
import {
  KOZOS_VALTOZOK, SZOVEGEK, uzletbol, uzletValtozok, type SzovegDef, type SzovegKulcs,
} from '../../lib/publikusTartalom'
import { csomagbanBenne } from '../../lib/csomag'
import type { Catalog, PublikusAdat } from '../../data/source'
import type { DayLane, Quote } from '../../lib/types'
import type { Mod } from '../../lib/arculat'
import { KoncepcioResz, type KoncepcioReszNev } from '../arculat/Koncepcio'
import { FoglalasUrlap, type Bemutato, type FoglalasForras } from '../publikus/FoglalasModul'
import { TartalomProvider, useSz } from '../publikus/tartalom'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import { PubFej, useMentes } from './kozos'

type Szovegek = Record<SzovegKulcs, string>
type Lepes = 'auto' | 'csomag' | 'mit' | 'extrak' | 'tipus' | 'elvitel' | 'nap' | 'adatok' | 'osszeg' | 'siker'

interface Sav {
  id: string
  cim: string
  leiras: string
  kulcsok: SzovegKulcs[]
  oldalResz?: KoncepcioReszNev
  lepes?: Lepes
  bemutato?: (b: BemutatoAlap) => Bemutato
  fej?: boolean
  ful?: boolean
}

interface BemutatoAlap {
  csomagId: string | null
  extrak: Record<string, number>
}

const KISZAMOLT: BemutatoAlap = { csomagId: null, extrak: {} }

const SAVOK: Sav[] = [
  { id: 'menu', cim: 'Menüsor és böngészőfül', leiras: 'Az oldal teteje és a böngésző fülén megjelenő cím.', oldalResz: 'nav', ful: true,
    kulcsok: ['oldal.cim', 'menu.csomagok', 'menu.foglalas', 'menu.hely', 'menu.kapcsolat'] },
  { id: 'hero', cim: 'Nyitó rész', leiras: 'Az első, amit a látogató lát: felcím, nagy cím, két hasáb és a borítókép.', oldalResz: 'hero',
    kulcsok: ['hero.felcim', 'hero.cim', 'hero.bevezeto', 'hero.mellek', 'hero.borito_helye', 'hero.borito_alt'] },
  { id: 'csomagok', cim: 'Csomagok táblázat', leiras: 'A táblázat sorai és cellái a Csomagok menüben szerkeszthetők, itt a feliratai.', oldalResz: 'csomagok',
    kulcsok: ['csomagok.cim', 'csomagok.alcim.szemelyauto', 'csomagok.alcim.suv', 'csomagok.alcim.kisbusz', 'csomagok.kategoria',
      'csomagok.kat.szemelyauto', 'csomagok.kat.suv', 'csomagok.kat.kisbusz', 'csomagok.csoport.kulso', 'csomagok.csoport.belso'] },
  { id: 'fogl-fej', cim: 'Időpontfoglalás: cím és bevezető', leiras: 'A foglalás szakasz feje, a csomagtáblázat mellett.', fej: true,
    kulcsok: ['foglalas.cim', 'foglalas.bevezeto'] },
  { id: 'fogl-1', cim: '1. lépés: az autó', leiras: 'Az első kérdés és a három járműkategória.', lepes: 'auto', bemutato: () => ({}),
    kulcsok: ['foglalas.auto', 'foglalas.kat.szemelyauto', 'foglalas.kat.suv', 'foglalas.kat.kisbusz'] },
  { id: 'fogl-2', cim: '2. lépés: csomag és Full Service', leiras: 'Az előnézetben egy csomag és a Full Service ki van választva, hogy minden felirat látsszon.', lepes: 'csomag',
    bemutato: (b) => ({ csomagId: b.csomagId, fs: true, ules: 'KARPIT' }),
    kulcsok: ['foglalas.csomag', 'foglalas.arajanlat', 'foglalas.fs', 'foglalas.fs_leiras', 'foglalas.fs_csomaggal',
      'foglalas.ules', 'foglalas.ules.karpit', 'foglalas.ules.bor', 'foglalas.ules.karpit_bor'] },
  { id: 'fogl-3', cim: '3. lépés: mit csináljunk', leiras: 'Full Service-nél csak a teljes csomag választható, ezért a másik kettő halvány.', lepes: 'mit',
    bemutato: (b) => ({ csomagId: b.csomagId, fs: true, ules: 'KARPIT' }),
    kulcsok: ['foglalas.mit', 'foglalas.terjedelem.teljes', 'foglalas.terjedelem.kulso', 'foglalas.terjedelem.belso',
      'foglalas.telefonon', 'foglalas.fs_teljes'] },
  { id: 'fogl-4', cim: '4. lépés: extrák', leiras: 'Az előnézetben egy extra ki van pipálva.', lepes: 'extrak',
    bemutato: (b) => ({ csomagId: b.csomagId, extrak: b.extrak }),
    kulcsok: ['foglalas.extrak', 'foglalas.nem_kotelezo', 'foglalas.extrak_benne', 'foglalas.ar_egyeztetes'] },
  { id: 'fogl-5', cim: '5. lépés: megvárod vagy itt hagyod', leiras: 'Full Service nélkül ez az ötödik lépés.', lepes: 'tipus',
    bemutato: (b) => ({ csomagId: b.csomagId, tipus: 'LEADOS' }),
    kulcsok: ['foglalas.var_vagy_hagy', 'foglalas.varom', 'foglalas.varom_leiras', 'foglalas.hagyom', 'foglalas.hagyom_leiras'] },
  { id: 'fogl-5fs', cim: '5. lépés Full Service-nél: elvitel', leiras: 'Full Service-nél ez jelenik meg a „Megvárod vagy itt hagyod” helyett.', lepes: 'elvitel',
    bemutato: (b) => ({ csomagId: b.csomagId, fs: true, ules: 'KARPIT', elvitel: 'MASNAP' }),
    kulcsok: ['foglalas.elvitel', 'foglalas.elvitel_fs', 'foglalas.aznap', 'foglalas.aznap_vizes', 'foglalas.aznap_bor',
      'foglalas.masnap', 'foglalas.masnap_szarad', 'foglalas.masnap_leiras'] },
  { id: 'fogl-6', cim: '6–7. lépés: nap és időpont', leiras: 'A naptár, a napok állapota, az időpontok és a határidő. Az előnézet az „Itt hagyom” változat.', lepes: 'nap',
    bemutato: (b) => ({ csomagId: b.csomagId, tipus: 'LEADOS', napot: true, idot: true }),
    kulcsok: ['foglalas.nap', 'foglalas.allapot.szabad', 'foglalas.allapot.keves', 'foglalas.allapot.tele', 'foglalas.allapot.zarva',
      'foglalas.nincs_munkaido', 'foglalas.hozas', 'foglalas.kezdes', 'foglalas.kesz_kb', 'foglalas.nincs_ido', 'foglalas.hatarido',
      'foglalas.hatarido_savos', 'foglalas.hatarido_nincs', 'foglalas.elvitel_mikor', 'foglalas.elvitel_szamol', 'foglalas.erkezes'] },
  { id: 'fogl-8', cim: '8. lépés: adatok', leiras: 'Az űrlap, a feltétel és az adatvédelmi mondat.', lepes: 'adatok',
    bemutato: (b) => ({ csomagId: b.csomagId, tipus: 'LEADOS', napot: true, idot: true }),
    kulcsok: ['foglalas.adatok', 'foglalas.mezo.nev', 'foglalas.mezo.telefon', 'foglalas.mezo.email', 'foglalas.minta.email',
      'foglalas.mezo.rendszam', 'foglalas.mezo.marka', 'foglalas.mezo.modell', 'foglalas.mezo.megjegyzes', 'foglalas.minta.megjegyzes',
      'foglalas.feltetel', 'foglalas.adatvedelem'] },
  { id: 'fogl-osszeg', cim: 'Összegzés és küldés', leiras: 'A foglalás alján végig látszó sáv az árral és a küldés gombbal.', lepes: 'osszeg',
    bemutato: (b) => ({ csomagId: b.csomagId, tipus: 'LEADOS', napot: true, idot: true, extrak: b.extrak }),
    kulcsok: ['foglalas.hozas_cimke', 'foglalas.hatarido_cimke', 'foglalas.kezdes_cimke', 'foglalas.elvitel_cimke',
      'foglalas.egyeztetendo', 'foglalas.egyeztetendo_tetel', 'foglalas.kuldes', 'foglalas.kuldes_folyamatban'] },
  { id: 'fogl-siker', cim: 'Köszönő üzenet', leiras: 'Ez jelenik meg a foglalási kérés elküldése után.', lepes: 'siker',
    bemutato: () => ({ kesz: true }),
    kulcsok: ['foglalas.siker', 'foglalas.siker_elvitel', 'foglalas.siker_email', 'foglalas.siker_telefon', 'foglalas.uj'] },
  { id: 'hely', cim: 'Hol vagyunk', leiras: 'A címek és az adatok az Elérhetőség menüből jönnek, itt a feliratok.', oldalResz: 'hely',
    kulcsok: ['hely.cim', 'hely.bevezeto', 'cimke.cim', 'cimke.nyitvatartas', 'cimke.leadas', 'cimke.telefon',
      'hely.utvonal', 'hely.terkep_szoveg', 'hely.terkep_gomb'] },
  { id: 'lab', cim: 'Lábléc', leiras: 'Az oldal alja. A Cím és a Nyitvatartás felirat a Hol vagyunk sávban módosítható.', oldalResz: 'lab',
    kulcsok: ['lab.leiras', 'lab.leadas', 'cimke.kapcsolat', 'gomb.idopont', 'lab.impresszum', 'lab.adatvedelem'] },
]

const MIKOR: Partial<Record<SzovegKulcs, string>> = {
  'hero.borito_alt': 'Nem látszik: a képernyőolvasó olvassa fel a borítókép helyett.',
  'hero.borito_helye': 'Csak addig látszik, amíg nincs feltöltve borítókép.',
  'foglalas.arajanlat': 'Csak akkor látszik, ha egy csomagnak nincs fix ára.',
  'foglalas.telefonon': 'Csak akkor látszik, ha egy terjedelem nem foglalható online.',
  'foglalas.ar_egyeztetes': 'Csak az egyeztetendő árú extráknál látszik.',
  'foglalas.allapot.zarva': 'A zárva tartó napokon látszik a naptárban (az előnézetben szombaton).',
  'foglalas.nincs_munkaido': 'Csak akkor látszik, ha egy választáshoz nincs megadva munkaidő.',
  'foglalas.kezdes': 'A „Megvárom” választásnál látszik, az előnézet az „Itt hagyom” változat.',
  'foglalas.nincs_ido': 'Csak akkor látszik, ha a kiválasztott napon már nincs szabad időpont.',
  'foglalas.hatarido_nincs': 'Csak akkor látszik, ha a választott hozási időre nem vállalható határidő.',
  'foglalas.elvitel_mikor': 'Full Service-nél, másnapi elvitelnél látszik az időpontok alatt.',
  'foglalas.elvitel_szamol': 'Egy pillanatig látszik, amíg az elvitel napja számolódik.',
  'foglalas.kezdes_cimke': 'A „Megvárom” választásnál látszik.',
  'foglalas.elvitel_cimke': 'Full Service-nél, másnapi elvitelnél látszik.',
  'foglalas.egyeztetendo': 'Csak egyeztetendő árú extra választásakor látszik.',
  'foglalas.egyeztetendo_tetel': 'Csak egyeztetendő árú extra választásakor látszik.',
  'foglalas.kuldes_folyamatban': 'A küldés gombon látszik, amíg a kérés elmegy.',
  'foglalas.siker_telefon': 'Akkor látszik az e-mailes mondat helyett, ha a foglaló nem adott meg e-mail címet.',
}

const LISTA: readonly SzovegDef[] = SZOVEGEK
const DEF = Object.fromEntries(LISTA.map((s) => [s.kulcs, s])) as Record<SzovegKulcs, SzovegDef>

function kezdo(sajat: Record<string, string> | undefined): Szovegek {
  return Object.fromEntries(LISTA.map((s) => [s.kulcs, sajat?.[s.kulcs]?.trim() ? sajat[s.kulcs] : s.alap])) as Szovegek
}

const kisbetu = (s: string) => s.toLocaleLowerCase('hu')

const ido = (p: number) => `${String(Math.floor(p / 60)).padStart(2, '0')}:${String(p % 60).padStart(2, '0')}`

function negyedek(tol: number, ig: number, lanes: number): DayLane[] {
  const ki: DayLane[] = []
  for (let t = tol; t < ig; t += 15) ki.push({ starts: ido(t), ends: ido(t + 15), lanes })
  return ki
}

function bemutatoForras(k: Catalog): FoglalasForras {
  const savok = (d: string): DayLane[] => {
    const hetnap = new Date(`${d}T12:00:00`).getDay()
    if (hetnap === 0 || hetnap === 6) return []
    if (hetnap === 3) return negyedek(8 * 60, 11 * 60, 1)
    if (hetnap === 4) return negyedek(8 * 60, 9 * 60 + 30, 1)
    return negyedek(8 * 60, 17 * 60, 2)
  }
  return {
    getDay: async () => [],
    getDayLanes: async (d) => savok(d),
    onlineBooking: async () => 'bemutato',
    quoteBooking: async (i) => {
      const pp = k.packagePricing.find((x) => x.package_id === i.package_id && x.category === i.category && x.scope === (i.scope ?? 'TELJES'))
      const fs = i.full_service ? k.fullServicePricing.find((x) => x.package_id === i.package_id && x.category === i.category) : null
      const extrak = (i.extras ?? []).reduce((o, e) => o + (k.extras.find((x) => x.id === e.extra_id)?.price_huf ?? 0) * e.quantity, 0)
      const q: Quote = {
        price_huf: (fs?.price_huf ?? pp?.price_huf ?? 0) + extrak,
        work_minutes: pp?.duration_minutes ?? 90, rest_minutes: 0, requires_quote: false, duration_known: true,
        lines: [], company_id: null, contract_id: null, contract_kind: null, contract_price: false, contract_prices: {},
      }
      return q
    },
  }
}

function bemutatoAlap(k: Catalog): BemutatoAlap {
  const csomagok = k.packages.filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order)
  const vanFs = (id: string) => k.fullServicePricing.some((f) => f.package_id === id && f.category === 'SZEMELYAUTO' && f.price_huf != null && !f.requires_quote)
  const csomag = (csomagok[1] && vanFs(csomagok[1].id) ? csomagok[1] : csomagok.find((p) => vanFs(p.id))) ?? csomagok[1] ?? csomagok[0] ?? null
  const extra = k.extras
    .filter((e) => e.active && !csomagbanBenne(e, csomag?.id ?? null, 'TELJES', false))
    .sort((a, b) => a.sort_order - b.sort_order)[0]
  return { csomagId: csomag?.id ?? null, extrak: extra ? { [extra.id]: 1 } : {} }
}

function Elonezet({ szel, children }: { szel: number; children: ReactNode }) {
  const hely = useRef<HTMLDivElement>(null)
  const [arany, setArany] = useState(1)
  useLayoutEffect(() => {
    const h = hely.current
    if (!h) return
    const szamol = () => setArany(Math.min(1, h.clientWidth / szel))
    szamol()
    const figyelo = new ResizeObserver(szamol)
    figyelo.observe(h)
    return () => figyelo.disconnect()
  }, [szel])
  return (
    <div className="pub-elonezet-hely" ref={hely}>
      <div className="pub-elonezet-lap" style={{ width: szel, zoom: arany }}>{children}</div>
    </div>
  )
}

function BongeszoFul() {
  const sz = useSz()
  return (
    <div className="pub-bongeszo" aria-hidden="true">
      <span className="pub-bongeszo-pottyok"><i /><i /><i /></span>
      <span className="pub-bongeszo-ful">{sz('oldal.cim')}</span>
    </div>
  )
}

function FoglalasFej({ mod }: { mod: Mod }) {
  const sz = useSz()
  return (
    <div className="kv" data-k="03" data-mod={mod === 'SOTET' ? 'sotet' : 'vilagos'}>
      <section className="kv-foglalas kv-foglalas-elo pub-fogl-elonezet">
        <h2>{sz('foglalas.cim')}</h2>
        <p className="kv-bevezeto">{sz('foglalas.bevezeto')}</p>
      </section>
    </div>
  )
}

function FoglalasLepes({ lepes, bemutato, mod, k, lemondasOra, forras }: {
  lepes: Lepes
  bemutato: Bemutato
  mod: Mod
  k: Catalog
  lemondasOra: number
  forras: FoglalasForras
}) {
  const id = useId()
  return (
    <div className="kv" data-k="03" data-mod={mod === 'SOTET' ? 'sotet' : 'vilagos'}>
      <section className="kv-foglalas kv-foglalas-elo pub-fogl-elonezet" data-elonezet={id}>
        <style>{`[data-elonezet="${id}"] .fogl > :not([data-lepes="${lepes}"]) { display: none !important; }`}</style>
        <FoglalasUrlap data={forras} katalogus={k} revision={0} refresh={() => {}} nyilvanos
                       lemondasOra={lemondasOra} bemutato={bemutato} />
      </section>
    </div>
  )
}

function SavElonezet({ sav, pub, forras, alap }: {
  sav: Sav
  pub: PublikusAdat
  forras: FoglalasForras
  alap: BemutatoAlap
}) {
  const mod: Mod = pub.arculat === '03' && pub.mod ? pub.mod : 'VILAGOS'
  if (sav.oldalResz) {
    return (
      <Elonezet szel={1280}>
        {sav.ful && <BongeszoFul />}
        <KoncepcioResz resz={sav.oldalResz} mod={mod} k={pub.katalogus} />
      </Elonezet>
    )
  }
  if (sav.fej) return <Elonezet szel={660}><FoglalasFej mod={mod} /></Elonezet>
  if (sav.lepes && sav.bemutato) {
    return (
      <Elonezet szel={660}>
        <FoglalasLepes lepes={sav.lepes} bemutato={sav.bemutato(alap)} mod={mod} k={pub.katalogus}
                       lemondasOra={pub.lemondasOra} forras={forras} />
      </Elonezet>
    )
  }
  return null
}

export default function TartalomOldal() {
  const { data } = useApp()
  const { adat: pub, frissit } = usePublikusAdat()
  const [alap, setAlap] = useState(pub)
  const [v, setV] = useState<Szovegek>(() => kezdo(pub?.tartalom.szovegek))
  const [keres, setKeres] = useState('')
  const { allapot, fut } = useMentes()

  if (pub !== alap) {
    setAlap(pub)
    setV(kezdo(pub?.tartalom.szovegek))
  }

  const eredeti = useMemo(() => kezdo(pub?.tartalom.szovegek), [pub])
  const valtozottak = LISTA.filter((s) => v[s.kulcs as SzovegKulcs] !== eredeti[s.kulcs as SzovegKulcs])
  useMentetlen(valtozottak.length > 0)

  const kesleltetett = useDeferredValue(v)
  const elonezetTartalom = useMemo(
    () => (pub ? { ...pub.tartalom, szovegek: kesleltetett } : null),
    [pub, kesleltetett],
  )
  const forras = useMemo(() => (pub ? bemutatoForras(pub.katalogus) : null), [pub])
  const bAlap = useMemo(() => (pub ? bemutatoAlap(pub.katalogus) : KISZAMOLT), [pub])
  const valtozok = useMemo(() => (pub ? uzletValtozok(uzletbol(pub.tartalom), pub.lemondasOra) : {}), [pub])

  if (!pub || !elonezetTartalom || !forras) return <div className="betolt">Betöltés…</div>

  const q = kisbetu(keres.trim())
  const latszik = (k: SzovegKulcs, sav: Sav) => !q || kisbetu(DEF[k].cimke).includes(q) || kisbetu(DEF[k].alap).includes(q)
    || kisbetu(v[k]).includes(q) || kisbetu(sav.cim).includes(q)
  const modositott = LISTA.filter((s) => v[s.kulcs as SzovegKulcs] !== s.alap).length

  return (
    <div className="oldal pub-oldal">
      <PubFej
        cim="Tartalom"
        alcim="A publikus oldal szövegei sávonként, a foglalás lépésenként. Minden sáv mellett az, ahogy a publikus oldalon kinéz."
        linkek={[['Publikus oldal megnyitása', '/publikus']]}
        valtozott={valtozottak.length > 0}
        allapot={allapot}
        onElvet={() => setV(eredeti)}
        onMent={() => void fut(async () => {
          const kuld: Record<string, string | null> = {}
          for (const s of valtozottak) {
            const uj = v[s.kulcs as SzovegKulcs]
            kuld[s.kulcs] = uj.trim() === '' || uj === s.alap ? null : uj
          }
          await data.savePublikusTartalom({ szovegek: kuld })
          await frissit()
        })}
      />

      <details className="panel pub-sugo">
        <summary>Beírható adatok és kiemelés</summary>
        <div className="panel-torzs">
          <ul>
            <li>
              <strong>Kapcsos zárójelben</strong> az adatok automatikusan beíródnak, például a
              {' '}<code>{'{telefon}'}</code> helyére a telefonszám. Így ha az Elérhetőség menüben változik valami,
              a szövegekben nem kell átírni.
            </li>
            <li><strong>Csillagok között</strong> a szöveg kiemelt lesz, például <code>*Évekig*</code>.</li>
            <li>A több soros mezőkben az Enter új sort kezd. Ha egy mezőt üresen hagysz, az eredeti szöveg áll vissza.</li>
          </ul>
          <div className="pub-valtozok">
            {KOZOS_VALTOZOK.map((x) => (
              <span key={x.nev} title={x.leiras}>
                <code>{`{${x.nev}}`}</code> {String(valtozok[x.nev] ?? '')}
              </span>
            ))}
          </div>
        </div>
      </details>

      <div className="pub-keres">
        <input className="beviteli" type="search" placeholder="Keresés a szövegek között" value={keres}
               onChange={(e) => setKeres(e.target.value)} aria-label="Keresés a szövegek között" />
        <span className="halk">{LISTA.length} szöveg, ebből {modositott} eltér az eredetitől</span>
      </div>

      <TartalomProvider t={elonezetTartalom} lemondasOra={pub.lemondasOra}>
        {SAVOK.map((sav) => {
          const mezok = sav.kulcsok.filter((k) => latszik(k, sav))
          if (mezok.length === 0) return null
          const szeles = Boolean(sav.oldalResz)
          return (
            <section key={sav.id} className="panel pub-sav" data-sav={sav.id}>
              <h3>{sav.cim}</h3>
              <div className="pub-sav-torzs" data-szeles={szeles || undefined}>
                <div className="pub-sav-elonezet">
                  <span className="pub-sav-cimke">Előnézet</span>
                  <SavElonezet sav={sav} pub={pub} forras={forras} alap={bAlap} />
                </div>
                <div className="pub-sav-mezok">
                  <p className="halk pub-sav-leiras">{sav.leiras}</p>
                  {mezok.map((k) => {
                    const s = DEF[k]
                    const ertek = v[k]
                    const elter = ertek !== s.alap
                    return (
                      <div key={k} className="pub-szoveg" data-kulcs={k} data-valtozott={ertek !== eredeti[k] || undefined}>
                        <div className="pub-szoveg-fej">
                          <label htmlFor={`sz-${k}`}>{s.cimke}</label>
                          {elter && <span className="cimke-pill">módosítva</span>}
                          {elter && (
                            <button type="button" className="btn btn-kicsi btn-csendes" onClick={() => setV({ ...v, [k]: s.alap })}>
                              Eredeti szöveg
                            </button>
                          )}
                        </div>
                        {s.sor ? (
                          <textarea id={`sz-${k}`} className="beviteli"
                                    rows={Math.min(8, Math.max(2, Math.ceil(ertek.length / 42) + ertek.split('\n').length - 1))}
                                    value={ertek} placeholder={s.alap} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
                        ) : (
                          <input id={`sz-${k}`} className="beviteli" value={ertek} placeholder={s.alap}
                                 onChange={(e) => setV({ ...v, [k]: e.target.value })} />
                        )}
                        {MIKOR[k] && <small className="pub-mikor">{MIKOR[k]}</small>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}
      </TartalomProvider>
    </div>
  )
}

export const SAV_KULCSOK = SAVOK.flatMap((s) => s.kulcsok)
