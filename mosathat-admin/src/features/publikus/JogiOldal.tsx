import { BEKELTETO, JOGI_CIM, JOGI_CIM_EN, NAIH, TARHELY } from '../../lib/ceg'
import type { JogiBlokk, JogiLap } from '../../lib/jogiDokumentum'
import JogiDokumentum from './JogiDokumentum'
import { Adatkezeles, Keret, Level, Sor } from './jogiKozos'
import { ImpresszumEn, AdatvedelemEn } from './JogiOldalEn'
import { useCeg, useJogi, useNyelv } from './tartalom'

export type { JogiLap }

function Impresszum() {
  const ceg = useCeg()
  return (
    <Keret cim={JOGI_CIM.impresszum}>
      <h2>A szolgáltató adatai</h2>
      <dl className="kv-jogi-adatok">
        <Sor cimke="Cégnév">{ceg.nev}</Sor>
        <Sor cimke="Rövidített cégnév">{ceg.rovidNev}</Sor>
        <Sor cimke="Székhely">{ceg.szekhely}</Sor>
        <Sor cimke="Cégjegyzékszám">{ceg.cegjegyzekszam}</Sor>
        <Sor cimke="Nyilvántartó bíróság">{ceg.cegbirosag}</Sor>
        <Sor cimke="Adószám">{ceg.adoszam}</Sor>
        <Sor cimke="Telefon">{ceg.telefon}</Sor>
        <Sor cimke="E-mail"><Level cim={ceg.email} /></Sor>
      </dl>

      <h2>Tárhelyszolgáltatók</h2>
      <dl className="kv-jogi-adatok">
        {TARHELY.map((t) => (
          <Sor key={t.nev} cimke={t.nev}>
            {t.cim}<br />
            E-mail: <Level cim={t.email} /><br />
            <span className="kv-jogi-halk">Feladata: {t.szerep}.</span>
          </Sor>
        ))}
      </dl>

      <h2>Panaszkezelés</h2>
      <p>
        Ha valamivel nem vagy elégedett, panaszodat elmondhatod személyesen a helyszínen, telefonon
        ({ceg.telefon}), vagy megírhatod e-mailben (<Level cim={ceg.email} />) vagy postán a székhelyünkre
        ({ceg.szekhely}). A szóbeli panaszt azonnal megvizsgáljuk, és ha lehet, rögtön orvosoljuk; ha erre
        nincs mód, vagy nem értesz egyet a megoldással, jegyzőkönyvet veszünk fel róla. Az írásbeli
        panaszra a beérkezésétől számított 30 napon belül írásban, érdemben válaszolunk. A panaszról
        felvett jegyzőkönyvet és a válaszunkat három évig megőrizzük.
      </p>

      <h2>Békéltető testület</h2>
      <p>
        Ha a panaszodat nem sikerül rendeznünk, fogyasztóként a székhelyünk szerint illetékes
        békéltető testülethez fordulhatsz:
      </p>
      <dl className="kv-jogi-adatok">
        <Sor cimke="Név">{BEKELTETO.nev}</Sor>
        <Sor cimke="Székhely">{BEKELTETO.cim}</Sor>
        <Sor cimke="Levelezési cím">{BEKELTETO.levelcim}</Sor>
        <Sor cimke="Telefon">{BEKELTETO.telefon}</Sor>
        <Sor cimke="E-mail"><Level cim={BEKELTETO.email} /></Sor>
        <Sor cimke="Honlap"><a href={BEKELTETO.honlap} target="_blank" rel="noreferrer">{BEKELTETO.honlap.replace('https://', '')}</a></Sor>
      </dl>

      <p className="kv-jogi-halk">
        Az adatkezelésről az <a href="/adatvedelem">Adatvédelmi tájékoztatóban</a> olvashatsz.
      </p>
    </Keret>
  )
}

const SZERZODES = 'a szerződés megkötését megelőző lépések és a szerződés teljesítése (GDPR 6. cikk (1) b) pont)'
const ELEVULES = 'a szolgáltatás teljesítésétől számított 5 évig, a polgári jogi igények elévüléséig (Ptk. 6:22. §)'

