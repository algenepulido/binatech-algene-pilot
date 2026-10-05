// ============================================================
// ProjectModelCard — the BIM model panel on the project dashboard. Shows the
// active model (or "no model yet") with actions: open in 3D, upload/replace,
// and remove (non-destructive deactivate). Lets the user manage the model
// before diving into the 3D view.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { toast } from '../components/Toast.jsx';
import { Box, Upload, Trash2, ArrowRight } from 'lucide-react';
import { Btn } from '../components/primitives.jsx';
import { Modal } from '../components/Modal.jsx';
import { ModelUpload } from './settings/ModelUpload.jsx';
import { getActiveModel, deactivateModels } from '../api/models.js';
import { useElements } from '../lib/elements.jsx';
import { isSampleProject } from '../lib/currentProject.js';
import { useAuth } from '../lib/auth.jsx';
import { COL } from '../lib/theme.js';

export function ProjectModelCard({ onNavigate }) {
  const { reload: reloadElements } = useElements();
  const { requireAuth } = useAuth();
  const [active, setActive] = useState(undefined); // undefined=loading, null=none
  const [uploadOpen, setUploadOpen] = useState(false);
  const sample = isSampleProject();

  const load = useCallback(() => { getActiveModel().then((m) => setActive(m || null)).catch(() => setActive(null)); }, []);
  useEffect(() => { load(); }, [load]);

  function removeModel() {
    requireAuth(async () => {
      if (!await confirmDialog('Remove the current model from this project?\n\nThe file and its elements are kept in history; the project shows "no model" until you upload a new one.')) return;
      try { await deactivateModels(); await reloadElements(); load(); } catch (e) { toast.error(e.message); }
    });
  }

  return (
    <div className="rounded-lg border p-5" style={{ background: COL.surface, borderColor: COL.border }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><Box size={16} style={{ color: COL.accent }} /><div className="display text-base font-bold">BIM Model</div></div>
        {(active || sample) && <Btn variant="ghost" icon={ArrowRight} onClick={() => onNavigate('model')}>Open in 3D</Btn>}
      </div>

      {sample ? (
        <div className="rounded border p-3 text-xs flex items-center justify-between gap-3" style={{ borderColor: COL.border, background: COL.bg }}>
          <span style={{ color: COL.textDim }}>Built-in sample model. Create your own project to upload and manage a real IFC.</span>
          <Btn icon={ArrowRight} onClick={() => onNavigate('model')}>View</Btn>
        </div>
      ) : active === undefined ? (
        <div className="text-xs" style={{ color: COL.textMute }}>Loading…</div>
      ) : active ? (
        <div className="rounded border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: COL.border, background: COL.bg }}>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{active.file_name}</div>
            <div className="mono text-[11px] mt-0.5" style={{ color: COL.textDim }}>v{active.version} · {active.element_count} elements · active</div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Btn icon={Upload} onClick={() => requireAuth(() => setUploadOpen(true))}>Replace</Btn>
            <Btn icon={Trash2} onClick={removeModel}>Remove</Btn>
          </div>
        </div>
      ) : (
        <div className="rounded border border-dashed p-5 text-center" style={{ borderColor: COL.borderStrong, background: COL.bg }}>
          <div className="text-xs mb-3" style={{ color: COL.textDim }}>No model uploaded for this project yet.</div>
          <Btn icon={Upload} variant="primary" onClick={() => requireAuth(() => setUploadOpen(true))}>Upload IFC model</Btn>
        </div>
      )}

      <Modal open={uploadOpen} onClose={() => { setUploadOpen(false); load(); reloadElements(); }} title="Upload / replace BIM model" subtitle="Re-uploading creates a new active version (older kept in history)" width={640}>
        <ModelUpload />
      </Modal>
    </div>
  );
}
