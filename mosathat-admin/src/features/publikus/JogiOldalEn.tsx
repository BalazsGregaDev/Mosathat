import { BEKELTETO, JOGI_CIM_EN, NAIH, TARHELY } from '../../lib/ceg'
import { Adatkezeles, Keret, Level, Sor } from './jogiKozos'
import { useCeg, useJogi } from './tartalom'

export function ImpresszumEn() {
  const ceg = useCeg()
  return (
    <Keret cim={JOGI_CIM_EN.impresszum}>
      <h2>Service provider</h2>
      <dl className="kv-jogi-adatok">
        <Sor cimke="Company name">{ceg.nev}</Sor>
        <Sor cimke="Short company name">{ceg.rovidNev}</Sor>
        <Sor cimke="Registered office">{ceg.szekhely}</Sor>
        <Sor cimke="Company registration number">{ceg.cegjegyzekszam}</Sor>
        <Sor cimke="Registry court">{ceg.cegbirosag}</Sor>
        <Sor cimke="Tax number">{ceg.adoszam}</Sor>
        <Sor cimke="Phone">{ceg.telefon}</Sor>
        <Sor cimke="E-mail"><Level cim={ceg.email} /></Sor>
      </dl>

      <h2>Hosting providers</h2>
      <dl className="kv-jogi-adatok">
        {TARHELY.map((t) => (
          <Sor key={t.nev} cimke={t.nev}>
            {t.cimEn}<br />
            E-mail: <Level cim={t.email} /><br />
            <span className="kv-jogi-halk">Role: {t.szerepEn}.</span>
          </Sor>
        ))}
      </dl>

      <h2>Complaints</h2>
      <p>
        If you are not satisfied with something, you can make a complaint in person on site, by phone
        ({ceg.telefon}), by e-mail (<Level cim={ceg.email} />) or by post to our registered office
        ({ceg.szekhely}). We look into verbal complaints immediately and, where possible, put things right
        straight away; if that is not possible, or you do not agree with the solution, we record the complaint
        in writing. We reply to written complaints in writing, on the merits, within 30 days of receipt. We keep
        the record of the complaint and our reply for three years.
      </p>

      <h2>Conciliation board</h2>
      <p>
        If we cannot settle your complaint, as a consumer you can turn to the conciliation board competent for
        our registered office:
      </p>
      <dl className="kv-jogi-adatok">
        <Sor cimke="Name">{BEKELTETO.nevEn}</Sor>
        <Sor cimke="Address">{BEKELTETO.cimEn}</Sor>
        <Sor cimke="Postal address">{BEKELTETO.levelcim}</Sor>
        <Sor cimke="Phone">{BEKELTETO.telefon}</Sor>
        <Sor cimke="E-mail"><Level cim={BEKELTETO.email} /></Sor>
        <Sor cimke="Website"><a href={BEKELTETO.honlap} target="_blank" rel="noreferrer">{BEKELTETO.honlap.replace('https://', '')}</a></Sor>
      </dl>

      <p className="kv-jogi-halk">
        You can read about how we handle personal data in our <a href="/adatvedelem?lang=en">Privacy policy</a>.
      </p>
    </Keret>
  )
}

const SZERZODES = 'steps taken before entering into a contract and the performance of the contract (GDPR Article 6(1)(b))'
const ELEVULES = 'for 5 years from the provision of the service, until civil law claims become time-barred (Section 6:22 of the Hungarian Civil Code)'

