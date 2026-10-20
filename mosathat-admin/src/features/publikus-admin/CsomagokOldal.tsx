import CsomagSzerkeszto from '../services/CsomagSzerkeszto'
import { PubFej } from './kozos'

export default function CsomagokOldal() {
  return (
    <div className="oldal pub-oldal">
      <PubFej
        cim="Csomagok"
        alcim="A publikus oldal csomagtáblázata: oszlopok, sorok, cellák, a csomagok neve és leírása. Az árak a Szolgáltatások menüben módosíthatók."
        linkek={[['Publikus oldal megnyitása', '/publikus']]}
      />
      <CsomagSzerkeszto />
    </div>
  )
}
