import CsomagSzerkeszto from '../services/CsomagSzerkeszto'
import { PubFej } from './kozos'

export default function CsomagokOldal() {
  return (
    <div className="oldal pub-oldal">
      <PubFej
        cim="Csomagok tartalma"
        alcim="A publikus oldal csomagtáblázata: oszlopok, sorok, cellák, a csomagok neve és leírása. Az árakat és az egyéb szolgáltatásokat a Szolgáltatások menüben kezeled."
        linkek={[['Publikus oldal megnyitása', '/publikus']]}
      />
      <CsomagSzerkeszto />
    </div>
  )
}
