import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'

import './szerkeszto.css'
import { hibaSzoveg } from '../../lib/format'
import { KEP_MAX_MERET, KEP_TIPUSOK } from '../../lib/kep'

function kepFajlok(l: FileList | null | undefined): File[] {
  return Array.from(l ?? []).filter((f) => f.type.startsWith('image/'))
}

function Gomb({ cimke, aktiv, tiltva, onClick, children }: {
  cimke: string
  aktiv?: boolean
  tiltva?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="szk-gomb" title={cimke} aria-label={cimke} aria-pressed={aktiv ?? undefined}
            disabled={tiltva} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  )
}

function Ikon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const IKON = {
  felsorolas: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  szamozott: 'M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M4 9h3M4 14.5c.5-.7 2.8-.9 2.8.6 0 1.2-2.8 2.2-2.8 3.4h3',
  idezet: 'M7 7h4v5c0 2.5-1.5 4-4 5M15 7h4v5c0 2.5-1.5 4-4 5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  kep: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01',
  vissza: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  elore: 'm15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
}

function LinkSor({ editor, onBezar }: { editor: Editor; onBezar: () => void }) {
  const [url, setUrl] = useState<string>(() => (editor.getAttributes('link').href as string | undefined) ?? 'https://')
  const mezo = useRef<HTMLInputElement>(null)
  useEffect(() => { mezo.current?.focus(); mezo.current?.select() }, [])
  const vanLink = editor.isActive('link')
  const alkalmaz = () => {
    const cel = url.trim()
    if (!cel || cel === 'https://') return
    const href = /^(https?:|mailto:|tel:|\/|#)/i.test(cel) ? cel : `https://${cel}`
    const lanc = editor.chain().focus()
    if (editor.state.selection.empty && !vanLink) {
      lanc.insertContent({ type: 'text', text: cel, marks: [{ type: 'link', attrs: { href } }] }).run()
    } else {
      lanc.extendMarkRange('link').setLink({ href }).run()
    }
    onBezar()
  }
  return (
    <div className="szk-sor">
      <label className="szk-sor-mezo">
        <span>Link címe</span>
        <input ref={mezo} className="beviteli" type="url" value={url} data-mezo="link"
               onChange={(e) => setUrl(e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === 'Enter') { e.preventDefault(); alkalmaz() }
                 if (e.key === 'Escape') { e.preventDefault(); onBezar() }
               }} />
      </label>
      <button type="button" className="btn btn-kicsi btn-fo" onClick={alkalmaz}>Alkalmaz</button>
      {vanLink && (
        <button type="button" className="btn btn-kicsi" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onBezar() }}>
          Link törlése
        </button>
      )}
      <button type="button" className="btn btn-kicsi btn-csendes" onClick={onBezar}>Mégse</button>
    </div>
  )
}

function KepLeiras({ editor, alt }: { editor: Editor; alt: string }) {
  return (
    <div className="szk-sor">
      <label className="szk-sor-mezo">
        <span>A kiválasztott kép leírása (képernyőolvasónak és a keresőknek)</span>
        <input className="beviteli" value={alt} placeholder="pl. Felni tisztítás előtt és után" data-mezo="kep-alt"
               onChange={(e) => editor.chain().updateAttributes('image', { alt: e.target.value }).run()} />
      </label>
    </div>
  )
}

