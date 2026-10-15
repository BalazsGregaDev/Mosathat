import { useMemo, useState } from 'react'

import { useApp, useCatalog } from '../../state/AppContext'
import { useDay } from '../../state/useDay'
import { munkaCimke } from '../../state/napBeosztas'
import { keresElhelyez, type Elhelyezes, type Lehetoseg } from '../../lib/befer'
import {
  ft, helyiNap, helyiOra, hibaSzoveg, idotartam, maStr, mostPerc, napCim, napMulva, napRovidCim, ota,
  percEjfeltol, percOra, relativNap,
} from '../../lib/format'
import {
  CATEGORY_LABEL, SCOPE_LABEL, STATUS_LABEL, TYPE_LABEL, ULES_LABEL, type BookingStatus, type OnlineKeres,
} from '../../lib/types'
import Ablak from '../common/Ablak'
import { useKerdes } from '../common/Kerdes'
import { ELUTASITAS_KERDES } from '../common/kerdesek'
import CapacityPanel from '../day/CapacityPanel'
import Idovonal from '../day/Idovonal'

export default function KeresAblak({
  keres,
  sorszam,
  osszes,
  ugyanarra,
  onLapoz,
  onKesobb,
  onMegnyit,
  onZarol,
  onDontott,
}: {
  keres: OnlineKeres
  sorszam: number
  osszes: number
  ugyanarra: number
  onLapoz: (irany: 1 | -1) => void
  onKesobb: () => void
  onMegnyit: (id: string) => void
  onZarol: (be: boolean) => void
  onDontott: () => void
}) {
  const { data, user, refresh } = useApp()
  const katalogus = useCatalog()
  const nap = keres.service_date.slice(0, 10)
  const d = useDay(nap)
  const [kerdesAblak, kerdez] = useKerdes()
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [mar, setMar] = useState<BookingStatus | null>(null)
  const [levelHiba, setLevelHiba] = useState<string | null>(null)

  const teljesJogu = user?.role === 'SUPERADMIN' || user?.role === 'TULAJDONOS'
  const rendszam = (keres.plate_raw ?? '').toUpperCase()
  const varos = keres.booking_type === 'VAROS'
  const maiNap = nap === maStr()
  const auto = [keres.brand, keres.model].filter(Boolean).join(' ')
  const viszi = keres.pick_up_at ?? keres.deadline_at
  const viszNap = viszi ? helyiNap(viszi) : null
  const egyeztetendo = (keres.extras_summary ?? '').split(', ')
    .filter((n) => katalogus.extras.some((e) => e.name === n && (e.requires_quote || e.price_huf == null)))

  const hely = useMemo<Elhelyezes | null>(() => {
    if (d.loading || d.error) return null
    const sor = d.bookings.find((b) => b.id === keres.id) ?? keres
    return keresElhelyez(sor, d.bookings, d.lanes, maiNap ? mostPerc() : null, munkaCimke)
  }, [d.loading, d.error, d.bookings, d.lanes, keres, maiNap])

  const c = d.capacity
  const vele = c?.load_pct != null ? Math.round(c.load_pct) : null
  const nelkule = c && c.capacity_minutes > 0
    ? Math.max(0, Math.round(((c.booked_minutes - keres.planned_duration_minutes) * 100) / c.capacity_minutes))
    : null
  const kesz = d.bookings.filter((b) => b.status === 'READY' || b.status === 'COMPLETED').length
  const szabadsagok = d.vacations.filter((v) => v.from_day.slice(0, 10) <= nap && v.to_day.slice(0, 10) >= nap)

  async function dont(elfogad: boolean) {
    if (megy) return
    if (!elfogad && !(await kerdez(ELUTASITAS_KERDES(rendszam)))) return
    setMegy(true)
    setHiba(null)
    onZarol(true)
    try {
      const eredmeny = await data.onlineKeresDontes(keres.id, elfogad)
      refresh()
      if (eredmeny !== 'OK') {
        setMar(eredmeny)
        onZarol(false)
        return
      }
      const gond = elfogad && keres.ugyfel_email ? await levelKuldes(keres.ugyfel_email) : null
      if (gond) setLevelHiba(gond)
      else onDontott()
    } catch (e) {
      setHiba(hibaSzoveg(e))
      onZarol(false)
    } finally {
      setMegy(false)
    }
  }

  async function levelKuldes(email: string): Promise<string | null> {
    try {
      const r = await data.ertesitesekKuldese()
      if (!r) return null
      const sajat = r.hibak.filter((h) => h.startsWith(`${email}:`))
      return sajat.length > 0 ? sajat.map((h) => h.slice(email.length + 1).trim()).join('; ') : null
    } catch (e) {
      return hibaSzoveg(e)
    }
  }

  const levelTipp = !keres.ugyfel_email
    ? 'Nincs e-mail címe, ezért a visszaigazolást telefonon kell megadni.'
    : data.isDemo
      ? 'Élesben elfogadáskor visszaigazoló e-mailt kap, benne a lemondó linkkel. Demóban e-mail nem megy ki.'
      : 'Elfogadáskor visszaigazoló e-mailt kap, benne a lemondó linkkel.'

  return (
    <Ablak cimke="Online foglalási kérés" onEsc={levelHiba ? onDontott : onKesobb}>
      <div className="lap keres-lap">
        <div className="lap-fej">
          <div>
            <h2>Online foglalási kérés</h2>
            <div className="halk" style={{ fontSize: 'var(--m-sm)' }}>
              Beérkezett: {relativNap(helyiNap(keres.beerkezett)).toLowerCase()} {helyiOra(keres.beerkezett)}
              {' · '}{ota(keres.beerkezett)}
            </div>
          </div>
          {osszes > 1 && (
            <div className="keres-lapozo">
              <button type="button" className="btn btn-kicsi" onClick={() => onLapoz(-1)}
                      aria-label="Előző kérés">‹</button>
              <span>{sorszam} / {osszes}</span>
              <button type="button" className="btn btn-kicsi" onClick={() => onLapoz(1)}
                      aria-label="Következő kérés">›</button>
            </div>
          )}
          <button type="button" className="bezar" onClick={onKesobb} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          {mar && (
            <div className="figyelmeztet">
              <span>Ezt a kérést közben már kezelték: <strong>{STATUS_LABEL[mar]}</strong>.</span>
            </div>
          )}
          {hiba && <div className="hibauzenet">{hiba}</div>}
          {levelHiba && (
            <div className="figyelmeztet">
              <span>
                <strong>Elfogadva, de a visszaigazoló e-mail nem ment ki.</strong> Hívd fel az ügyfelet:{' '}
                <a href={`tel:${keres.customer_phone}`}>{keres.customer_phone}</a>.
                <br /><small>{levelHiba}</small>
              </span>
            </div>
          )}

          <div className="keres-racs">
            <div className="keres-bal">
              <section className="szakasz">
                <div className="fej">Kérés</div>
                <div className="keres-auto">
                  <span className="rendszam">{rendszam}</span>
                  <span>{auto || CATEGORY_LABEL[keres.category]}</span>
                </div>
                <dl className="keres-adatok">
                  <dt>Nap</dt>
                  <dd>{napCim(nap)} <span className="halk">({napMulva(nap)})</span></dd>
                  <dt>Mikor</dt>
                  <dd>
                    {TYPE_LABEL[keres.booking_type]}
                    {' · '}
                    {varos && keres.start_at
                      ? `kezdés ${helyiOra(keres.start_at)}, kész ${percOra(percEjfeltol(keres.start_at) + keres.planned_duration_minutes)}`
                      : `hozza ${helyiOra(keres.drop_off_at) || '—'}`}
                    {!varos && viszi && viszNap && (
                      viszNap > nap
                        ? <>, viszi {napRovidCim(viszNap)} {helyiOra(viszi)} után</>
                        : <>, viszi {helyiOra(viszi)}</>
                    )}
                  </dd>
                  <dt>Mit</dt>
                  <dd>
                    {keres.package_name ?? 'csomag nélkül'}
                    {keres.full_service && (
                      <strong> + Full Service{keres.seat_material ? ` (${ULES_LABEL[keres.seat_material].toLowerCase()})` : ''}</strong>
                    )}
                    {' · '}{SCOPE_LABEL[keres.scope]} · {CATEGORY_LABEL[keres.category]}
                    {keres.extras_summary && <span className="halk"> + {keres.extras_summary}</span>}
                  </dd>
                  <dt>Munka</dt>
                  <dd>{idotartam(keres.planned_duration_minutes)}</dd>
                  <dt>Ár</dt>
                  <dd>
                    <strong>{ft(keres.estimated_price_huf)}</strong>
                    {egyeztetendo.length > 0 && (
                      <span className="keres-egyeztet"> + egyeztetendő: {egyeztetendo.join(', ')}</span>
                    )}
                  </dd>
                  {keres.notes && (
                    <>
                      <dt>Megjegyzés</dt>
                      <dd className="keres-megjegyzes">„{keres.notes}”</dd>
                    </>
                  )}
                </dl>
              </section>

              <section className="szakasz">
                <div className="fej">Ügyfél</div>
                <div className="keres-ugyfel">
                  <strong>{keres.customer_name}</strong>
                  <a href={`tel:${keres.customer_phone}`} className="hivas">{keres.customer_phone}</a>
                  {keres.ugyfel_email && <a href={`mailto:${keres.ugyfel_email}`}>{keres.ugyfel_email}</a>}
                </div>
                <div className="keres-cimkek">
                  {keres.korabbi_db === 0 ? (
                    <span className="cimke-pill" data-r="uj">Új ügyfél</span>
                  ) : (
                    <span className="cimke-pill" data-r="visszatero">
                      Visszatérő: {keres.korabbi_db} munka
                      {keres.utolso_nap && `, utoljára ${napRovidCim(keres.utolso_nap)}`}
                    </span>
                  )}
                  {keres.nem_jott_db > 0 && (
                    <span className="cimke-pill" data-r="baj">{keres.nem_jott_db}× nem jött el</span>
                  )}
                  {keres.lemondta_db > 0 && (
                    <span className="cimke-pill" data-r="figyel">{keres.lemondta_db}× lemondta</span>
                  )}
                </div>
                <p className="halk keres-tipp">{levelTipp}</p>
              </section>

              <section className="szakasz">
                <div className="fej">Hova fér be</div>
                <Itelet hely={hely} varos={varos} betolt={d.loading} hiba={d.error} />
                {ugyanarra > 0 && (
                  <p className="halk keres-tipp">Erre a napra még {ugyanarra} másik kérés vár.</p>
                )}
              </section>
            </div>

            <div className="keres-jobb">
              {c && (
                <>
                  {nelkule !== null && vele !== null && (
                    <div className="keres-foglaltsag">
                      <span>Foglaltság</span>
                      <strong>{nelkule}% → {vele}%</strong>
                      <span className="halk">nélküle → ezzel együtt</span>
                    </div>
                  )}
                  <CapacityPanel c={c} windows={d.windows} valtozasok={d.absences} szabadsagok={szabadsagok}
                                 kesz={kesz} teljesJogu={teljesJogu} ma={maiNap} />
                </>
              )}
            </div>
          </div>

          {!d.loading && d.lanes.length > 0 && (
            <Idovonal nap={nap} foglalasok={d.bookings} savok={d.lanes} startPerc={d.startPerc}
                      onMegnyit={onMegnyit} kiemelt={keres.id} />
          )}
        </div>

        {levelHiba ? (
          <div className="lap-lab keres-lab">
            <div className="gombok">
              <button type="button" className="btn btn-fo" onClick={onDontott}>Rendben</button>
            </div>
          </div>
        ) : (
          <div className="lap-lab keres-lab">
            <button type="button" className="btn" onClick={onKesobb} disabled={megy}>Később</button>
            <button type="button" className="btn" onClick={() => onMegnyit(keres.id)} disabled={megy}>Munkalap</button>
            <div className="gombok">
              <button type="button" className="btn btn-veszelyes" onClick={() => void dont(false)}
                      disabled={megy || mar !== null}>
                Elutasítom
              </button>
              <button type="button" className="btn btn-fo" onClick={() => void dont(true)}
                      disabled={megy || mar !== null}>
                {megy ? 'Mentés…' : 'Elfogadom'}
              </button>
            </div>
          </div>
        )}
      </div>
      {kerdesAblak}
    </Ablak>
  )
}

