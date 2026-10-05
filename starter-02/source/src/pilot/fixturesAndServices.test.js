// ============================================================
// PILOT STARTER — fixture and simulated-service smoke tests.
// Fixtures must stay synthetic and schema-shaped; the simulated submission
// service must keep its published contract. These do not test (or solve)
// the pilot assignment.
// ============================================================
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createFixtureStore, INVOICE_IDS, PROJECT_P, PROJECT_Q, PROJECT_E, PROGRESS_CONTEXTS, PROGRESS_REFERENCE_FIXTURES } from './fixtures/data.js';
import { SYNTHETIC_IMAGES } from './fixtures/images.js';
import { POLICY, INVOICE_RULES } from './adapters/policy.js';
import { createCallLog } from './adapters/callLog.js';
import { ACK_NOTE, FIELD_STATUS_LABELS, PROGRESS_REPORT_LIMITS, ProgressReportContractError, SimulatedSubmissionError } from './services/progressReportService.js';
import { createPilotRuntime } from './runtime.js';
import { MAX_EVIDENCE_IMAGE_BYTES, prepareEvidenceImage } from '../lib/evidenceImagePreparation.js';

describe('synthetic fixtures', () => {
  const store = createFixtureStore();

  it('every fixture row uses only existing schema fields', () => {
    for (const [table, rows] of Object.entries(store)) {
      const columns = POLICY.tables[table]?.columns;
      expect(columns, `${table} is in the policy`).toBeTruthy();
      for (const row of rows) expect(Object.keys(row).filter((k) => !columns.includes(k)), `${table} ${row.id ?? row.project_id}`).toEqual([]);
    }
  });

  it('invoices A, B and Z belong to Project P, differ clearly, and use the baseline vocabularies; Q is the decoy', () => {
    const byId = Object.fromEntries(store.invoices.map((r) => [r.id, r]));
    const [a, b, z, q] = [byId[INVOICE_IDS.A], byId[INVOICE_IDS.B], byId[INVOICE_IDS.Z], byId[INVOICE_IDS.Q]];
    expect([a, b, z].every((r) => r.project_id === PROJECT_P)).toBe(true);
    expect(q.project_id).toBe(PROJECT_Q);
    expect(a.invoice_number).not.toBe(b.invoice_number);
    expect(a.amount).not.toBe(b.amount);
    expect(z.amount).toBe(0);
    expect([z.issue_date, z.due_date, z.paid_date, z.element_guid, z.wir_number, z.ipc_ref]).toEqual([null, null, null, null, null, null]);
    for (const r of store.invoices) {
      expect(INVOICE_RULES.zatca_status).toContain(r.zatca_status);
      expect(INVOICE_RULES.payment_status).toContain(r.payment_status);
    }
    // A's values differ from every InvoiceForm default, so a correct pre-fill is distinguishable.
    expect(a.zatca_status).not.toBe('Awaiting IPC');
    expect(a.payment_status).not.toBe('Not Issued');
  });

  it('WIR results use the baseline lowercase vocabulary and invoice WIR numbers exist', () => {
    for (const w of store.wirs) expect(['pending', 'in_progress', 'approved', 'rejected']).toContain(w.result);
    const numbers = new Set(store.wirs.map((w) => w.wir_number));
    for (const inv of store.invoices) if (inv.wir_number) expect(numbers.has(inv.wir_number)).toBe(true);
  });

  it('Project E is a genuine empty case: no invoices, and BoQ rows that are headings only', () => {
    expect(store.invoices.filter((r) => r.project_id === PROJECT_E)).toEqual([]);
    const lines = store.boq_items.filter((r) => r.project_id === PROJECT_E);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((r) => !r.unit && !r.qty && !r.rate)).toBe(true);
  });

  it('identity and content are visibly synthetic', () => {
    const text = JSON.stringify(store);
    expect(text).toMatch(/synthetic/i);
    for (const p of store.projects) expect(`${p.name} ${p.client} ${p.contractor} ${p.consultant}`).toMatch(/Synthetic|Fictional/);
  });

  it('the three test images exist with the recorded bytes and SHA-256', () => {
    expect(SYNTHETIC_IMAGES).toHaveLength(3);
    for (const img of SYNTHETIC_IMAGES) {
      const bytes = fs.readFileSync(path.join(process.cwd(), 'public', 'pilot-fixtures', img.file));
      expect(bytes.length).toBe(img.bytes);
      expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(img.sha256);
      expect(bytes.length).toBeLessThanOrEqual(MAX_EVIDENCE_IMAGE_BYTES);
    }
  });

  it('progress contexts are the unassigned case plus supplied fixture references of Project P, without labels', () => {
    expect(PROGRESS_CONTEXTS.find((c) => c.key === 'unassigned').reference).toBeNull();
    for (const c of PROGRESS_CONTEXTS) {
      expect(c.projectId).toBe(PROJECT_P);
      if (c.reference) expect(Object.keys(c.reference).sort()).toEqual(['id', 'type']);
    }
    expect(PROGRESS_REFERENCE_FIXTURES.area.some((r) => r.projectId === PROJECT_Q)).toBe(true);
  });
});

