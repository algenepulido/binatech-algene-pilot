// ============================================================
// ModelUpload — upload an .ifc model for the project. Parses it in the
// browser (web-ifc), stores the file + a new version, and imports the
// building elements so they power the link-to-element dropdowns.
// ============================================================
import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Upload } from 'lucide-react';
import { Btn } from '../../components/primitives.jsx';
import { listModels } from '../../api/models.js';
import { uploadModelFile } from '../../api/modelUpload.js';
import { isR2Configured } from '../../lib/r2.js';
import { getCurrentProjectId } from '../../lib/currentProject.js';
import { parseIfcBuildingElements } from '../../lib/ifc.js';
import { useElements } from '../../lib/elements.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { COL } from '../../lib/theme.js';

// Supabase Storage upload ceiling used when Cloudflare R2 isn't configured.
// Matches Supabase's default/free-plan limit. If you raise the `models`
// bucket limit (Pro plan), bump this number too so the panel + guard match.
const SUPABASE_MAX_MB = 50;

// `compact` collapses the technical file guidance into an accordion and drops
// the card chrome so the panel can sit inside a parent card (Model page /
// Elements Registry empty states). `onComplete` fires after a successful import
// so a host view can refresh. `uploadLabel` lets a host own the primary CTA
// copy. All default to the original standalone behavior.
export function ModelUpload({ compact = false, onComplete, uploadLabel = 'Upload IFC model' } = {}) {
  const { requireAuth } = useAuth();
  const { reload: reloadElements, elements } = useElements();
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [r2, setR2] = useState(null); // null = probing, true/false = known
  const busy = status?.phase === 'parsing' || status?.phase === 'uploading';
  const fileRef = useRef(null);

  const refresh = useCallback(async () => { try { setModels(await listModels()); } catch { /* ignore */ } }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { let live = true; isR2Configured().then((c) => { if (live) setR2(c); }).catch(() => { if (live) setR2(false); }); return () => { live = false; }; }, []);

  // What the panel advertises + enforces. R2 (when set up) streams multi-GB
  // files straight to Cloudflare; otherwise we're bounded by Supabase Storage.
  const limitLabel = r2 ? 'up to several GB (Cloudflare R2)' : `${SUPABASE_MAX_MB} MB max`;
  const mb = (bytes) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const n = file.name.toLowerCase();
    if (n.endsWith('.rvt')) { setError("Revit (.rvt) files can't be opened directly — it's a closed Autodesk format. In Revit, choose File → Export → IFC, then upload the resulting .ifc here."); setStatus(null); return; }
    if (!n.endsWith('.ifc')) { setError('Please choose a .ifc file.'); return; }
    if (!r2 && file.size > SUPABASE_MAX_MB * 1024 * 1024) {
      setError(`This file is ${mb(file.size)} MB — over the ${SUPABASE_MAX_MB} MB limit for Supabase Storage. Configure Cloudflare R2 (see DESIGN_LOG section B) for multi-GB models, or raise the Supabase bucket limit on the Pro plan.`);
      setStatus(null);
      return;
    }
    setError(null);
    try {
      setStatus({ phase: 'parsing', msg: 'Reading the model…' });
      const buf = await file.arrayBuffer();
      const els = await parseIfcBuildingElements(buf, (n) => setStatus({ phase: 'parsing', msg: `Found ${n} elements…` }));
      if (els.length === 0) { setError('No building elements found in this IFC file.'); setStatus(null); return; }
      setStatus({ phase: 'uploading', msg: `Saving model + ${els.length} elements…` });
      await uploadModelFile({ projectId: getCurrentProjectId(), file, elements: els, onProgress: (p) => setStatus({ phase: 'uploading', msg: `Uploading model + ${els.length} elements… ${Math.round(p)}%` }) });
      await reloadElements();
      await refresh();
      setStatus({ phase: 'done', msg: `Done — ${els.length} elements imported. They now power the link-to-element dropdowns across all modules.` });
      onComplete?.();
    } catch (err) {
      setError(err?.message ?? String(err));
      setStatus(null);
    }
  }

  const active = models.find((m) => m.is_active);

  // The technical bits (Revit export note + size ceiling) — shown inline in the
  // standalone panel, tucked into an accordion in compact mode so the upload
  // action stays the focus.
  const guidance = (
    <>
      <div className="text-[11px]" style={{ color: COL.textMute }}>Using Revit? Export IFC first — <span style={{ color: COL.textDim }}>File → Export → IFC</span> — then upload the <span className="mono">.ifc</span>. Native <span className="mono">.rvt</span> can't be read directly.</div>
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px]" style={{ background: COL.bg, border: `1px solid ${COL.border}`, color: COL.textDim }}>
        <span style={{ color: COL.textMute }}>Max file size:</span>
        <span className="mono font-semibold" style={{ color: COL.text }}>{r2 === null ? 'checking…' : limitLabel}</span>
      </div>
    </>
  );

  return (
    <div className={compact ? '' : 'max-w-2xl rounded-lg border p-5'} style={compact ? undefined : { background: COL.surface, borderColor: COL.border }}>
      {!compact && <div className="flex items-center gap-2 mb-1"><Box size={16} style={{ color: COL.accent }} /><div className="display text-sm font-bold">BIM Model (IFC)</div></div>}
      <div className={compact ? 'text-[12px] mb-3' : 'text-xs mb-3'} style={{ color: COL.textDim }}>Upload an <span className="mono">.ifc</span> model for this project. Re-uploading creates a new version under the same project. Its elements become the link-to-element options everywhere.</div>

      {compact ? (
        <details className="mb-3">
          <summary className="cursor-pointer select-none text-[11px] font-medium" style={{ color: COL.textDim }}>File requirements</summary>
          <div className="mt-2 flex flex-col items-start gap-2">{guidance}</div>
        </details>
      ) : (
        <div className="mb-4 flex flex-col items-start gap-3">{guidance}</div>
      )}

      {active ? (
        <div className="rounded border p-3 mb-3 text-xs" style={{ borderColor: COL.border, background: COL.bg }}>
          <div className="font-semibold">{active.file_name}</div>
          <div className="mono text-[11px] mt-1" style={{ color: COL.textDim }}>Version {active.version} · {active.element_count} elements · active</div>
        </div>
      ) : (
        <div className="rounded border p-3 mb-3 text-xs" style={{ borderColor: COL.border, background: COL.bg, color: COL.textDim }}>
          No model uploaded yet — the app is using the {elements.length} built-in sample elements.
        </div>
      )}

      <input ref={fileRef} type="file" accept=".ifc" hidden onChange={onFile} />
      <Btn icon={Upload} variant="primary" disabled={busy} onClick={() => requireAuth(() => fileRef.current?.click())}>{busy ? 'Working…' : uploadLabel}</Btn>

      {status && <div className="text-xs mt-3 px-2 py-1.5 rounded" style={{ background: status.phase === 'done' ? '#dcfce7' : '#eff6ff', color: status.phase === 'done' ? '#15803d' : COL.accent }}>{status.msg}</div>}
      {error && <div className="text-xs mt-3 px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}

      {models.length > 1 && (
        <div className="mt-4">
          <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textDim }}>VERSION HISTORY</div>
          {models.map((m) => (
            <div key={m.id} className="flex justify-between text-[11px] py-1 border-b" style={{ borderColor: COL.border }}>
              <span className="mono">v{m.version} · {m.file_name}</span>
              <span style={{ color: m.is_active ? '#16a34a' : COL.textMute }}>{m.is_active ? 'active' : 'older'} · {m.element_count} els</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