export function AdatvedelemEn() {
  const ceg = useCeg()
  const jogi = useJogi()
  const kamera = jogi.kamera
  return (
    <Keret cim={JOGI_CIM_EN.adatvedelem}>
      <p>
        This policy explains what personal data we process, what we use it for, how long we keep it, who we
        share it with, and what rights you have. It has been prepared on the basis of Article 13 of the General
        Data Protection Regulation of the European Union (GDPR, Regulation (EU) 2016/679).
      </p>

      <h2>1. The controller</h2>
      <dl className="kv-jogi-adatok">
        <Sor cimke="Name">{ceg.nev} ({ceg.rovidNev})</Sor>
        <Sor cimke="Registered office">{ceg.szekhely}</Sor>
        <Sor cimke="Company registration number">{ceg.cegjegyzekszam}</Sor>
        <Sor cimke="Tax number">{ceg.adoszam}</Sor>
        <Sor cimke="E-mail"><Level cim={ceg.email} /></Sor>
        <Sor cimke="Phone">{ceg.telefon}</Sor>
      </dl>
      <p>
        We have not appointed a data protection officer, because our activities do not fall under the cases where
        this is mandatory under Article 37 of the GDPR. You can contact us about data protection using the details
        above.
      </p>

      <h2>2. What data we process, and why</h2>

      <Adatkezeles
        cim="2.1 Online booking"
        adatok="name, phone number, e-mail address (optional), licence plate, make and model of the car (optional), notes (optional), the chosen service, the requested time"
        cel="receiving the booking request, agreeing and confirming the appointment, and providing the service"
        jogalap={SZERZODES}
        megorzes={<>for completed bookings {ELEVULES}; if the request did not become a booking (we declined it, you cancelled it, or it expired), for 1 year from closing the request</>}
      >
        <p>
          We cannot accept a request without a name, phone number and licence plate, because we need these to
          arrange the appointment and to identify the car. Giving your e-mail address is voluntary: if you give
          it, we send the confirmation and the link to your booking page there; if not, we contact you by phone.
        </p>
        <p>
          If the phone number you give is already in our records, we link the request to the existing customer
          details, but we do not overwrite the recorded details based on the request: our team will check any
          differences with you.
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.2 Confirmation e-mail and your booking page"
        adatok="e-mail address, booking details (time, service, price, the reason for any surcharge), the secret link of the booking page, the text of change requests sent on the page"
        cel="confirming the booking and showing its status, enabling you to ask for changes or cancel the appointment online, and letting you know when your car is ready"
        jogalap={SZERZODES}
        megorzes={ELEVULES}
      >
        <p>
          Your booking page is available at a secret, unguessable link that you receive by e-mail or directly from
          us. The page stays available for 10 days after you collect the car, or for 10 days after the original
          appointment if the booking was cancelled or missed; after that the link no longer shows any data. The page
          only shows the booking details, not your phone number or e-mail address. We do not send newsletters or
          marketing e-mails.
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.3 Bookings by phone and in person, customer and vehicle records"
        adatok="name, phone number, e-mail address, licence plate, car details (make, model, category), details of bookings and work carried out, job sheet status, internal notes by our team"
        cel="providing the service, identifying the customer and the car, keeping track of the work carried out"
        jogalap={SZERZODES}
        megorzes={ELEVULES}
      />

      <Adatkezeles
        cim="2.4 Communication by e-mail and phone"
        adatok="name, e-mail address, phone number, the content of the message, and whatever we note down for the booking from a phone conversation"
        cel="answering your questions, arranging appointments, handling matters related to the booking and the work carried out"
        jogalap={<>if the enquiry relates to a booking or a service: {SZERZODES}; for other enquiries, our legitimate interest in being able to reply to those who contact us (GDPR Article 6(1)(f))</>}
        megorzes="correspondence related to a booking together with the booking details (see point 2.3); other enquiries for 1 year from closing the matter"
      >
        <p>
          We communicate by e-mail from our official address (<Level cim={ceg.email} />). We do not record phone
          calls.
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.5 Contact persons of business customers"
        adatok="the contact person’s name, phone number and e-mail address"
        cel="keeping in contact with the company that has a contract with us (fleet, prepaid pass, contract prices)"
        jogalap="the legitimate interest of the controller and the contracting company in the communication needed to perform the contract (GDPR Article 6(1)(f))"
        megorzes="for 5 years from the end of the contract with the company, or until the company appoints another contact person"
      />

      <Adatkezeles
        cim="2.6 Invoicing"
        adatok="the details on the invoice: name or company name, address, tax number (for companies), the service and the price"
        cel="issuing invoices, reporting invoice data to the tax authority, and meeting accounting obligations"
        jogalap="compliance with a legal obligation (GDPR Article 6(1)(c); Section 169 of Act C of 2000 on Accounting; Annex 10 to Act CXXVII of 2007 on Value Added Tax)"
        megorzes="for 8 years (Section 169 of the Accounting Act)"
      >
        <p>
          We issue invoices with the Billingo invoicing software, which automatically forwards the invoice data to
          the online invoice system of the Hungarian Tax and Customs Administration (NAV), as required by law. If
          you receive the invoice as a private individual, your name and address are not included in the data sent
          to NAV. NAV processes the data it receives as an independent controller, for its own purposes.
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.7 Complaints"
        adatok="name, contact details, description of the complaint, the record of the complaint and our reply"
        cel="investigating and answering the complaint"
        jogalap="compliance with a legal obligation (GDPR Article 6(1)(c); Section 17/A of Act CLV of 1997 on Consumer Protection)"
        megorzes="for 3 years (Section 17/A(7) of the Consumer Protection Act)"
      />

      <Adatkezeles
        cim="2.8 Camera surveillance on the premises"
        adatok="the image and movement of people in the monitored area, images of vehicles including the licence plate; we do not record sound"
        cel="protecting the premises, the customer cars entrusted to us, and the equipment and materials of the business; clarifying the circumstances if damage is found on a car, or if an accident, theft or vandalism occurs on the premises"
        jogalap="the legitimate interest of the business and our customers in protecting the vehicles entrusted to us and our property (GDPR Article 6(1)(f)); you can ask to see the result of the balancing test"
        megorzes={kamera.megorzes
          ? `for ${kamera.megorzes} from the time of recording, after which the system automatically overwrites the recordings; if a recording is used in official or court proceedings, or to settle a damage claim, we keep it until the proceedings or the matter are closed`
          : 'the retention period will be specified on finalisation; if a recording is used in official or court proceedings, or to settle a damage claim, we keep it until the proceedings or the matter are closed'}
      >
        {kamera.kamerak.length > 0 ? (
          <>
            <p>Where the cameras are and the areas they cover:</p>
            <ul>
              {kamera.kamerak.map((k) => <li key={k.hely}><strong>{k.hely}:</strong> {k.terulet}</li>)}
            </ul>
          </>
        ) : (
          <p>The exact location of the cameras and the areas they cover will be specified on finalisation.</p>
        )}
        <p>
          The cameras only monitor the area we use. There are no cameras in the toilets, changing rooms or the staff
          rest area. A warning sign at the entrance draws attention to the monitored area. Recordings may only be
          viewed by an authorised member of our team, and only when there is a specific reason, such as a damage
          report or vandalism. We only hand over recordings at the request of an authority or a court, or, in the
          event of a crime or damage, for a criminal complaint or to settle a damage claim.
        </p>
        <p>
          If you appear in a recording, within the retention period you can ask to view it or to receive a copy
          (other people will be masked if necessary), or ask us not to delete it because you need it to enforce
          your rights (GDPR Articles 15 and 18). In your request, please give the date, time and place of the
          recording. Our employees are informed about the camera surveillance separately, in writing (Section
          11/A(1) of Act I of 2012 on the Labour Code).
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.9 Technical logs of the website"
        adatok="IP address, time of the request, the page opened, the type of browser"
        cel="secure operation of the website and the database, detecting errors and abuse"
        jogalap="legitimate interest in operating the service securely (GDPR Article 6(1)(f))"
        megorzes="for the short period set by the hosting providers; these logs are recorded by the providers, and we only look at them for troubleshooting"
      >
        <p>
          To prevent abuse, the public booking page accepts at most three unconfirmed requests from one phone
          number within 24 hours, and also limits the total number of requests per hour. We do not collect any
          additional data for this; we only use the phone number given in the request.
        </p>
      </Adatkezeles>

      <Adatkezeles
        cim="2.10 Map (Google Maps)"
        adatok="IP address, browser data, cookies placed by Google"
        cel="showing the premises on a map"
        jogalap="your consent (GDPR Article 6(1)(a); Section 155(4) of Act C of 2003 on Electronic Communications)"
        megorzes="according to Google’s privacy rules"
      >
        <p>
          The map only loads if you click the “Load map” button; until then your browser does not connect to Google.
          Google Ireland Limited (Gordon House, Barrow Street, Dublin 4, Ireland) is independently responsible for the
          processing related to the loaded map; the details are set out in{' '}
          <a href="https://policies.google.com/privacy?hl=en" target="_blank" rel="noreferrer">Google’s Privacy Policy</a>.
          You can withdraw your consent by reloading the page (the map will then not load again by itself), and you
          can delete Google’s cookies in your browser.
        </p>
      </Adatkezeles>

      <h2>3. Cookies</h2>
      <p>
        We do not place any cookies ourselves on the public website, and we do not use analytics or advertising
        tracking code. Fonts are loaded from our own hosting, not from an external provider. Cookies may only be placed
        by Google Maps, and only if you load the map (see point 2.10). The internal interface used by our team uses the
        browser’s local storage to keep users signed in; this does not affect visitors.
      </p>

      <h2>4. Who can access the data</h2>
      <p>
        Our team members have access to the data, each only to the extent needed for their tasks. To run the system we
        use the following processors, who may only process the data on our behalf and according to our instructions:
      </p>
      <div className="kv-jogi-tabla">
        <table>
          <thead>
            <tr><th>Processor</th><th>Task</th><th>Address</th></tr>
          </thead>
          <tbody>
            {jogi.adatfeldolgozok.map((a) => (
              <tr key={a.nev}><td>{a.nev}</td><td>{a.feladat}</td><td>{a.cim}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Invoice data is sent to NAV as required by law (see point 2.6), and we only hand over camera recordings in the
        cases described in point 2.8. Apart from this, we only share personal data if required by law, for example at
        the request of an authority or a court.
      </p>

      <h2>5. Transfers outside the European Economic Area</h2>
      <p>
        Our database and its backups are located in the European Union, in Supabase’s data centre in Frankfurt
        (Germany). However, Supabase Pte. Ltd. is a Singapore company, and some operational and troubleshooting tasks
        are carried out by the US company Supabase, Inc., so their staff may access the data from outside the European
        Economic Area. Vercel Inc. and Plus Five Five, Inc. (Resend) operate in the United States.
      </p>
      <p>
        Data is transferred with appropriate safeguards: where the provider is certified under the EU–US Data Privacy
        Framework, on the basis of the European Commission’s adequacy decision; in all other cases (and as a fallback),
        on the basis of the standard contractual clauses adopted by the European Commission (GDPR Article 46), which are
        included in the providers’ data processing agreements. You can ask us about these using the contact details above.
      </p>

      <h2>6. Data security</h2>
      <p>
        All connections between the website and the database are encrypted (HTTPS). Only signed-in members of our team
        can access the internal interface, with permissions according to their role, which the database also checks. The
        public booking page shows the available times without revealing other customers’ details (name, phone number,
        licence plate).
      </p>

      <h2>7. Automated decision-making</h2>
      <p>
        We do not make decisions about you based solely on automated processing, and we do not carry out profiling.
        Booking requests are reviewed and confirmed by our team.
      </p>

      <h2>8. Your rights</h2>
      <ul>
        <li><strong>Access</strong> (GDPR Article 15): you can ask for information about, and a copy of, the data we hold about you.</li>
        <li><strong>Rectification</strong> (Article 16): you can ask us to correct inaccurate data.</li>
        <li><strong>Erasure</strong> (Article 17): you can ask us to delete your data if it is no longer needed and the law does not require us to keep it.</li>
        <li><strong>Restriction</strong> (Article 18): you can ask us to temporarily only store your data but not use it.</li>
        <li><strong>Data portability</strong> (Article 20): you can request the data we process on the basis of a contract in a machine-readable format.</li>
        <li><strong>Objection</strong> (Article 21): you can object to processing based on legitimate interest.</li>
        <li><strong>Withdrawal of consent</strong> (Article 7(3)): you can withdraw your consent to loading the map at any time; this does not affect processing before the withdrawal.</li>
      </ul>
      <p>
        You can send your request by e-mail (<Level cim={ceg.email} />) or by post ({ceg.szekhely}). We will reply
        without undue delay, and within one month at the latest; in justified cases we may extend this deadline by two
        months, in which case we will let you know within the first month. The reply is free of charge. If we have doubts
        about the identity of the person making the request, we may ask for additional information to confirm it.
      </p>

      <h2>9. Remedies</h2>
      <p>
        If you think we have infringed your data protection rights, please contact us first so that we can resolve the
        problem. You can also lodge a complaint with the supervisory authority:
      </p>
      <dl className="kv-jogi-adatok">
        <Sor cimke="Name">{NAIH.nevEn}</Sor>
        <Sor cimke="Address">{NAIH.cim}</Sor>
        <Sor cimke="Postal address">{NAIH.levelcim}</Sor>
        <Sor cimke="Phone">{NAIH.telefon}</Sor>
        <Sor cimke="E-mail"><Level cim={NAIH.email} /></Sor>
        <Sor cimke="Website"><a href={NAIH.honlap} target="_blank" rel="noreferrer">naih.hu</a></Sor>
      </dl>
      <p>
        You can also go to court (Section 23 of Act CXII of 2011 on the Right of Informational Self-Determination and on
        Freedom of Information); at your choice, you can also bring the case before the regional court competent for your
        place of residence or stay.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        If our data processing changes, we will update this policy. The current version is always available on this
        page; the date it takes effect is shown at the top of the page.
      </p>

      <p className="kv-jogi-halk">
        Our company details can also be found in the <a href="/impresszum?lang=en">Legal notice</a>.
      </p>
    </Keret>
  )
}