export default function SzovegSzerkeszto({ ertek, onValtozik, onKep, helykitolto, cimke, lang }: {
  ertek: string
  onValtozik: (html: string) => void
  onKep: (f: File) => Promise<string>
  helykitolto?: string
  cimke: string
  lang?: string
}) {
  const fajl = useRef<HTMLInputElement>(null)
  const [linkNyitva, setLinkNyitva] = useState(false)
  const [tolt, setTolt] = useState(0)
  const [hiba, setHiba] = useState('')
  const feltoltRef = useRef<(f: File[], e: Editor, hol?: number) => void>(() => {})

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener', target: null } },
      }),
      Image.configure({ allowBase64: true, HTMLAttributes: { loading: 'lazy' } }),
      Placeholder.configure({ placeholder: helykitolto ?? '' }),
    ],
    content: ertek,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'szk-tartalom', 'aria-label': cimke, 'aria-multiline': 'true', role: 'textbox', ...(lang ? { lang } : {}) },
      handlePaste: (_v, e) => {
        const f = kepFajlok(e.clipboardData?.files)
        if (!f.length || !editor) return false
        feltoltRef.current(f, editor)
        return true
      },
      handleDrop: (v, e) => {
        const f = kepFajlok((e as DragEvent).dataTransfer?.files)
        if (!f.length || !editor) return false
        const hol = v.posAtCoords({ left: (e as DragEvent).clientX, top: (e as DragEvent).clientY })?.pos
        feltoltRef.current(f, editor, hol)
        return true
      },
    },
    onUpdate: ({ editor: e }) => onValtozik(e.isEmpty ? '' : e.getHTML()),
  })

  const feltolt = (fajlok: File[], e: Editor, hol?: number) => {
    setHiba('')
    for (const f of fajlok) {
      if (!KEP_TIPUSOK.includes(f.type)) { setHiba('Csak JPG, PNG, WebP, GIF vagy HEIC kép tölthető fel.'); continue }
      if (f.size > KEP_MAX_MERET) { setHiba('A kép legfeljebb 15 MB lehet.'); continue }
      setTolt((n) => n + 1)
      onKep(f)
        .then((src) => {
          const alt = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim()
          const lanc = e.chain().focus()
          if (hol != null) lanc.insertContentAt(hol, { type: 'image', attrs: { src, alt } }).run()
          else lanc.setImage({ src, alt }).run()
        })
        .catch((x: unknown) => setHiba(hibaSzoveg(x)))
        .finally(() => setTolt((n) => n - 1))
    }
  }

  useLayoutEffect(() => {
    feltoltRef.current = (fajlok, e, hol) => feltolt(fajlok, e, hol)
  })

  const all = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      felkover: e?.isActive('bold') ?? false,
      dolt: e?.isActive('italic') ?? false,
      alahuzott: e?.isActive('underline') ?? false,
      alcim: e?.isActive('heading', { level: 3 }) ?? false,
      felsorolas: e?.isActive('bulletList') ?? false,
      szamozott: e?.isActive('orderedList') ?? false,
      idezet: e?.isActive('blockquote') ?? false,
      link: e?.isActive('link') ?? false,
      kep: e?.isActive('image') ?? false,
      kepAlt: e?.isActive('image') ? String(e.getAttributes('image').alt ?? '') : '',
      vissza: e?.can().undo() ?? false,
      elore: e?.can().redo() ?? false,
    }),
  })

  if (!editor || !all) return null
  const c = () => editor.chain().focus()

  return (
    <div className="szk" data-tolt={tolt > 0 || undefined}>
      <div className="szk-eszkozok" role="toolbar" aria-label={`${cimke}: formázás`}>
        <Gomb cimke="Félkövér" aktiv={all.felkover} onClick={() => c().toggleBold().run()}><b>B</b></Gomb>
        <Gomb cimke="Dőlt" aktiv={all.dolt} onClick={() => c().toggleItalic().run()}><i>I</i></Gomb>
        <Gomb cimke="Aláhúzott" aktiv={all.alahuzott} onClick={() => c().toggleUnderline().run()}><u>U</u></Gomb>
        <span className="szk-valaszto" />
        <Gomb cimke="Alcím" aktiv={all.alcim} onClick={() => c().toggleHeading({ level: 3 }).run()}><span className="szk-szoveg">Alcím</span></Gomb>
        <Gomb cimke="Felsorolás" aktiv={all.felsorolas} onClick={() => c().toggleBulletList().run()}><Ikon d={IKON.felsorolas} /></Gomb>
        <Gomb cimke="Számozott lista" aktiv={all.szamozott} onClick={() => c().toggleOrderedList().run()}><Ikon d={IKON.szamozott} /></Gomb>
        <Gomb cimke="Kiemelt idézet" aktiv={all.idezet} onClick={() => c().toggleBlockquote().run()}><Ikon d={IKON.idezet} /></Gomb>
        <span className="szk-valaszto" />
        <Gomb cimke="Link" aktiv={all.link || linkNyitva} onClick={() => setLinkNyitva((x) => !x)}><Ikon d={IKON.link} /></Gomb>
        <Gomb cimke="Kép feltöltése" onClick={() => fajl.current?.click()}><Ikon d={IKON.kep} /></Gomb>
        <span className="szk-valaszto" />
        <Gomb cimke="Visszavonás" tiltva={!all.vissza} onClick={() => c().undo().run()}><Ikon d={IKON.vissza} /></Gomb>
        <Gomb cimke="Újra" tiltva={!all.elore} onClick={() => c().redo().run()}><Ikon d={IKON.elore} /></Gomb>
        {tolt > 0 && <span className="szk-tolt" role="status">Kép feltöltése…</span>}
        <input ref={fajl} type="file" accept={KEP_TIPUSOK.join(',')} hidden multiple data-mezo="kep-fajl"
               onChange={(e) => { feltolt(kepFajlok(e.target.files), editor); e.target.value = '' }} />
      </div>
      {linkNyitva && <LinkSor editor={editor} onBezar={() => setLinkNyitva(false)} />}
      {all.kep && <KepLeiras editor={editor} alt={all.kepAlt} />}
      {hiba && <p className="szk-hiba" role="alert">{hiba}</p>}
      <EditorContent editor={editor} />
    </div>
  )
}
