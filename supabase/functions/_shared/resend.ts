import type { Level } from './tipusok.ts'

export interface ResendBeallitas {
  kulcs: string
  felado: string
  valaszCim: string | null
}

export async function resendKuldes(b: ResendBeallitas, level: Level, kuldo: typeof fetch = fetch): Promise<string> {
  const valasz = await kuldo('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${b.kulcs}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: b.felado,
      to: [level.cimzett],
      subject: level.targy,
      html: level.html,
      text: level.szoveg,
      ...(b.valaszCim ? { reply_to: b.valaszCim } : {}),
    }),
  })
  const adat = await valasz.json().catch(() => null) as { id?: string; message?: string } | null
  if (!valasz.ok || !adat?.id) {
    throw new Error(`Resend ${valasz.status}: ${adat?.message ?? valasz.statusText}`)
  }
  return adat.id
}
