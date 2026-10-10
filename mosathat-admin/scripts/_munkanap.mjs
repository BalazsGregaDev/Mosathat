const napFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' })

export function munkanap() {
  const ma = napFmt.format(new Date())
  const d = new Date(`${ma}T12:00:00Z`)
  const plusz = d.getUTCDay() === 6 ? 2 : d.getUTCDay() === 0 ? 1 : 0
  d.setUTCDate(d.getUTCDate() + plusz)
  return { nap: d.toISOString().slice(0, 10), hetvege: plusz > 0 }
}

export function helyiIdo(nap, ora) {
  const del = new Date(`${nap}T12:00:00Z`)
  const eltolas = Number(del.toLocaleString('en-US', { timeZone: 'Europe/Budapest', hour: '2-digit', hour12: false })) - 12
  const [o, p] = ora.split(':').map(Number)
  const [ev, ho, n] = nap.split('-').map(Number)
  return new Date(Date.UTC(ev, ho - 1, n, o - eltolas, p))
}

export async function hetkoznapra(lap, ora = '09:40') {
  const { nap, hetvege } = munkanap()
  if (hetvege) await lap.clock.install({ time: helyiIdo(nap, ora) })
  return nap
}
