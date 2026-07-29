import { useEffect, useState } from 'react'
import { FileText, X } from 'lucide-react'
import { inspectPdf, type PdfImportOptions, type PdfLayout } from './clientPdf'

const DEFAULT_OPTIONS: PdfImportOptions = {
  dpi: 144,
  maxPages: 30,
  layout: 'vertical',
  quality: 0.88,
  maxRenderPixels: 20_000_000,
}

export function PdfImportDialog({ file, onConfirm, onCancel }: {
  file: File
  onConfirm: (options: PdfImportOptions) => void
  onCancel: () => void
}) {
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void inspectPdf(file, controller.signal)
      .then(result => {
        setPageCount(result.pageCount)
        setOptions(current => ({ ...current, maxPages: Math.min(current.maxPages, result.pageCount) }))
      })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Lecture du PDF impossible.')
      })
    return () => controller.abort()
  }, [file])

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
    <section className="modal pdf-import-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-import-title">
      <header>
        <div>
          <span className="panel-kicker">Conversion locale</span>
          <h2 id="pdf-import-title"><FileText size={22} /> Importer un PDF</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Fermer" onClick={onCancel}><X /></button>
      </header>
      <p className="pdf-privacy-note">Le PDF reste sur cet appareil. Seules les pages converties en images sont envoyées au serveur.</p>
      <dl className="pdf-file-summary">
        <div><dt>Fichier</dt><dd>{file.name}</dd></div>
        <div><dt>Taille</dt><dd>{(file.size / 1024 / 1024).toFixed(1)} Mo</dd></div>
        <div><dt>Pages</dt><dd>{pageCount ?? 'Analyse…'}</dd></div>
      </dl>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="pdf-options-grid">
        <label>Résolution
          <select value={options.dpi} onChange={event => setOptions(current => ({ ...current, dpi: Number(event.target.value) }))}>
            <option value={96}>96 ppp — léger</option>
            <option value={144}>144 ppp — recommandé</option>
            <option value={192}>192 ppp — détaillé</option>
            <option value={300}>300 ppp — très détaillé</option>
          </select>
        </label>
        <label>Disposition
          <select value={options.layout} onChange={event => setOptions(current => ({ ...current, layout: event.target.value as PdfLayout }))}>
            <option value="vertical">Verticale</option>
            <option value="horizontal">Horizontale</option>
            <option value="grid">Grille</option>
          </select>
        </label>
        <label>Nombre de pages
          <input type="number" min="1" max={Math.min(30, pageCount ?? 30)} value={options.maxPages} onChange={event => setOptions(current => ({ ...current, maxPages: Math.max(1, Math.min(30, Number(event.target.value) || 1)) }))} />
        </label>
        <label>Qualité WebP
          <select value={options.quality} onChange={event => setOptions(current => ({ ...current, quality: Number(event.target.value) }))}>
            <option value={0.78}>Économique</option>
            <option value={0.88}>Équilibrée</option>
            <option value={0.94}>Élevée</option>
          </select>
        </label>
      </div>
      <p className="helper-text">Les pages sont traitées une par une. Si une page dépasse 20 millions de pixels, sa résolution est automatiquement réduite pour protéger la mémoire du navigateur.</p>
      <footer className="modal-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>Annuler</button>
        <button type="button" className="primary-button" disabled={Boolean(error) || pageCount === null} onClick={() => onConfirm(options)}>Convertir {Math.min(options.maxPages, pageCount ?? options.maxPages)} page(s)</button>
      </footer>
    </section>
  </div>
}
