import { useEffect, useState } from 'react'
import { Scale as ScaleIcon, Pencil, History, Trash2, Copy, Check, RefreshCw, ExternalLink } from 'lucide-react'
import { api, type Scale, type TareEvent } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Modal } from '../components/Modal'
import { fmtDate } from '../lib/format'

interface Props {
  scale: Scale
  tareEvents: TareEvent[]
  latestRaw: number | null
  onChange: () => void
  onDelete: () => void
  notify: (m: string) => void
}

export function SettingsPage({ scale, tareEvents, latestRaw, onChange, onDelete, notify }: Props) {
  const { user, refresh } = useAuth()

  // Scale edit modal
  const [scaleOpen, setScaleOpen] = useState(false)
  const [scaleName, setScaleName] = useState(scale.name)
  const [scaleUrl, setScaleUrl] = useState(scale.source_url ?? '')
  const [scalePhone, setScalePhone] = useState(scale.phone_number ?? '')
  const [scaleSmsTemplate, setScaleSmsTemplate] = useState(scale.sms_template ?? '')
  const [scaleCallTrigger, setScaleCallTrigger] = useState(!!scale.call_trigger)
  const [scaleBatteryUnit, setScaleBatteryUnit] = useState(scale.battery_unit ?? 'V')

  function openScaleEdit() {
    setScaleName(scale.name)
    setScaleUrl(scale.source_url ?? '')
    setScalePhone(scale.phone_number ?? '')
    setScaleSmsTemplate(scale.sms_template ?? '')
    setScaleCallTrigger(!!scale.call_trigger)
    setScaleBatteryUnit(scale.battery_unit ?? 'V')
    setScaleOpen(true)
  }

  // Tare modal
  const [tareOpen, setTareOpen] = useState(false)
  const [tarePre, setTarePre] = useState('')
  const [tarePost, setTarePost] = useState('')
  const [tareTarget, setTareTarget] = useState('')
  const [tareAdvanced, setTareAdvanced] = useState(false)
  const [tareNote, setTareNote] = useState('')

  function openTare() {
    setTarePre(latestRaw !== null ? latestRaw.toFixed(2) : '')
    setTarePost('')
    setTareTarget('')
    setTareAdvanced(false)
    setTareNote('')
    setTareOpen(true)
  }

  // SMS copy state
  const [tokenCopied, setTokenCopied] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const [rotatingToken, setRotatingToken] = useState(false)

  return (
    <div className="space-y-6">

      {/* ── Mérleg ── */}
      <section className="card p-5">
        <div className="flex items-start justify-between mb-3 gap-3">
          <h2 className="text-lg font-bold">Mérleg</h2>
          <button className="btn-ghost shrink-0" onClick={openScaleEdit} title="Szerkesztés">
            <Pencil size={16} />
          </button>
        </div>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          <Field label="Név" value={scale.name} />
          <Field label="Típus" value={
            scale.source_type === 'kaptargsm' ? 'KaptárGSM' :
            scale.source_type === 'sms' ? 'SMS beküldés' : 'Manuális'
          } />
          {scale.source_type === 'kaptargsm' && (
            <Field label="Forrás URL" value={scale.source_url ?? '—'} mono />
          )}
          {scale.source_type === 'sms' && (
            <Field label="Feladó telefonszám" value={scale.phone_number ?? '—'} mono />
          )}
          <Field label="Tára-eltolás" value={`${scale.tare_offset.toFixed(2)} kg`} mono />
        </dl>
        <div className="mt-4">
          <button className="btn-ghost" onClick={openTare}>
            <ScaleIcon size={18} /> Tárázás
          </button>
        </div>
      </section>

      {/* ── SMS beküldés ── */}
      {scale.source_type === 'sms' && (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-1">iPhone Shortcuts beállítás</h2>
          <p className="text-sm text-slate-400 mb-4">
            Töltsd le a parancsikont, add meg a tokent és az URL-t, majd állíts be automatikát
            az SMS érkezésekor.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ingest token</label>
              <div className="flex gap-2">
                <code className="input flex-1 font-mono text-xs truncate select-all bg-slate-900">
                  {user?.ingest_token ?? '…'}
                </code>
                <button className="btn-ghost shrink-0" title="Másolás" onClick={async () => {
                  await navigator.clipboard.writeText(user?.ingest_token ?? '')
                  setTokenCopied(true)
                  setTimeout(() => setTokenCopied(false), 2000)
                }}>
                  {tokenCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                </button>
                <button className="btn-ghost shrink-0" title="Token újragenerálása" disabled={rotatingToken}
                  onClick={async () => {
                    if (!confirm('Biztosan újragenerálod a tokent? A shortcutban is frissíteni kell!')) return
                    setRotatingToken(true)
                    try { await api.rotateIngestToken(); await refresh(); notify('Token újragenerálva') }
                    catch (e: any) { notify('Hiba: ' + e.message) }
                    finally { setRotatingToken(false) }
                  }}>
                  <RefreshCw size={16} className={rotatingToken ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Beküldési URL</label>
              <div className="flex gap-2">
                <code className="input flex-1 font-mono text-xs truncate select-all bg-slate-900">
                  {window.location.origin}/api/ingest/sms
                </code>
                <button className="btn-ghost shrink-0" title="Másolás" onClick={async () => {
                  await navigator.clipboard.writeText(`${window.location.origin}/api/ingest/sms`)
                  setUrlCopied(true)
                  setTimeout(() => setUrlCopied(false), 2000)
                }}>
                  {urlCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
            <a href="https://www.icloud.com/shortcuts/3cc4f2799e9f478eaaf01e86924ab154"
              target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex">
              <ExternalLink size={16} /> Parancsikonok letöltése
            </a>
          </div>
        </section>
      )}

      {/* ── Tára történet ── */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <History size={18} className="text-slate-400" />
          <h2 className="text-lg font-bold">Tára történet</h2>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Minden tárázás az adott időponttól érvényes — a korábbi mérések nettó értékét nem írja át.
        </p>
        {tareEvents.length === 0 ? (
          <p className="text-sm text-slate-400">Még nincs tára-esemény rögzítve.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-3 py-2 text-left text-slate-300">Mikor</th>
                <th className="px-3 py-2 text-right text-slate-300">Cél nettó</th>
                <th className="px-3 py-2 text-right text-slate-300">Eltolás</th>
                <th className="px-3 py-2 text-left text-slate-300">Megjegyzés</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {[...tareEvents].reverse().map(ev => (
                <tr key={ev.id} className="border-b border-slate-800">
                  <td className="px-3 py-2">{fmtDate(ev.timestamp)}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {ev.target_net !== null ? `${ev.target_net.toFixed(2)} kg` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{ev.offset.toFixed(2)} kg</td>
                  <td className="px-3 py-2 text-slate-400">{ev.note ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="text-slate-400 hover:text-red-400"
                      onClick={async () => {
                        if (!confirm('Biztosan törlöd? Az utána készült mérések nettó értéke a korábbi offsethez igazodik.')) return
                        await api.deleteTareEvent(ev.id)
                        notify('Tára-esemény törölve')
                        onChange()
                      }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Veszélyzóna ── */}
      <section className="card p-5 border border-red-900/40">
        <h2 className="text-lg font-bold text-red-400 mb-2">Veszélyzóna</h2>
        <p className="text-sm text-slate-400 mb-3">
          A mérleg és az összes hozzá tartozó mérés, szezon, tárázás véglegesen törlődik.
        </p>
        <button
          className="btn-ghost text-red-400 hover:text-red-300"
          onClick={async () => {
            if (!confirm(`Biztosan törlöd a(z) "${scale.name}" mérleget? Ez nem visszavonható!`)) return
            try {
              await api.deleteScale(scale.id)
              onDelete()
            } catch (e: any) { notify('Hiba: ' + e.message) }
          }}
        >
          <Trash2 size={16} /> Mérleg törlése
        </button>
      </section>

      {/* ── Modals ── */}
      <Modal open={scaleOpen} onClose={() => setScaleOpen(false)} title="Mérleg szerkesztése">
        <label className="block text-xs text-slate-400 mb-1">Név</label>
        <input className="input mb-3" value={scaleName} onChange={e => setScaleName(e.target.value)} />
        <label className="block text-xs text-slate-400 mb-1">Akkumulátor egység</label>
        <div className="flex gap-2 mb-4">
          {['V', '%'].map(u => (
            <button key={u} type="button"
              className={`px-4 py-1.5 rounded text-sm font-medium border transition ${scaleBatteryUnit === u ? 'bg-honey-500/20 text-honey-300 border-honey-700/60' : 'text-slate-400 border-slate-700 hover:border-slate-500'}`}
              onClick={() => setScaleBatteryUnit(u)}>{u}</button>
          ))}
        </div>
        {scale.source_type === 'kaptargsm' && (
          <>
            <label className="block text-xs text-slate-400 mb-1">Forrás URL</label>
            <input className="input mb-4" value={scaleUrl} onChange={e => setScaleUrl(e.target.value)} />
          </>
        )}
        {scale.source_type === 'sms' && (
          <>
            <label className="block text-xs text-slate-400 mb-1">Feladó telefonszám</label>
            <input className="input mb-3" value={scalePhone} onChange={e => setScalePhone(e.target.value)} placeholder="+36301234567" />
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input type="checkbox" className="accent-honey-400 w-4 h-4"
                checked={scaleCallTrigger} onChange={e => setScaleCallTrigger(e.target.checked)} />
              <span className="text-sm text-slate-300">Telefonhívással triggerelt</span>
            </label>
            <FieldPatternEditor value={scaleSmsTemplate} onChange={setScaleSmsTemplate} />
          </>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setScaleOpen(false)}>Mégse</button>
          <button className="btn-primary" onClick={async () => {
            await api.updateScale(scale.id, {
              name: scaleName,
              battery_unit: scaleBatteryUnit,
              source_url: scale.source_type === 'kaptargsm' ? (scaleUrl || null) : undefined,
              phone_number: scale.source_type === 'sms' ? (scalePhone.trim() || null) : undefined,
              sms_template: scale.source_type === 'sms' ? (scaleSmsTemplate.trim() || null) : undefined,
              call_trigger: scale.source_type === 'sms' ? (scaleCallTrigger ? 1 : 0) : undefined,
            })
            setScaleOpen(false)
            notify('Mérleg frissítve')
            onChange()
          }}>Mentés</button>
        </div>
      </Modal>

      <Modal open={tareOpen} onClose={() => setTareOpen(false)} title="Tárázás (fiókváltás / pörgetés)">
        <p className="text-sm text-slate-300 mb-4">
          Ha fiókot raksz fel/veszel le, vagy pörgetsz és az eddig gyűjtött mézet meg akarod
          tartani a nettóban, írd be a mérleg bruttó értékét közvetlenül a művelet <b>ELŐTT</b>
          és <b>UTÁN</b>.
        </p>
        <label className="block text-xs text-slate-400 mb-1">
          Bruttó a művelet ELŐTT (kg)
          {latestRaw !== null && <span className="text-slate-500"> — utolsó mért: {latestRaw.toFixed(2)}</span>}
        </label>
        <input className="input mb-3" type="number" step="0.1"
          placeholder="mit mutatott a mérleg közvetlenül előtte"
          value={tarePre} onChange={e => setTarePre(e.target.value)} />
        <label className="block text-xs text-slate-400 mb-1">Bruttó a művelet UTÁN (kg)</label>
        <input className="input mb-3" type="number" step="0.1"
          placeholder="mit mutat most a mérleg"
          value={tarePost} onChange={e => setTarePost(e.target.value)} />
        {(() => {
          const pre = Number(tarePre)
          const post = Number(tarePost)
          if (!tarePre || !tarePost || !isFinite(pre) || !isFinite(post)) return null
          const preNet = pre - scale.tare_offset
          const boxDelta = post - pre
          const target = tareAdvanced && tareTarget ? Number(tareTarget) : preNet
          const newOffset = post - target
          return (
            <div className="text-xs text-slate-400 mb-3 space-y-1 rounded-lg bg-slate-800/50 p-3">
              <div>Fiók súlya: <span className="font-mono text-slate-200">{boxDelta >= 0 ? '+' : ''}{boxDelta.toFixed(2)} kg</span></div>
              <div>Nettó a művelet előtt: <span className="font-mono text-slate-200">{preNet.toFixed(2)} kg</span></div>
              <div>Cél nettó: <span className="font-mono text-slate-200">{target.toFixed(2)} kg</span></div>
              <div>Új tára-eltolás: <span className="font-mono text-slate-200">{newOffset.toFixed(2)} kg</span></div>
            </div>
          )
        })()}
        <button type="button" className="text-xs text-slate-400 hover:text-slate-200 mb-2"
          onClick={() => setTareAdvanced(v => !v)}>
          {tareAdvanced ? '▾' : '▸'} Haladó — cél nettó felülírása (kalibráció)
        </button>
        {tareAdvanced && (
          <>
            <p className="text-xs text-slate-500 mb-1">
              Csak akkor írd át, ha explicit értékre kalibrálsz (pl. tudod hogy most 0 kg méz van).
            </p>
            <input className="input mb-3" type="number" step="0.1"
              placeholder="cél nettó (kg) — üres = nettó változatlan"
              value={tareTarget} onChange={e => setTareTarget(e.target.value)} />
          </>
        )}
        <label className="block text-xs text-slate-400 mb-1">Megjegyzés (opcionális)</label>
        <input className="input mb-4" placeholder="pl. új fiók hozzáadása"
          value={tareNote} onChange={e => setTareNote(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setTareOpen(false)}>Mégse</button>
          <button className="btn-primary" disabled={!tarePre || !tarePost}
            onClick={async () => {
              const pre = Number(tarePre)
              const post = Number(tarePost)
              const tgt = tareAdvanced && tareTarget ? Number(tareTarget) : undefined
              const preNet = pre - scale.tare_offset
              const finalTarget = tgt !== undefined ? tgt : preNet
              const newOffset = post - finalTarget
              if (!confirm(
                `Előtte: ${pre.toFixed(2)} kg\nUtána: ${post.toFixed(2)} kg\n` +
                `Cél nettó: ${finalTarget.toFixed(2)} kg\nÚj eltolás: ${newOffset.toFixed(2)} kg\nFolytatod?`
              )) return
              await api.tare(scale.id, pre, post, tgt, tareNote.trim() || undefined)
              setTareOpen(false)
              notify('Tárázás mentve')
              onChange()
            }}>
            Mentés
          </button>
        </div>
      </Modal>
    </div>
  )
}

const FIELD_DEFS = [
  { key: 'weight',  label: 'Súly',  required: true  },
  { key: 'temp',    label: 'Hőfok', required: false },
  { key: 'battery', label: 'Akku',  required: false },
] as const

type FieldKey = 'weight' | 'temp' | 'battery'

function FieldPatternEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let parsed: Record<string, string> = { weight: '', temp: '', battery: '' }
  try { Object.assign(parsed, JSON.parse(value || '{}')) } catch {}

  function update(key: FieldKey, pattern: string) {
    const next = { ...parsed, [key]: pattern }
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v))
    onChange(Object.keys(clean).length ? JSON.stringify(clean) : '')
  }

  return (
    <div className="space-y-3 mb-4">
      {FIELD_DEFS.map(f => {
        const pattern = parsed[f.key] || ''
        const hasPh = pattern.includes('{}')
        const [before, after] = hasPh ? pattern.split('{}') : [pattern, '']
        return (
          <div key={f.key} className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-12 shrink-0">
              {f.label}{f.required && <span className="text-red-400">*</span>}
            </span>
            <input
              className="input font-mono text-sm flex-1"
              value={pattern}
              onChange={e => update(f.key, e.target.value)}
              placeholder="pl. Prefix: {}suffix"
            />
            {hasPh && (
              <span className="font-mono text-xs text-slate-500 shrink-0 hidden sm:block">
                {before}<span className="text-emerald-400 font-semibold">42.1</span>{after}
              </span>
            )}
          </div>
        )
      })}
      <p className="text-xs text-slate-500">
        A <code className="font-mono bg-slate-800 px-1 rounded">{'{}'}</code> helyére kerül a szám.
        Minden mező önállóan keres — ha az akku nem stimmel, a súly akkor is megvan.
        Hagyd üresen ha az alapértelmezett kaptárgsm-formátumot használod.
      </p>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-400 mb-1">{label}</dt>
      <dd className={`text-slate-200 break-all ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