function kozeli(lista: Lehetoseg[], cel: number | null, db = 6): Lehetoseg[] {
  const t = cel ?? 0
  return [...lista]
    .sort((a, b) => Math.abs(a.tol - t) - Math.abs(b.tol - t))
    .slice(0, db)
    .sort((a, b) => a.tol - b.tol)
}

function Itelet({ hely, varos, betolt, hiba }: {
  hely: Elhelyezes | null
  varos: boolean
  betolt: boolean
  hiba: string | null
}) {
  if (hiba) return <div className="hibauzenet">{hiba}</div>
  if (betolt || !hely) return <div className="betolt">Számolás…</div>
  if (!hely.nyitva) {
    return <div className="keres-itelet" data-befer="false"><strong>Ezen a napon zárva vagyunk.</strong></div>
  }

  const helyek = hely.darabok.map((x) => `${x.sor + 1}. hely ${percOra(x.tol)}–${percOra(x.ig)}`).join(', ')
  const kesz = hely.kesz !== null ? percOra(hely.kesz) : null

  if (hely.befer) {
    return (
      <div className="keres-itelet" data-befer="true">
        <strong>Befér</strong>
        {varos ? (
          <span>{helyek}</span>
        ) : (
          <>
            <span>Kész kb. {kesz ?? '—'}</span>
            {helyek && <span className="halk">Beosztás: {helyek}</span>}
          </>
        )}
      </div>
    )
  }

  const alternativak = kozeli(hely.alternativak, hely.tol)
  return (
    <div className="keres-itelet" data-befer="false">
      <strong>Így nem fér be</strong>
      <ul>
        {hely.gondok.map((g, i) => <li key={i}>{g}</li>)}
      </ul>
      {alternativak.length > 0 ? (
        <span>
          {varos ? 'Szabad kezdések ezen a napon: ' : 'Ha máskor hozza: '}
          {alternativak
            .map((a) => (varos ? percOra(a.tol) : `${percOra(a.tol)} (kész ${a.kesz !== null ? percOra(a.kesz) : '—'})`))
            .join(', ')}
        </span>
      ) : (
        <span>Ezen a napon nincs olyan időpont, ahová beférne.</span>
      )}
    </div>
  )
}
