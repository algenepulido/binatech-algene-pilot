// ============================================================
// NewProjectModal — create a project (name, client, consultant) and
// optionally upload its BIM (IFC) file in one flow. Each model belongs to
// the one project. Shows progress while parsing + uploading.
// (The large-file R2 upload path is layered in on top of uploadModelFile.)
// ============================================================
import { useRef, useState } from 'react';
import { Building2, Upload, Check, FolderPlus, AlertCircle } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { createProject } from '../../api/projects.js';
import { uploadModelFile } from '../../api/modelUpload.js';
import { parseIfcBuildingElements } from '../../lib/ifc.js';
import { setCurrentProjectId } from '../../lib/currentProject.js';
import { COL } from '../../lib/theme.js';

const field = {
  width: '100%', padding: '9px 11px', fontSize: 13.5, borderRadius: 9,
  border: `1px solid ${COL.borderStrong}`, background: COL.surface, color: COL.text, outline: 'none',
};

export function NewProjectModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', client: '', consultant: '', contractor: '' });
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState('form'); // form | working | done | error
  const [msg, setMsg] = useState('');
  const [pct, setPct] = useState(null); // null = indeterminate
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const reset = () => { setForm({ name: '', client: '', consultant: '', contractor: '' }); setFile(null); setPhase('form'); setMsg(''); setPct(null); setError(''); };
  const close = () => { reset(); onClose?.(); };

  function pickFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const n = f.name.toLowerCase();
    if (n.endsWith('.rvt')) { setError("Revit (.rvt) files can't be opened directly — it's a closed Autodesk format. In Revit, choose File → Export → IFC, then upload the resulting .ifc here."); return; }
    if (!n.endsWith('.ifc')) { setError('Please choose a .ifc file.'); return; }
    setError(''); setFile(f);
  }

  async function submit() {
    if (!form.name.trim()) { setError('Give the project a name.'); return; }
    setPhase('working'); setError(''); setPct(null);
    let project;
    try {
      setMsg('Creating project…');
      project = await createProject(form);
    } catch (e) {
      setPhase('error');
      setError(/relation|does not exist|projects/i.test(e?.message || '')
        ? 'The projects table isn’t set up yet. Run the SQL in DESIGN_LOG.md (Supabase → SQL editor), then try again.'
        : (e?.message || 'Could not create the project.'));
      return;
    }

    // The new project becomes current so the upload + elements scope to it.
    setCurrentProjectId(project.id);

    if (!file) { setPhase('done'); setMsg('Project created.'); onCreated?.(project, false); return; }

    try {
      setMsg('Reading the BIM model…');
      const buf = await file.arrayBuffer();
      const elements = await parseIfcBuildingElements(buf, (n) => setMsg(`Reading model — found ${n} elements…`));
      if (!elements.length) { setPhase('error'); setError('No building elements found in this IFC file. The project was created; you can upload a model later.'); return; }
      setMsg(`Uploading model + ${elements.length} elements…`);
      await uploadModelFile({ projectId: project.id, file, elements, onProgress: (p) => setPct(p) });
      setPct(100);
      // Report the quantity gate: did the IFC actually carry volumes/areas/lengths?
      const qs = elements.quantitySummary;
      const qtyNote = qs
        ? (qs.withVolume || qs.withArea || qs.withLength)
          ? ` Quantities found: ${qs.withVolume} with volume, ${qs.withArea} area, ${qs.withLength} length — quantity × rate valuation is enabled.`
          : ' No quantities in this IFC — enter volume/area/length per element to value them.'
        : '';
      setPhase('done'); setMsg(`Done — ${elements.length} elements imported.${qtyNote}`);
      onCreated?.(project, true);
    } catch (e) {
      setPhase('error');
      setError(`Project created, but the model upload failed: ${e?.message || e}. You can upload it later from the model view.`);
    }
  }

  return (
    <Modal open={open} onClose={close} title="New project" subtitle="Name it, set client & consultant, then add its BIM model" width={520}
      footer={
        phase === 'form' ? <><Btn variant="secondary" onClick={close}>Cancel</Btn><Btn variant="primary" icon={FolderPlus} onClick={submit}>Create project</Btn></>
          : phase === 'done' ? <Btn variant="primary" onClick={close}>Done</Btn>
            : phase === 'error' ? <><Btn variant="secondary" onClick={close}>Close</Btn><Btn variant="primary" onClick={() => setPhase('form')}>Back</Btn></>
              : <Btn variant="secondary" disabled>Working…</Btn>
      }>
      {phase === 'form' && (
        <div className="space-y-3.5">
          <div>
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>Project name *</label>
            <input value={form.name} onChange={upd('name')} style={field} placeholder="e.g. Riyadh Business Tower" autoFocus />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>Client</label>
              <input value={form.client} onChange={upd('client')} style={field} placeholder="Client / owner" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>Consultant</label>
              <input value={form.consultant} onChange={upd('consultant')} style={field} placeholder="Supervising consultant" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>Main contractor</label>
            <input value={form.contractor} onChange={upd('contractor')} style={field} placeholder="Main contractor (optional)" />
          </div>

          <div className="pt-1">
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>BIM model (IFC) — optional</label>
            <input ref={fileRef} type="file" accept=".ifc" hidden onChange={pickFile} />
            <button onClick={() => fileRef.current?.click()} className="w-full flex items-center gap-3 px-3.5 py-3 rounded-lg border-2 border-dashed text-left transition hover:bg-stone-50" style={{ borderColor: file ? COL.accent : COL.border, color: COL.text }}>
              <Upload size={18} style={{ color: file ? COL.accent : COL.textMute }} />
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate">{file ? file.name : 'Choose an .ifc file'}</div>
                <div className="text-[11px]" style={{ color: COL.textMute }}>{file ? `${(file.size / 1e6).toFixed(1)} MB · will upload after the project is created` : 'Revit users: export IFC (File → Export → IFC). You can also add it later.'}</div>
              </div>
            </button>
          </div>

          {error && <div className="flex items-start gap-2 text-[12px] px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#b91c1c' }}><AlertCircle size={15} className="mt-0.5 flex-shrink-0" />{error}</div>}
        </div>
      )}

      {phase === 'working' && (
        <div className="py-8 text-center">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: COL.accentBg }}><Building2 size={24} style={{ color: COL.accent }} /></div>
          <div className="text-sm font-medium mb-3" style={{ color: COL.text }}>{msg}</div>
          <div className="max-w-xs mx-auto h-2 rounded-full overflow-hidden" style={{ background: COL.surfaceAlt }}>
            <div className="h-full rounded-full transition-all duration-200" style={{ width: pct == null ? '40%' : `${pct}%`, background: COL.accent, animation: pct == null ? 'lpindeterminate 1.1s ease-in-out infinite' : 'none' }} />
          </div>
          {pct != null && <div className="mono text-[11px] mt-2" style={{ color: COL.textDim }}>{Math.round(pct)}%</div>}
          <style>{`@keyframes lpindeterminate { 0%{margin-left:-40%} 100%{margin-left:100%} }`}</style>
        </div>
      )}

      {phase === 'done' && (
        <div className="py-10 text-center">
          <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#f0fdf4' }}><Check size={28} style={{ color: '#16a34a' }} /></div>
          <div className="text-sm font-medium" style={{ color: COL.text }}>{msg}</div>
          <div className="text-[12px] mt-1" style={{ color: COL.textDim }}>Opening your project…</div>
        </div>
      )}

      {phase === 'error' && (
        <div className="py-6 text-center">
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#fef2f2' }}><AlertCircle size={24} style={{ color: '#b91c1c' }} /></div>
          <div className="text-[13px] px-4" style={{ color: COL.text }}>{error}</div>
        </div>
      )}
    </Modal>
  );
}
