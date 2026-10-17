export const CEG = {
  nev: 'MOSATHAT Autóápolási Korlátolt Felelősségű Társaság',
  rovidNev: 'MOSATHAT Kft.',
  szekhely: '1138 Budapest, Váci út 140.',
  cegjegyzekszam: '01-09-861782',
  cegbirosag: 'Fővárosi Törvényszék Cégbírósága',
  adoszam: '13562496-2-41',
  email: 'info@mosathat.hu',
  telefon: '+36 1 506 0420',
  honlap: 'mosathat.hu',
}

export const JOGI_HATALY = '2026. október 17.'

export const TERVEZET = true

export const TARHELY = [
  {
    nev: 'Vercel Inc.',
    szerep: 'a weboldal tárhelye és kiszolgálása',
    cim: '440 N Barranca Avenue #4133, Covina, CA 91723, Amerikai Egyesült Államok',
    email: 'privacy@vercel.com',
  },
  {
    nev: 'Supabase Pte. Ltd.',
    szerep: 'az adatbázis és a háttérszolgáltatások tárhelye (adatközpont: Frankfurt, Németország)',
    cim: '65 Chulia Street #38-02/03, OCBC Centre, Szingapúr 049513',
    email: 'privacy@supabase.com',
  },
]

export const BEKELTETO = {
  nev: 'Budapesti Békéltető Testület',
  cim: '1016 Budapest, Krisztina krt. 99., I. emelet 111.',
  levelcim: '1253 Budapest, Pf. 10.',
  telefon: '+36 1 488 2131',
  email: 'bekelteto.testulet@bkik.hu',
  honlap: 'https://bekeltet.bkik.hu',
}

export const NAIH = {
  nev: 'Nemzeti Adatvédelmi és Információszabadság Hatóság (NAIH)',
  cim: '1055 Budapest, Falk Miksa utca 9-11.',
  levelcim: '1363 Budapest, Pf. 9.',
  telefon: '+36 1 391 1400',
  email: 'ugyfelszolgalat@naih.hu',
  honlap: 'https://naih.hu',
}

export const ADATFELDOLGOZOK = [
  {
    nev: 'Supabase Pte. Ltd.',
    cim: '65 Chulia Street #38-02/03, OCBC Centre, Szingapúr 049513',
    feladat: 'adatbázis, bejelentkezés, a visszaigazoló e-mailt indító háttérfüggvény (adatközpont: Frankfurt, Németország)',
  },
  {
    nev: 'Vercel Inc.',
    cim: '440 N Barranca Avenue #4133, Covina, CA 91723, Amerikai Egyesült Államok',
    feladat: 'a weboldal tárhelye és kiszolgálása',
  },
  {
    nev: 'Plus Five Five, Inc. (Resend)',
    cim: '2261 Market Street #5039, San Francisco, CA 94114, Amerikai Egyesült Államok',
    feladat: 'a visszaigazoló e-mailek kézbesítése',
  },
  {
    nev: 'Billingo Technologies Zrt.',
    cim: '1133 Budapest, Árbóc utca 6.',
    feladat: 'számlázóprogram: a számlák kiállítása, tárolása és a számlaadatok továbbítása a NAV-nak',
  },
  {
    nev: 'WLA Interservice Szolgáltató Kft.',
    cim: '1163 Budapest, Kócs utca 7.',
    feladat: `az ${CEG.email} e-mail fiók tárhelye`,
  },
  {
    nev: 'Könyvelő (a véglegesítéskor kerül feltüntetésre)',
    cim: '',
    feladat: 'könyvelés, számviteli és adózási feladatok',
  },
]

export interface Kamera {
  hely: string
  terulet: string
}
