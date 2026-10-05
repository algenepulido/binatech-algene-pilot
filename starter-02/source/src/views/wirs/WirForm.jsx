// ============================================================
// WirFormModal — create or edit a WIR. If `initial.id` is present it
// updates, otherwise it inserts. The reusable shape for module forms.
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { recertifyAll } from '../../lib/recertify.js';
import { ElementPickerPro } from '../../components/ElementPickerPro.jsx';
import { createWir, updateWir } from '../../api/wirs.js';
import { listBoqItems, isBoqLineItem } from '../../api/boqItems.js';
import { listWorkItems } from '../../api/workItems.js';
import { listLinksForElement } from '../../api/elementBoqLinks.js';
import { BoqLinePicker } from '../../components/BoqLinePicker.jsx';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { WIR_RESULTS, resultLabel } from '../../lib/wirStatus.js';
import { quantityForUnit } from '../../lib/quantity.js';
import { listTakeoff, replaceTakeoff, takeoffTotal } from '../../api/takeoff.js';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { COL } from '../../lib/theme.js';

const fieldStyle = {
  width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6,
  border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none',
};

function Field({ label, children }) {
  return (
    <label className="text-xs block" style={{ color: COL.textDim }}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const empty = {
  wir_number: '', inspection_type: '', element_guid: '', boq_item_id: '', drawing_ref: '',
  inspector_name: '', inspection_date: '', result: 'pending', remarks: '',
  scope_type: 'single_item', scope_package: '', scope_zone: '', scope_qty: '', scope_unit: '', scope_group_id: '',
  approved_qty: '', approved_unit: '', work_item_id: '',
  claimable: true, claim_status: 'unclaimed',
};

export function WirFormModal({ open, initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({ ...empty, ...stripNulls(initial) });
  const [boqList, setBoqList] = useState([]);
  useEffect(() => { if (open) listBoqItems().then(setBoqList).catch(() => setBoqList([])); }, [open]);
  // Work items (no-model unit of work). Choosing one fills the BoQ line it bills
  // against, so this WIR certifies exactly like an element-mediated one.
  const [workItems, setWorkItems] = useState([]);
  useEffect(() => { if (open) listWorkItems().then(setWorkItems).catch(() => setWorkItems([])); }, [open]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Measurement takeoff — itemized derivation behind the approved quantity.
  // When itemized, the rows' SUM drives approved_qty (read-only); otherwise the
  // quantity is entered directly, exactly as before.
  const [itemized, setItemized] = useState(false);
  const [takeoff, setTakeoff] = useState([]);
  useEffect(() => {
    if (!open) return;
    if (initial?.id) {
      listTakeoff(initial.id).then(({ rows }) => {
        if (rows && rows.length) { setTakeoff(rows.map((r) => ({ description: r.description || '', location: r.location || '', qty: r.qty ?? '' }))); setItemized(true); }
        else { setTakeoff([]); setItemized(false); }
      }).catch(() => {});
    } else { setTakeoff([]); setItemized(false); }
  }, [open, initial?.id]);
  const takeoffSum = takeoffTotal(takeoff);
  // Keep approved_qty mirrored to the takeoff sum while itemized.
  useEffect(() => { if (itemized) set('approved_qty', String(takeoffSum)); }, [itemized, takeoffSum]); // eslint-disable-line react-hooks/exhaustive-deps
  const addTakeoffRow = () => setTakeoff((t) => [...t, { description: '', location: '', qty: '' }]);
  const setTakeoffRow = (i, key, val) => setTakeoff((t) => t.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  const removeTakeoffRow = (i) => setTakeoff((t) => t.filter((_, j) => j !== i));

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  // Pick a work item → record the back-reference AND adopt its BoQ line, drawing,
  // and location (so certification flows via the existing boq_item_id path).
  function pickWorkItem(id) {
    const wi = workItems.find((w) => String(w.id) === String(id));
    setForm((f) => ({
      ...f,
      work_item_id: id,
      boq_item_id: wi?.boq_item_id || f.boq_item_id,
      drawing_ref: f.drawing_ref || wi?.drawing_ref || '',
      scope_zone: f.scope_zone || wi?.location || '',
    }));
  }

  // The linked element's IFC quantities (to pre-fill the WIR approved quantity).
  const [elemQty, setElemQty] = useState(null);
  useEffect(() => {
    let active = true;
    const g = form.element_guid;
    if (!g) { setElemQty(null); return undefined; }
    supabase.from('model_elements').select('volume, area, length').eq('guid', g).limit(1)
      .then(({ data }) => { if (active) setElemQty(data && data[0] ? data[0] : null); })
      .catch(() => { if (active) setElemQty(null); });
    return () => { active = false; };
  }, [form.element_guid]);

  // BoQ lines this WIR's element is linked to — so an element-mediated WIR (no
  // line picked explicitly) can still record an approved quantity. Join table +
  // legacy element_id.
  const [elemLineIds, setElemLineIds] = useState([]);
  useEffect(() => {
    let active = true;
    const g = form.element_guid;
    if (!g) { setElemLineIds([]); return undefined; }
    listLinksForElement(g).then((ls) => { if (active) setElemLineIds((ls || []).map((l) => l.boq_item_id)); }).catch(() => { if (active) setElemLineIds([]); });
    return () => { active = false; };
  }, [form.element_guid]);
  const elementLines = useMemo(() => {
    const ids = new Set(elemLineIds);
    return boqList.filter((b) => isBoqLineItem(b) && (ids.has(b.id) || (form.element_guid && b.element_id === form.element_guid)));
  }, [boqList, elemLineIds, form.element_guid]);

  // The line this WIR certifies: the explicitly chosen line, else the element's
  // SINGLE linked line (recertify attributes an element-mediated WIR only when
  // the element maps to exactly one line).
  const explicitLine = boqList.find((b) => String(b.id) === String(form.boq_item_id)) || null;
  const effectiveLine = explicitLine || (elementLines.length === 1 ? elementLines[0] : null);
  const lineImplicit = !explicitLine && !!effectiveLine;             // chosen via the element's link
  const lineAmbiguous = !explicitLine && elementLines.length > 1;    // element maps to many lines
  const lineUnit = effectiveLine?.unit || '';
  const qm = lineUnit ? quantityForUnit(lineUnit) : null;             // { field, label } | null
  const ifcQty = (qm && qm.field !== 'count' && elemQty) ? elemQty[qm.field] : null;
  const normUnit = (u) => (u || '').toString().trim().toLowerCase().replace(/\s/g, '');
  const unitMismatch = form.approved_unit && lineUnit && normUnit(form.approved_unit) !== normUnit(lineUnit);
  // Default the approved unit to the line unit once a line is determined.
  useEffect(() => { if (effectiveLine && !form.approved_unit && lineUnit) set('approved_unit', lineUnit); }, [effectiveLine, lineUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remaining-quantity helper (DISPLAY ONLY — reads the same boq_items.approved_qty
  // / qty the engine reads; no math change). When editing, exclude THIS WIR's prior
  // contribution from the line total so the projection doesn't double-count it.
  const q2 = (n) => Math.round(n * 100) / 100;
  const lineContract = Number(effectiveLine?.qty || 0);
  const lineCertified = Number(effectiveLine?.approved_qty || 0);
  const priorThis = editing ? Number(initial?.approved_qty || 0) : 0;
  const otherCertified = Math.max(0, lineCertified - priorThis);            // already certified by OTHER WIRs
  const remainingBefore = Math.max(0, lineContract - otherCertified);       // uncertified headroom on the line
  const enteredQty = (form.approved_qty !== '' && form.approved_qty != null && !isNaN(Number(form.approved_qty))) ? Number(form.approved_qty) : 0;
  const projectedRemaining = Math.max(0, remainingBefore - enteredQty);
  const exceedsRemaining = otherCertified + enteredQty > lineContract + 1e-9;

  async function submit(e) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        wir_number: form.wir_number.trim(),
        inspection_type: orNull(form.inspection_type),
        element_guid: orNull(form.element_guid),
        drawing_ref: orNull(form.drawing_ref),
        inspector_name: orNull(form.inspector_name),
        inspection_date: orNull(form.inspection_date),
        result: form.result,
        remarks: orNull(form.remarks),
      };
      // Only send the additive boq_item_id when a BoQ line is chosen (so WIRs
      // keep working before the column exists).
      if (form.boq_item_id) payload.boq_item_id = form.boq_item_id;
      // WIR scope (additive; createWir strips these if the columns don't exist).
      payload.scope_type = form.scope_type || 'single_item';
      if (form.scope_type === 'measured_scope') {
        payload.scope_package = orNull(form.scope_package);
        payload.scope_zone = orNull(form.scope_zone);
        payload.scope_qty = (form.scope_qty !== '' && form.scope_qty != null && !isNaN(Number(form.scope_qty))) ? Number(form.scope_qty) : null;
        payload.scope_unit = orNull(form.scope_unit);
      }
      if (form.scope_group_id) payload.scope_group_id = form.scope_group_id;
      // Work-item back-reference (additive; createWir strips it if not migrated).
      if (form.work_item_id) payload.work_item_id = form.work_item_id;
      // Approved quantity — how much of the BoQ line this WIR proves (drives
      // certified value when Approved). Null when not entered (= certifies 0).
      // When itemized, the takeoff sum IS the approved quantity (the cert engine
      // still reads approved_qty — the takeoff is just its derivation backup).
      const apQty = itemized
        ? (takeoffSum > 0 ? takeoffSum : null)
        : ((form.approved_qty !== '' && form.approved_qty != null && !isNaN(Number(form.approved_qty))) ? Number(form.approved_qty) : null);
      payload.approved_qty = apQty;
      payload.approved_unit = orNull(form.approved_unit);
      // Commercial overlay (additive; createWir/updateWir strip+retry if not migrated).
      payload.claimable = form.claimable !== false;
      payload.claim_status = form.claim_status || 'unclaimed';
      // If certifying via the element's SINGLE linked line (no line picked) and a
      // quantity is entered, pin that line so recertify uses the explicit,
      // unambiguous direct path and the WIR records exactly which line it proves.
      if (!form.boq_item_id && lineImplicit && effectiveLine && apQty != null) payload.boq_item_id = effectiveLine.id;
      const saved = editing ? await updateWir(initial.id, payload) : await createWir(payload);
      // Persist the measurement takeoff (the derivation behind the quantity).
      // Toggling itemize off clears it. Best-effort — never blocks the WIR save.
      try { await replaceTakeoff(saved?.id, itemized ? takeoff : []); } catch { /* takeoff not provisioned yet */ }
      // Auto-flow: any WIR change re-certifies the project's linked BOQ lines'
      // billable qty (recompute always — editing a WIR can add/remove a link).
      await recertifyAll();
      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${initial.wir_number}` : 'Add WIR'}
      subtitle="Work Inspection Request"
      width={560}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create WIR')}</Btn>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="WIR Number *">
          <input required value={form.wir_number} onChange={(e) => set('wir_number', e.target.value)} style={fieldStyle} className="mono" placeholder="WIR-0180" />
        </Field>
        <Field label="Inspection Type">
          <input value={form.inspection_type} onChange={(e) => set('inspection_type', e.target.value)} style={fieldStyle} placeholder="Rebar Inspection" />
        </Field>
        <div className="col-span-2">
          <Field label="This WIR covers">
            <StyledSelect ariaLabel="This WIR covers" value={form.scope_type || 'single_item'} onChange={(v) => set('scope_type', v)} options={[
              { value: 'single_item', label: 'One item (a single element)' },
              { value: 'grouped_items', label: 'Several selected items (same scope/package)' },
              { value: 'measured_scope', label: 'A measured scope (quantity basis, e.g. linear metres)' },
            ]} />
          </Field>
        </div>
        {form.scope_type === 'grouped_items' && initial?.scope_group_count > 1 && (
          <div className="col-span-2 text-[11px] px-2 py-1.5 rounded" style={{ background: COL.accentBg, color: COL.accent }}>
            Part of a group of {initial.scope_group_count} selected elements.
          </div>
        )}
        {workItems.length > 0 && (
          <div className="col-span-2">
            <Field label="Work item (no-model — fills the BoQ line it bills against)">
              <StyledSelect ariaLabel="Work item" value={form.work_item_id ? String(form.work_item_id) : ''} onChange={pickWorkItem} noneLabel="— none —"
                options={[{ value: '', label: '— none —' }, ...workItems.map((w) => ({ value: String(w.id), label: `${w.location || w.id}${w.description ? ` · ${w.description}` : ''}` }))]} />
              {form.work_item_id && <div className="text-[10px] mt-1" style={{ color: COL.accent }}>This WIR makes the work item's BoQ-line quantity claimable — enter the approved quantity below, same as an element WIR. Certifying it into an IPC is a separate step.</div>}
            </Field>
          </div>
        )}
        <div className="col-span-2">
          <Field label={form.scope_type === 'measured_scope' ? 'Representative element (optional)' : 'Linked Element (IFC GUID)'}>
            <ElementPickerPro value={form.element_guid} onChange={(v) => set('element_guid', v)} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Certifies BoQ line (optional)">
            <BoqLinePicker value={form.boq_item_id} items={boqList.filter(isBoqLineItem)} onChange={(id) => set('boq_item_id', id)} />
            <div className="text-[10px] mt-1" style={{ color: COL.textDim }}>Choose the priced line this inspection proves. Linking alone does not certify — the Approved quantity below (when this WIR is Approved) is what gets certified, capped at the contract quantity.</div>
            {lineImplicit && <div className="text-[10px] mt-1" style={{ color: COL.accent }}>Certifying line {effectiveLine.code || effectiveLine.description || ''} via this element's link — enter the approved quantity below.</div>}
            {lineAmbiguous && <div className="text-[10px] mt-1" style={{ color: '#b45309' }}>This element is linked to {elementLines.length} BoQ lines — pick the one this WIR certifies above to record an approved quantity.</div>}
          </Field>
        </div>
        {effectiveLine && (<>
          <Field label={`Approved quantity${lineUnit ? ` · line unit ${lineUnit}` : ''}`}>
            <input type="number" inputMode="decimal" value={form.approved_qty} disabled={itemized} onChange={(e) => set('approved_qty', e.target.value)} style={{ ...fieldStyle, ...(itemized ? { background: COL.surfaceAlt, color: COL.textDim } : null) }} className="mono" placeholder={ifcQty != null ? String(ifcQty) : 'e.g. 120'} />
            {itemized ? (
              <div className="text-[10px] mt-1" style={{ color: COL.accent }}>= sum of the measurement takeoff below ({takeoffSum} {form.approved_unit || lineUnit}).</div>
            ) : ifcQty != null ? (
              <button type="button" onClick={() => { set('approved_qty', String(ifcQty)); if (!form.approved_unit) set('approved_unit', qm?.label || lineUnit); }} className="text-[10px] mt-1" style={{ color: COL.accent }}>Use IFC quantity ({ifcQty} {qm?.label || lineUnit})</button>
            ) : (
              <div className="text-[10px] mt-1" style={{ color: '#b45309' }}>No IFC quantity on this element — enter the approved quantity manually.</div>
            )}
          </Field>
          <Field label="Unit">
            <input value={form.approved_unit} onChange={(e) => set('approved_unit', e.target.value)} style={fieldStyle} placeholder={lineUnit || 'm3'} />
            {unitMismatch && <div className="text-[10px] mt-1" style={{ color: '#b91c1c' }}>⚠ Differs from the BoQ line unit ({lineUnit}).</div>}
          </Field>
          {lineContract > 0 && (
            <div className="col-span-2 text-[10px] px-2 py-1.5 rounded" style={{ background: COL.surfaceAlt, color: COL.textDim }}>
              <b style={{ color: COL.text }}>{q2(remainingBefore)}</b> of {q2(lineContract)} {lineUnit} remaining uncertified on this line
              {otherCertified > 0 && <> · {q2(otherCertified)} already certified by other WIRs</>}
              {enteredQty > 0 && <> · after this WIR: <b style={{ color: exceedsRemaining ? '#b91c1c' : COL.text }}>{q2(projectedRemaining)}</b> {lineUnit} would remain</>}
              {exceedsRemaining && <span style={{ color: '#b91c1c' }}> — exceeds remaining; the engine caps certification at the contract quantity</span>}
            </div>
          )}
          {/* Measurement takeoff — itemized derivation behind the quantity */}
          <div className="col-span-2 rounded-lg border" style={{ borderColor: COL.border, background: COL.surface }}>
            <label className="flex items-center gap-2 px-3 py-2 cursor-pointer text-[12px] font-semibold" style={{ color: COL.text }}>
              <input type="checkbox" checked={itemized} onChange={(e) => { setItemized(e.target.checked); if (e.target.checked && takeoff.length === 0) addTakeoffRow(); }} />
              Itemize the quantity (measurement takeoff)
              <span className="font-normal" style={{ color: COL.textMute }}>— show how this quantity was measured</span>
            </label>
            {itemized && (
              <div className="px-3 pb-3">
                <div className="flex gap-2 text-[10px] font-semibold px-1 mb-1" style={{ color: COL.textMute }}>
                  <div className="flex-1">Description</div><div className="w-28">Location</div><div className="w-20 text-right">Qty</div><div className="w-6" />
                </div>
                {takeoff.map((r, i) => (
                  <div key={i} className="flex gap-2 mb-1.5 items-center">
                    <input value={r.description} onChange={(e) => setTakeoffRow(i, 'description', e.target.value)} style={{ ...fieldStyle, flex: 1 }} placeholder="e.g. Deck slab, span 1" />
                    <input value={r.location} onChange={(e) => setTakeoffRow(i, 'location', e.target.value)} style={{ ...fieldStyle, width: 112 }} placeholder="Link A, P1-P2" />
                    <input type="number" inputMode="decimal" value={r.qty} onChange={(e) => setTakeoffRow(i, 'qty', e.target.value)} style={{ ...fieldStyle, width: 80, textAlign: 'right' }} className="mono" placeholder="0" />
                    <button type="button" onClick={() => removeTakeoffRow(i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50" style={{ color: '#b91c1c' }} aria-label="Remove row"><Trash2 size={13} /></button>
                  </div>
                ))}
                <div className="flex items-center justify-between mt-1.5">
                  <button type="button" onClick={addTakeoffRow} className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: COL.accent }}><Plus size={12} /> Add line</button>
                  <div className="text-[12px] font-semibold mono" style={{ color: COL.text }}>Total: {takeoffSum} {form.approved_unit || lineUnit}</div>
                </div>
              </div>
            )}
          </div>
        </>)}
        {form.scope_type === 'measured_scope' && (<>
          <Field label="Package / scope ref">
            <input value={form.scope_package} onChange={(e) => set('scope_package', e.target.value)} style={fieldStyle} placeholder="Waterproofing — Foundation F3" />
          </Field>
          <Field label="Zone / location">
            <input value={form.scope_zone} onChange={(e) => set('scope_zone', e.target.value)} style={fieldStyle} placeholder="Pier 3, north face" />
          </Field>
          <Field label="Quantity basis">
            <input type="number" inputMode="decimal" value={form.scope_qty} onChange={(e) => set('scope_qty', e.target.value)} style={fieldStyle} className="mono" placeholder="48" />
          </Field>
          <Field label="Unit">
            <input value={form.scope_unit} onChange={(e) => set('scope_unit', e.target.value)} style={fieldStyle} placeholder="m" />
          </Field>
          <div className="col-span-2 text-[10px]" style={{ color: COL.textDim }}>Measured scope records the quantity basis for this inspection. With a BoQ line chosen above and result Approved, the <b>Approved quantity</b> part-certifies that line (e.g. 60 of 200) — capped at the contract quantity and accumulated across WIRs, so monthly IPCs draw the cumulative certified value. The quantity basis here is recorded for reference.</div>
        </>)}
        <Field label="Drawing Ref">
          <input value={form.drawing_ref} onChange={(e) => set('drawing_ref', e.target.value)} style={fieldStyle} className="mono" placeholder="SD-STR-201 Rev C" />
        </Field>
        <Field label="Inspector">
          <input value={form.inspector_name} onChange={(e) => set('inspector_name', e.target.value)} style={fieldStyle} placeholder="Eng. Synthetic A" />
        </Field>
        <Field label="Inspection Date">
          <input type="date" value={form.inspection_date ?? ''} onChange={(e) => set('inspection_date', e.target.value)} style={fieldStyle} className="mono" />
        </Field>
        <Field label="Result">
          <StyledSelect ariaLabel="Result" value={form.result} onChange={(v) => set('result', v)} options={WIR_RESULTS.map((r) => ({ value: r, label: resultLabel(r) }))} />
        </Field>
        <Field label="Claimable">
          <label className="flex items-center gap-2 mt-1.5 text-[12px] cursor-pointer" style={{ color: COL.text }}>
            <input type="checkbox" checked={form.claimable !== false} onChange={(e) => set('claimable', e.target.checked)} />
            Billable for payment
          </label>
          <div className="text-[10px] mt-1" style={{ color: COL.textDim }}>Uncheck for approved inspections that don't translate to a billable quantity.</div>
        </Field>
        <div className="col-span-2">
          <Field label="Remarks">
            <textarea rows={3} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} style={{ ...fieldStyle, resize: 'vertical' }} placeholder="Inspection notes…" />
          </Field>
        </div>
        {error && <div className="col-span-2 text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function stripNulls(obj) {
  if (!obj) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v ?? '';
  return out;
}
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