function Adatvedelem() {
  const ceg = useCeg()
  const jogi = useJogi()
  const kamera = jogi.kamera
  return (
    <Keret cim={JOGI_CIM.adatvedelem}>
      <p>
        Ebben a tájékoztatóban leírjuk, milyen személyes adatokat kezelünk, mire használjuk őket,
        meddig őrizzük meg, kinek adjuk át, és milyen jogaid vannak. A tájékoztató az Európai Unió
        általános adatvédelmi rendelete (GDPR, 2016/679/EU rendelet) 13. cikke alapján készült.
      </p>

      <h2>1. Az adatkezelő</h2>
      <dl className="kv-jogi-adatok">
        <Sor cimke="Név">{ceg.nev} ({ceg.rovidNev})</Sor>
        <Sor cimke="Székhely">{ceg.szekhely}</Sor>
        <Sor cimke="Cégjegyzékszám">{ceg.cegjegyzekszam}</Sor>
        <Sor cimke="Adószám">{ceg.adoszam}</Sor>
        <Sor cimke="E-mail"><Level cim={ceg.email} /></Sor>
        <Sor cimke="Telefon">{ceg.telefon}</Sor>
      </dl>
      <p>
        Adatvédelmi tisztviselőt nem jelöltünk ki, mert tevékenységünk nem tartozik a GDPR 37. cikke
        szerint kötelező esetek közé. Adatvédelmi kérdésben a fenti elérhetőségeken kereshetsz minket.
      </p>

      <h2>2. Milyen adatokat kezelünk, és miért</h2>

      <Adatkezeles
        cim="2.1 Online időpontfoglalás"
        adatok="név, telefonszám, e-mail cím (nem kötelező), rendszám, az autó márkája és modellje (nem kötelező), megjegyzés (nem kötelező), a választott szolgáltatás, a kért időpont"
        cel="a foglalási kérés fogadása, az időpont egyeztetése és visszaigazolása, a szolgáltatás elvégzése"
        jogalap={SZERZODES}
        megorzes={<>teljesített foglalásnál {ELEVULES}; ha a kérésből nem lett foglalás (elutasítottuk, lemondtad vagy lejárt), a kérés lezárásától számított 1 évig</>}
      >
        <p>
          A név, a telefonszám és a rendszám megadása nélkül a kérést nem tudjuk fogadni, mert ezek kellenek
          az egyeztetéshez és az autó azonosításához. Az e-mail cím megadása önkéntes: ha megadod, ide küldjük a
          visszaigazolást és a foglalásod oldalának linkjét, ha nem, telefonon keresünk.
        </p>
        <p>
          Ha a megadott telefonszám már szerepel a nyilvántartásunkban, a kérést a meglévő ügyféladatokhoz
          kapcsoljuk, de a nyilvántartott adatokat a kérés alapján nem írjuk felül: az eltérést munkatársunk
          egyezteti veled.
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.2 Visszaigazoló e-mail és a foglalás oldala"
        adatok="e-mail cím, a foglalás adatai (időpont, szolgáltatás, ár, egy esetleges felár indoka), a foglalás oldalának titkos linkje, az oldalon küldött módosítási kérések szövege"
        cel="a foglalás visszaigazolása és állapotának követése, hogy online kérhess módosítást vagy lemondhasd az időpontot, és hogy szólhassunk, ha elkészült az autód"
        jogalap={SZERZODES}
        megorzes={ELEVULES}
      >
        <p>
          A foglalás oldala egy titkos, kitalálhatatlan linken érhető el, amelyet e-mailben vagy tőlünk közvetlenül
          kapsz meg. Az oldal az autó átvétele után 10 napig, lemondott vagy elmaradt foglalásnál az eredeti időpont
          után 10 napig él, utána a link már nem mutat adatot. Az oldalon csak a foglalás adatai látszanak, a
          telefonszámod és az e-mail címed nem. Hírlevelet és reklám célú e-mailt nem küldünk.
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.3 Telefonos és személyes foglalás, ügyfél- és járműnyilvántartás"
        adatok="név, telefonszám, e-mail cím, rendszám, az autó adatai (márka, modell, kategória), a foglalások és elvégzett munkák adatai, a munkalap állapota, munkatársaink belső megjegyzései"
        cel="a szolgáltatás nyújtása, az ügyfél és az autó azonosítása, az elvégzett munkák visszakereshetősége"
        jogalap={SZERZODES}
        megorzes={ELEVULES}
      />

      <Adatkezeles
        cim="2.4 Kapcsolattartás e-mailben és telefonon"
        adatok="név, e-mail cím, telefonszám, a levél tartalma, valamint a telefonos egyeztetésből az, amit a foglaláshoz feljegyzünk"
        cel="kérdéseid megválaszolása, időpontok egyeztetése, a foglalással és az elvégzett munkával kapcsolatos ügyintézés"
        jogalap={<>ha a megkeresés foglaláshoz vagy szolgáltatáshoz kapcsolódik: {SZERZODES}; egyéb megkeresésnél a jogos érdekünk abban, hogy a hozzánk fordulóknak válaszolni tudjunk (GDPR 6. cikk (1) f) pont)</>}
        megorzes="a foglaláshoz kapcsolódó levelezést a foglalás adataival együtt (lásd 2.3 pont), az egyéb megkereséseket az ügy lezárásától számított 1 évig"
      >
        <p>
          E-mailben a hivatalos címünkön (<Level cim={ceg.email} />) tartjuk a kapcsolatot. A telefonhívásokat nem
          rögzítjük.
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.5 Céges ügyfelek kapcsolattartói"
        adatok="a kapcsolattartó neve, telefonszáma, e-mail címe"
        cel="kapcsolattartás a velünk szerződő céggel (flotta, bérlet, szerződéses árak)"
        jogalap="az adatkezelő és a szerződő cég jogos érdeke a szerződés teljesítéséhez szükséges kapcsolattartásban (GDPR 6. cikk (1) f) pont)"
        megorzes="a cégekkel kötött szerződés megszűnésétől számított 5 évig, vagy amíg a cég mást nem jelöl ki kapcsolattartónak"
      />

      <Adatkezeles
        cim="2.6 Számlázás"
        adatok="a számlán szereplő adatok: név vagy cégnév, cím, adószám (cégnél), a szolgáltatás és az ár"
        cel="számla kiállítása, a számlaadatok bejelentése az adóhatóságnak és a számviteli kötelezettségek teljesítése"
        jogalap="jogi kötelezettség teljesítése (GDPR 6. cikk (1) c) pont; a számvitelről szóló 2000. évi C. törvény 169. §; az általános forgalmi adóról szóló 2007. évi CXXVII. törvény 10. melléklete)"
        megorzes="8 évig (Számv. tv. 169. §)"
      >
        <p>
          A számlákat a Billingo számlázóprogrammal állítjuk ki, amely a számla adatait a jogszabály szerint
          automatikusan továbbítja a Nemzeti Adó- és Vámhivatal (NAV) online számla rendszerébe. Ha magánszemélyként
          kapod a számlát, a neved és a címed nem kerül a NAV-nak továbbított adatok közé. A NAV a kapott adatokat
          önálló adatkezelőként, a saját feladatai ellátásához kezeli.
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.7 Panaszkezelés"
        adatok="név, elérhetőség, a panasz leírása, a panaszról felvett jegyzőkönyv és a válaszunk"
        cel="a panasz kivizsgálása és megválaszolása"
        jogalap="jogi kötelezettség teljesítése (GDPR 6. cikk (1) c) pont; a fogyasztóvédelemről szóló 1997. évi CLV. törvény 17/A. §)"
        megorzes="3 évig (Fgytv. 17/A. § (7))"
      />

      <Adatkezeles
        cim="2.8 Kamerás megfigyelés a telephelyen"
        adatok="a megfigyelt területen tartózkodók képmása és mozgása, a járművek képe a rendszámmal együtt; hangot nem rögzítünk"
        cel="a telephely, a ránk bízott ügyfélautók, valamint a vállalkozás eszközeinek és anyagainak védelme; ha egy autón sérülést észlelnek, vagy a telephelyen baleset, lopás vagy rongálás történik, a körülmények tisztázása"
        jogalap="a vállalkozás és az ügyfeleink jogos érdeke a ránk bízott járművek és a vagyontárgyak védelmében (GDPR 6. cikk (1) f) pont); az érdekmérlegelés eredményét kérésre megismerheted"
        megorzes={kamera.megorzes
          ? `a rögzítéstől számított ${kamera.megorzes}, utána a rendszer automatikusan felülírja a felvételeket; ha egy felvételt hatósági vagy bírósági eljárásban, illetve kárigény rendezéséhez felhasználunk, az eljárás vagy az ügy lezárásáig megőrizzük`
          : 'a megőrzési időt a véglegesítéskor tüntetjük fel; ha egy felvételt hatósági vagy bírósági eljárásban, illetve kárigény rendezéséhez felhasználunk, az eljárás vagy az ügy lezárásáig megőrizzük'}
      >
        {kamera.kamerak.length > 0 ? (
          <>
            <p>A kamerák helye és az általuk látott terület:</p>
            <ul>
              {kamera.kamerak.map((k) => <li key={k.hely}><strong>{k.hely}:</strong> {k.terulet}</li>)}
            </ul>
          </>
        ) : (
          <p>A kamerák pontos helyét és az általuk látott területet a véglegesítéskor tüntetjük fel.</p>
        )}
        <p>
          A kamerák csak az általunk használt területet figyelik. Mosdóban, öltözőben és a munkatársak
          pihenőhelyiségében nincs kamera. A megfigyelt területre a bejáratnál figyelmeztető jelzés hívja fel a
          figyelmet. A felvételeket csak az erre felhatalmazott munkatársunk nézheti vissza, és csak akkor, ha erre
          konkrét ok van, például kárbejelentés vagy rongálás. Felvételt csak hatóság vagy bíróság megkeresésére,
          illetve bűncselekmény vagy kár esetén a feljelentéshez vagy a kárigény rendezéséhez adunk át.
        </p>
        <p>
          Ha egy felvételen szerepelsz, a megőrzési időn belül kérheted, hogy megnézhesd, vagy másolatot kapj róla
          (a többi szereplőt szükség esetén kitakarjuk), illetve hogy ne töröljük, mert a jogaid érvényesítéséhez
          szükséged van rá (GDPR 15. és 18. cikk). A kérésben add meg a felvétel napját, időpontját és helyét.
          Munkatársainkat a kamerás megfigyelésről külön, írásban tájékoztatjuk (a munka törvénykönyvéről szóló
          2012. évi I. törvény 11/A. § (1)).
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.9 A weboldal technikai naplói"
        adatok="IP-cím, a kérés időpontja, a megnyitott oldal, a böngésző típusa"
        cel="a weboldal és az adatbázis biztonságos működése, hibák és visszaélések felderítése"
        jogalap="jogos érdek a szolgáltatás biztonságos működtetésében (GDPR 6. cikk (1) f) pont)"
        megorzes="a tárhelyszolgáltatók által meghatározott rövid ideig; ezeket a naplókat a szolgáltatók rögzítik, mi csak hibakereséshez tekintünk beléjük"
      >
        <p>
          A nyilvános foglalási oldalon a visszaélések kiszűrésére egy telefonszámról 24 órán belül legfeljebb
          három, még vissza nem igazolt kérést fogadunk el, és óránként összesen is korlátozzuk a kérések számát. Ehhez nem
          gyűjtünk további adatot, csak a kérésben megadott telefonszámot használjuk.
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.10 Térkép (Google Térkép)"
        adatok="IP-cím, a böngésző adatai, a Google által elhelyezett sütik"
        cel="a telephely megjelenítése a térképen"
        jogalap="a hozzájárulásod (GDPR 6. cikk (1) a) pont; az elektronikus hírközlésről szóló 2003. évi C. törvény 155. § (4))"
        megorzes="a Google adatkezelési szabályai szerint"
      >
        <p>
          A térkép csak akkor töltődik be, ha a „Térkép betöltése” gombra kattintasz; addig a böngésződ nem
          kapcsolódik a Google-höz. A betöltött térképpel kapcsolatos adatkezelésért a Google Ireland Limited
          (Gordon House, Barrow Street, Dublin 4, Írország) önállóan felel, a részleteket a{' '}
          <a href="https://policies.google.com/privacy?hl=hu" target="_blank" rel="noreferrer">Google adatvédelmi irányelvei</a>{' '}
          tartalmazzák. A hozzájárulásodat úgy vonhatod vissza, hogy újratöltöd az oldalt (ekkor a térkép
          nem töltődik be újra magától), a Google sütijeit pedig a böngésződben törölheted.
        </p>
      </Adatkezeles>

      <h2>3. Sütik</h2>
      <p>
        A nyilvános weboldalon mi magunk nem helyezünk el sütit, és nem használunk látogatottságmérő vagy
        reklámcélú követőkódot. A betűtípusokat a saját tárhelyünkről töltjük be, nem külső szolgáltatótól.
        Sütit csak a Google Térkép helyezhet el, és csak akkor, ha a térképet betöltöd (lásd 2.10 pont).
        A munkatársaink által használt belső felület a bejelentkezés megőrzéséhez a böngésző helyi tárolóját
        használja; ez a látogatókat nem érinti.
      </p>

      <h2>4. Kik ismerhetik meg az adatokat</h2>
      <p>
        Az adatokhoz a munkatársaink férnek hozzá, mindenki csak a feladatához szükséges mértékben. A rendszer
        működtetéséhez az alábbi adatfeldolgozókat vesszük igénybe; ők az adatokat kizárólag a mi
        megbízásunkból és utasításaink szerint kezelhetik:
      </p>
      <div className="kv-jogi-tabla">
        <table>
          <thead>
            <tr><th>Adatfeldolgozó</th><th>Feladat</th><th>Cím</th></tr>
          </thead>
          <tbody>
            {jogi.adatfeldolgozok.map((a) => (
              <tr key={a.nev}><td>{a.nev}</td><td>{a.feladat}</td><td>{a.cim}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        A számlák adatai jogszabály alapján a NAV-hoz kerülnek (lásd 2.6 pont), kamerafelvételt pedig csak a
        2.8 pontban leírt esetekben adunk át. Ezen kívül személyes adatot csak akkor adunk át, ha jogszabály
        kötelez rá, például hatóság vagy bíróság megkeresésére.
      </p>

      <h2>5. Adattovábbítás az Európai Gazdasági Térségen kívülre</h2>
      <p>
        Az adatbázisunk és annak biztonsági mentései az Európai Unióban, a Supabase frankfurti (Németország)
        adatközpontjában vannak. A Supabase Pte. Ltd. ugyanakkor szingapúri cég, és az üzemeltetési és
        hibaelhárítási feladatokat részben az amerikai Supabase, Inc. látja el, így munkatársaik az adatokhoz
        az Európai Gazdasági Térségen kívülről is hozzáférhetnek. A Vercel Inc. és a Plus Five Five, Inc.
        (Resend) az Amerikai Egyesült Államokban működik.
      </p>
      <p>
        Az adattovábbítás megfelelő garanciák mellett történik: ahol a szolgáltató tanúsított az EU–USA
        adatvédelmi keret szerint, ott az Európai Bizottság erre vonatkozó megfelelőségi határozata alapján,
        minden más esetben (és tartalékként) az Európai Bizottság által elfogadott általános szerződési
        feltételek (GDPR 46. cikk) alapján, amelyeket a szolgáltatók adatfeldolgozási szerződése tartalmaz.
        Ezekről a fenti elérhetőségeken kérhetsz tájékoztatást.
      </p>

      <h2>6. Adatbiztonság</h2>
      <p>
        A weboldal és az adatbázis között minden kapcsolat titkosított (HTTPS). A belső felülethez csak
        bejelentkezett munkatársaink férnek hozzá, szerepkörük szerinti jogosultsággal, amit az adatbázis is
        ellenőriz. A nyilvános foglalási oldal a szabad időpontokat úgy mutatja, hogy más ügyfelek adatai
        (név, telefonszám, rendszám) nem jutnak ki rajta.
      </p>

      <h2>7. Automatizált döntéshozatal</h2>
      <p>
        Nem hozunk rólad kizárólag automatizált döntést, és nem végzünk profilalkotást. A foglalási kéréseket
        munkatársaink nézik át és igazolják vissza.
      </p>

      <h2>8. A jogaid</h2>
      <ul>
        <li><strong>Hozzáférés</strong> (GDPR 15. cikk): tájékoztatást és másolatot kérhetsz a rólad kezelt adatokról.</li>
        <li><strong>Helyesbítés</strong> (16. cikk): kérheted a pontatlan adatok javítását.</li>
        <li><strong>Törlés</strong> (17. cikk): kérheted az adataid törlését, ha nincs szükség rájuk, vagy jogszabály nem kötelez a megőrzésükre.</li>
        <li><strong>Korlátozás</strong> (18. cikk): kérheted, hogy az adataidat átmenetileg csak tároljuk, de ne használjuk.</li>
        <li><strong>Adathordozhatóság</strong> (20. cikk): a szerződés alapján kezelt adataidat géppel olvasható formában is kikérheted.</li>
        <li><strong>Tiltakozás</strong> (21. cikk): a jogos érdeken alapuló adatkezelés ellen tiltakozhatsz.</li>
        <li><strong>Hozzájárulás visszavonása</strong> (7. cikk (3)): a térkép betöltéséhez adott hozzájárulást bármikor visszavonhatod; ez a visszavonás előtti adatkezelést nem érinti.</li>
      </ul>
      <p>
        Kérésedet e-mailben (<Level cim={ceg.email} />) vagy postán ({ceg.szekhely}) küldheted el. Indokolatlan
        késedelem nélkül, legkésőbb egy hónapon belül válaszolunk; ezt a határidőt indokolt esetben két
        hónappal meghosszabbíthatjuk, erről az első hónapon belül tájékoztatunk. A válasz ingyenes.
        Ha kétségünk van a kérelmező személyazonosságát illetően, további adatot kérhetünk a
        személyazonosság megerősítéséhez.
      </p>

      <h2>9. Jogorvoslat</h2>
      <p>
        Ha úgy gondolod, hogy megsértettük az adatvédelmi jogaidat, kérjük, először keress minket, hogy
        rendezhessük a problémát. Panaszt tehetsz a felügyeleti hatóságnál is:
      </p>
      <dl className="kv-jogi-adatok">
        <Sor cimke="Név">{NAIH.nev}</Sor>
        <Sor cimke="Cím">{NAIH.cim}</Sor>
        <Sor cimke="Levelezési cím">{NAIH.levelcim}</Sor>
        <Sor cimke="Telefon">{NAIH.telefon}</Sor>
        <Sor cimke="E-mail"><Level cim={NAIH.email} /></Sor>
        <Sor cimke="Honlap"><a href={NAIH.honlap} target="_blank" rel="noreferrer">naih.hu</a></Sor>
      </dl>
      <p>
        Bírósághoz is fordulhatsz (az információs önrendelkezési jogról szóló 2011. évi CXII. törvény
        23. §); a pert választásod szerint a lakóhelyed vagy tartózkodási helyed szerint illetékes
        törvényszék előtt is megindíthatod.
      </p>

      <h2>10. A tájékoztató módosítása</h2>
      <p>
        Ha az adatkezelésünk változik, ezt a tájékoztatót frissítjük. A mindenkor hatályos változat ezen az
        oldalon érhető el; a hatályba lépés dátumát az oldal tetején tüntetjük fel.
      </p>

      <p className="kv-jogi-halk">
        A szolgáltató adatai az <a href="/impresszum">Impresszumban</a> is megtalálhatók.
      </p>
    </Keret>
  )
}

export function BeepitettJogi({ lap }: { lap: JogiLap }) {
  const en = useNyelv() === 'en'
  if (lap === 'impresszum') return en ? <ImpresszumEn /> : <Impresszum />
  return en ? <AdatvedelemEn /> : <Adatvedelem />
}

export default function JogiOldal({ lap, feltoltott }: { lap: JogiLap; feltoltott?: JogiBlokk[] | null }) {
  const nyelv = useNyelv()
  if (feltoltott?.length) return <JogiDokumentum blokkok={feltoltott} cim={(nyelv === 'en' ? JOGI_CIM_EN : JOGI_CIM)[lap]} />
  return <BeepitettJogi lap={lap} />
}