describe('progress-report test service (approved payload)', () => {
  const runtime = () => createPilotRuntime({ storage: null });
  const jpeg = (size, type = 'image/jpeg', name = 'p.jpg') => { const b = new Uint8Array(size); b[0] = 0xff; b[1] = 0xd8; return new File([b], name, { type }); };
  const png = (size) => { const b = new Uint8Array(size); [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].forEach((v, i) => { b[i] = v; }); return new File([b], 'p.png', { type: 'image/png' }); };
  const report = (extra = {}) => ({ requestId: 'req-1', projectId: PROJECT_P, reference: null, description: 'Formwork to bay C complete', fieldStatus: 'in_progress', blockerNote: null, photos: [], ...extra });
  const send = (rt, r) => rt.progressReports.submitProgressReport(r);
  const rejects = (rt, r) => expect(send(rt, r)).rejects.toBeInstanceOf(ProgressReportContractError);

  it('uses the same per-photo cap as the existing image helper and the exact acknowledgement text', async () => {
    expect(PROGRESS_REPORT_LIMITS.maxPhotoBytes).toBe(MAX_EVIDENCE_IMAGE_BYTES);
    const res = await send(runtime(), report());
    expect(res).toMatchObject({ ok: true, simulated: true, requestId: 'req-1', projectId: PROJECT_P, reference: null });
    expect(res.receipt.note).toBe('Received by the test service. Not delivered to the project team.');
    expect(ACK_NOTE).toBe(res.receipt.note);
  });

  it('fieldStatus: exactly in_progress / blocked / reported_complete, labelled In progress / Blocked / Reported complete', async () => {
    expect(FIELD_STATUS_LABELS).toEqual({ in_progress: 'In progress', blocked: 'Blocked', reported_complete: 'Reported complete' });
    const rt = runtime();
    for (const fieldStatus of ['in_progress', 'blocked', 'reported_complete']) await expect(send(rt, report({ fieldStatus }))).resolves.toMatchObject({ ok: true });
    for (const fieldStatus of ['complete', 'Blocked', 'In progress', '', null, undefined]) await rejects(rt, report({ fieldStatus }));
  });

  it('reference: null, or a supplied fixture id of the same project for area / work_item / wir', async () => {
    const rt = runtime();
    for (const reference of [null, { type: 'area', id: 'SYN-AREA-P-BAY-C' }, { type: 'work_item', id: 'SYN-WI-0101' }, { type: 'wir', id: 'SYN-WIR-0003' }]) {
      await expect(send(rt, report({ reference }))).resolves.toMatchObject({ ok: true, reference });
    }
  });

  it('reference: rejects label-only, label added, unknown id, another project, null id, other types and a missing reference', async () => {
    const rt = runtime();
    await rejects(rt, report({ reference: { type: 'area', label: 'Bay C' } }));
    await rejects(rt, report({ reference: { type: 'area', id: 'SYN-AREA-P-BAY-C', label: 'Bay C' } }));
    await rejects(rt, report({ reference: { type: 'wir', id: 'WIR-0419' } }));
    await rejects(rt, report({ reference: { type: 'area', id: 'SYN-AREA-Q-01' } }));
    await rejects(rt, report({ reference: { type: 'wir', id: 'SYN-WIR-Q-0001' } }));
    await rejects(rt, report({ reference: { type: 'work_item', id: null } }));
    await rejects(rt, report({ reference: { type: 'drawing', id: 'SYN-WI-0101' } }));
    const { reference, ...missing } = report();
    await rejects(rt, missing);
  });

  it('requestId and projectId are required; projectId must be a synthetic project; requestId is correlation, not idempotency', async () => {
    const rt = runtime();
    await rejects(rt, report({ requestId: '' }));
    await rejects(rt, report({ requestId: undefined }));
    await rejects(rt, report({ projectId: 'some-real-project' }));
    const a = await send(rt, report({ requestId: 'same' }));
    const b = await send(rt, report({ requestId: 'same' }));
    expect(a.receipt.id).not.toBe(b.receipt.id);
    expect(rt.log.ofKind('submission').filter((e) => e.requestId === 'same' && e.outcome === 'success')).toHaveLength(2);
  });

  it('description must contain text after trimming and is kept exactly as entered', async () => {
    const rt = runtime();
    for (const description of ['', '   ', '\n\t', undefined]) await rejects(rt, report({ description }));
    const typed = '  Formwork done.  مستوى القالب تم فحصه  ';
    const r = report({ description: typed });
    await send(rt, r);
    expect(r.description).toBe(typed);
    expect(rt.log.ofKind('submission').at(-1).descriptionLength).toBe(typed.length);
  });

  it('blockerNote is optional for every status, including blocked', async () => {
    const rt = runtime();
    await expect(send(rt, report({ fieldStatus: 'blocked', blockerNote: null }))).resolves.toMatchObject({ ok: true });
    await expect(send(rt, report({ fieldStatus: 'blocked', blockerNote: 'Rebar inspection not booked' }))).resolves.toMatchObject({ ok: true });
    await expect(send(rt, report({ fieldStatus: 'reported_complete', blockerNote: 'Snag list to follow' }))).resolves.toMatchObject({ ok: true });
    const { blockerNote, ...without } = report({ fieldStatus: 'blocked' });
    await expect(send(rt, without)).resolves.toMatchObject({ ok: true });
    await rejects(rt, report({ blockerNote: 42 }));
  });

  it('photos: 0 and 3 accepted, 4 refused; 3,000,000 bytes accepted, 3,000,001 refused; JPEG/PNG by bytes', async () => {
    const rt = runtime();
    await expect(send(rt, report({ photos: [] }))).resolves.toMatchObject({ receipt: { photoCount: 0 } });
    await expect(send(rt, report({ photos: [jpeg(10), png(20), jpeg(30)] }))).resolves.toMatchObject({ receipt: { photoCount: 3 } });
    await rejects(rt, report({ photos: [jpeg(10), jpeg(10), jpeg(10), jpeg(10)] }));
    await expect(send(rt, report({ photos: [jpeg(3_000_000)] }))).resolves.toMatchObject({ ok: true });
    await rejects(rt, report({ photos: [jpeg(3_000_001)] }));
    await rejects(rt, report({ photos: [new File([new TextEncoder().encode('not an image at all')], 'x.jpg', { type: 'image/jpeg' })] }));
    await rejects(rt, report({ photos: [png(20).slice(0, 20, 'image/jpeg')] }));
    await rejects(rt, report({ photos: [{ name: 'p.jpg', bytes: 10 }] }));
  });

  it('accepts the actual prepareEvidenceImage output as-is (same object for an in-cap image, empty declared type allowed)', async () => {
    const bytes = fs.readFileSync(path.join(process.cwd(), 'public', 'pilot-fixtures', 'synthetic-progress-1.jpg'));
    const rt = runtime();
    for (const type of ['image/jpeg', '']) {
      const file = new File([bytes], 'synthetic-progress-1.jpg', { type });
      const prepared = await prepareEvidenceImage(file);
      expect(prepared.ok).toBe(true);
      expect(prepared.candidate).toBe(file);
      await expect(send(rt, report({ photos: [prepared.candidate] }))).resolves.toMatchObject({ receipt: { photoCount: 1 } });
    }
  });

  it('keeps the controlled success / failure / hold scenarios and echoes request identity', async () => {
    const rt = runtime();
    rt.scenarios.set('progressSubmission', 'failure');
    await expect(send(rt, report())).rejects.toMatchObject({ name: 'SimulatedSubmissionError', requestId: 'req-1', projectId: PROJECT_P });
    await expect(send(rt, report())).rejects.toBeInstanceOf(SimulatedSubmissionError);
    rt.scenarios.set('progressSubmission', 'hold');
    let done = false;
    const pending = send(rt, report({ requestId: 'held-1' })).then((r) => { done = true; return r; });
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    rt.log.release(rt.log.held()[0].id, 'success');
    expect((await pending).requestId).toBe('held-1');
  });
});
