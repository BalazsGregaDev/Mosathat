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

export const JOGI_CIM = { impresszum: 'Impresszum', adatvedelem: 'Adatvédelmi tájékoztató' } as const

export const JOGI_CIM_EN = { impresszum: 'Legal notice', adatvedelem: 'Privacy policy' } as const

export const JOGI_HATALY = '2026. október 17.'

export const TERVEZET = true

export const TARHELY = [
  {
    nev: 'Vercel Inc.',
    szerep: 'a weboldal tárhelye és kiszolgálása',
    szerepEn: 'hosting and serving the website',
    cim: '440 N Barranca Avenue #4133, Covina, CA 91723, Amerikai Egyesült Államok',
    cimEn: '440 N Barranca Avenue #4133, Covina, CA 91723, United States',
    email: 'privacy@vercel.com',
  },
  {
    nev: 'Supabase Pte. Ltd.',
    szerep: 'az adatbázis és a háttérszolgáltatások tárhelye (adatközpont: Frankfurt, Németország)',
    szerepEn: 'hosting the database and backend services (data centre: Frankfurt, Germany)',
    cim: '65 Chulia Street #38-02/03, OCBC Centre, Szingapúr 049513',
    cimEn: '65 Chulia Street #38-02/03, OCBC Centre, Singapore 049513',
    email: 'privacy@supabase.com',
  },
]

export const BEKELTETO = {
  nev: 'Budapesti Békéltető Testület',
  nevEn: 'Budapest Conciliation Board (Budapesti Békéltető Testület)',
  cim: '1016 Budapest, Krisztina krt. 99., I. emelet 111.',
  cimEn: '1016 Budapest, Krisztina krt. 99., 1st floor, room 111',
  levelcim: '1253 Budapest, Pf. 10.',
  telefon: '+36 1 488 2131',
  email: 'bekelteto.testulet@bkik.hu',
  honlap: 'https://bekeltet.bkik.hu',
}

export const NAIH = {
  nev: 'Nemzeti Adatvédelmi és Információszabadság Hatóság (NAIH)',
  nevEn: 'Hungarian National Authority for Data Protection and Freedom of Information (NAIH)',
  cim: '1055 Budapest, Falk Miksa utca 9-11.',
  levelcim: '1363 Budapest, Pf. 9.',
  telefon: '+36 1 391 1400',
  email: 'ugyfelszolgalat@naih.hu',
  honlap: 'https://naih.hu',
}

export interface AdatfeldolgozoAlap {
  nev: string
  nevEn: string
  cim: string
  cimEn: string
  feladat: string
  feladatEn: string
  konyvelo?: boolean
  levelezes?: boolean
}

export const ADATFELDOLGOZOK: AdatfeldolgozoAlap[] = [
  {
    nev: 'Supabase Pte. Ltd.',
    nevEn: 'Supabase Pte. Ltd.',
    cim: '65 Chulia Street #38-02/03, OCBC Centre, Szingapúr 049513',
    cimEn: '65 Chulia Street #38-02/03, OCBC Centre, Singapore 049513',
    feladat: 'adatbázis, bejelentkezés, a visszaigazoló e-mailt indító háttérfüggvény (adatközpont: Frankfurt, Németország)',
    feladatEn: 'database, sign-in, and the backend function that sends the confirmation e-mail (data centre: Frankfurt, Germany)',
  },
  {
    nev: 'Vercel Inc.',
    nevEn: 'Vercel Inc.',
    cim: '440 N Barranca Avenue #4133, Covina, CA 91723, Amerikai Egyesült Államok',
    cimEn: '440 N Barranca Avenue #4133, Covina, CA 91723, United States',
    feladat: 'a weboldal tárhelye és kiszolgálása',
    feladatEn: 'hosting and serving the website',
  },
  {
    nev: 'Plus Five Five, Inc. (Resend)',
    nevEn: 'Plus Five Five, Inc. (Resend)',
    cim: '2261 Market Street #5039, San Francisco, CA 94114, Amerikai Egyesült Államok',
    cimEn: '2261 Market Street #5039, San Francisco, CA 94114, United States',
    feladat: 'a visszaigazoló e-mailek kézbesítése',
    feladatEn: 'delivering the confirmation e-mails',
  },
  {
    nev: 'Billingo Technologies Zrt.',
    nevEn: 'Billingo Technologies Zrt.',
    cim: '1133 Budapest, Árbóc utca 6.',
    cimEn: '1133 Budapest, Árbóc utca 6.',
    feladat: 'számlázóprogram: a számlák kiállítása, tárolása és a számlaadatok továbbítása a NAV-nak',
    feladatEn: 'invoicing software: issuing and storing invoices and reporting invoice data to the Hungarian Tax Authority (NAV)',
  },
  {
    nev: 'WLA Interservice Szolgáltató Kft.',
    nevEn: 'WLA Interservice Szolgáltató Kft.',
    cim: '1163 Budapest, Kócs utca 7.',
    cimEn: '1163 Budapest, Kócs utca 7.',
    feladat: `az ${CEG.email} e-mail fiók tárhelye`,
    feladatEn: `hosting of the ${CEG.email} mailbox`,
    levelezes: true,
  },
  {
    nev: 'Könyvelő (a véglegesítéskor kerül feltüntetésre)',
    nevEn: 'Accountant (to be specified on finalisation)',
    cim: '',
    cimEn: '',
    feladat: 'könyvelés, számviteli és adózási feladatok',
    feladatEn: 'bookkeeping, accounting and tax tasks',
    konyvelo: true,
  },
]

export interface Kamera {
  hely: string
  terulet: string
  hely_en?: string | null
  terulet_en?: string | null
}
