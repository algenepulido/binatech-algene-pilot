import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useLayoutEffect } from 'react';
import { CaptureSheet } from './CaptureSheet.jsx';
import { T } from '../../i18n/translations.js';
import { getCurrentProjectId, setCurrentProjectId } from '../../lib/currentProject.js';

const WIR = { id: 'wir-2451', wir_number: 'WIR-2451-A', location: 'Zone C', inspection_type: 'Blinding pour' };
const OTHER_WIR = { id: 'wir-3000', wir_number: 'WIR-3000-B', location: 'Zone B', inspection_type: 'Rebar inspection' };
const listWirs = vi.fn();
const uploadAttachment = vi.fn();
const ORIGINAL_PROJECT_ID = getCurrentProjectId();

vi.mock('../../lib/project.jsx', () => ({ useProject: () => ({ project: { name: 'Synthetic Bridge Project', code: 'P2' } }) }));
vi.mock('../../api/wirs.js', () => ({ listWirs: (...args) => listWirs(...args) }));
vi.mock('../../lib/attachments.js', () => ({ uploadAttachment: (...args) => uploadAttachment(...args) }));

beforeEach(() => {
  setCurrentProjectId('project-a');
  listWirs.mockReset();
  listWirs.mockResolvedValue([WIR, OTHER_WIR]);
  uploadAttachment.mockReset();
  uploadAttachment.mockResolvedValue({ id: 'attachment-1' });
});

afterEach(() => {
  cleanup();
  setCurrentProjectId(ORIGINAL_PROJECT_ID);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function openContext(props = {}) {
  render(<CaptureSheet open onClose={() => {}} {...props} />);
  fireEvent.click(screen.getByText(props.t?.fmWorkProgress || 'Work progress'));
  await waitFor(() => expect(document.querySelector('[data-context-wir]').value).toBe(WIR.id));
}

function addPhoto(name = 'pour.jpg') {
  const photo = new File(['image'], name, { type: 'image/jpeg', lastModified: 1 });
  fireEvent.change(document.querySelector('[data-library-input]'), { target: { files: [photo] } });
  return photo;
}

describe('CaptureSheet — approved C → C2 → D → E field flow', () => {
  it('the entry asks one question and only exposes the two shipped tasks', async () => {
    render(<CaptureSheet open onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: /what are you recording\?/i })).toBeTruthy();
    expect(screen.getByText('Work progress')).toBeTruthy();
    expect(screen.getByText('Inspection request')).toBeTruthy();
    expect(screen.queryByText(/draft measurement/i)).toBeNull();
    await act(async () => {}); // flush the WIR inventory promise before teardown
  });

  it('C2 binds a real WIR and prefills location and activity without sensing location', async () => {
    await openContext();
    expect(screen.getByRole('heading', { name: /where and what/i })).toBeTruthy();
    expect(document.querySelector('[data-context-field="zone"]').value).toBe('Zone C');
    expect(document.querySelector('[data-context-field="activity"]').value).toBe('Blinding pour');
    expect(screen.getAllByText('WIR-2451-A')).toHaveLength(2);
    expect(screen.queryByText(/gps|current location/i)).toBeNull();
  });

  it('D exposes native camera and library pickers, then E reviews before upload', async () => {
    await openContext();
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    expect(document.querySelector('[data-camera-input]').getAttribute('capture')).toBe('environment');
    expect(screen.getByRole('button', { name: /done/i }).disabled).toBe(true);

    addPhoto();
    expect(screen.getByText(/1 photo\(s\) selected/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /done/i }));

    expect(screen.getByRole('heading', { name: /files to upload/i })).toBeTruthy();
    expect(screen.getByText(/certified value is unchanged/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /upload evidence/i })).toBeTruthy();
  });

  it('uploads with the existing WIR attachment path and reports success', async () => {
    await openContext();
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    const photo = new File(['image'], 'pour.jpg', { type: 'image/jpeg', lastModified: 1 });
    fireEvent.change(document.querySelector('[data-camera-input]'), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /upload evidence/i }));

    await screen.findByRole('heading', { name: /evidence uploaded/i });
    expect(document.body.textContent).not.toContain('Evidence saved');
    expect(uploadAttachment).toHaveBeenCalledWith({ recordType: 'wir', recordId: WIR.id, file: photo });
    expect(Object.keys(uploadAttachment.mock.calls[0][0]).sort()).toEqual(['file', 'recordId', 'recordType']);
    expect(screen.getByText(/uploaded and linked to WIR-2451-A/i)).toBeTruthy();
    expect(screen.getByText(/certified value is unchanged/i)).toBeTruthy();
  });

  it('labels zone, gridline and activity as local-only and omits them from the upload review', async () => {
    await openContext();
    fireEvent.change(document.querySelector('[data-context-field="zone"]'), { target: { value: 'ZONE-X' } });
    fireEvent.change(document.querySelector('[data-context-field="gridline"]'), { target: { value: 'GRID-Y' } });
    fireEvent.change(document.querySelector('[data-context-field="activity"]'), { target: { value: 'ACT-Z' } });
    expect(screen.getByText('Reference only. Zone, gridline and activity are not uploaded.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    addPhoto('truth.jpg');
    fireEvent.click(screen.getByRole('button', { name: /done/i }));

    expect(screen.getByRole('heading', { name: 'Files to upload' })).toBeTruthy();
    expect(screen.getByText(/reference edits are not saved/i)).toBeTruthy();
    expect(document.querySelector('[title="truth.jpg"]')).toBeTruthy();
    expect(screen.getByText(WIR.wir_number)).toBeTruthy();
    expect(document.body.textContent).not.toContain('ZONE-X');
    expect(document.body.textContent).not.toContain('GRID-Y');
    expect(document.body.textContent).not.toContain('ACT-Z');
    expect(document.body.textContent).not.toContain('Synthetic Bridge Project');
    expect(screen.queryByText(/this will be saved/i)).toBeNull();
    expect(screen.queryByLabelText(/note/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/captured at/i);
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it('keeps local edits out of the exact payload and uses the selected WIR identity', async () => {
    await openContext();
    fireEvent.change(document.querySelector('[data-context-wir]'), { target: { value: OTHER_WIR.id } });
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    const photo = addPhoto('after-edit.jpg');
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.change(document.querySelector('[data-context-field="zone"]'), { target: { value: 'ZONE-AFTER' } });
    fireEvent.change(document.querySelector('[data-context-field="gridline"]'), { target: { value: 'GRID-AFTER' } });
    fireEvent.change(document.querySelector('[data-context-field="activity"]'), { target: { value: 'ACT-AFTER' } });
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /upload evidence/i }));

    await screen.findByRole('heading', { name: /evidence uploaded/i });
    expect(uploadAttachment).toHaveBeenCalledTimes(1);
    expect(uploadAttachment).toHaveBeenCalledWith({ recordType: 'wir', recordId: OTHER_WIR.id, file: photo });
    expect(uploadAttachment.mock.calls[0][0]).not.toHaveProperty('projectId');
    expect(uploadAttachment.mock.calls[0][0]).not.toHaveProperty('zone');
    expect(uploadAttachment.mock.calls[0][0]).not.toHaveProperty('gridline');
    expect(uploadAttachment.mock.calls[0][0]).not.toHaveProperty('activity');
    expect(uploadAttachment.mock.calls[0][0]).not.toHaveProperty('note');
    expect(document.body.textContent).not.toMatch(/ZONE-AFTER|GRID-AFTER|ACT-AFTER/);
  });

  it('does not show success when the combined attachment operation rejects', async () => {
    uploadAttachment.mockRejectedValueOnce(new Error('attachment metadata insert failed'));
    await openContext();
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    addPhoto('failed.jpg');
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /upload evidence/i }));

    expect((await screen.findByRole('alert')).textContent).toContain('Attachment wasn’t completed for all files. Retry failed files.');
    expect(screen.getByRole('heading', { name: /files to upload/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /evidence uploaded/i })).toBeNull();
    expect(screen.queryByText(/uploaded and linked/i)).toBeNull();
  });

  it('uses equivalent Arabic local-only, review, action and success copy', async () => {
    await openContext({ t: T.ar, lang: 'ar' });
    expect(screen.getByText('للمرجع فقط. لن يتم رفع المنطقة أو المحور أو النشاط.')).toBeTruthy();
    fireEvent.change(document.querySelector('[data-context-field="zone"]'), { target: { value: 'AR-ZONE-X' } });
    fireEvent.change(document.querySelector('[data-context-field="gridline"]'), { target: { value: 'AR-GRID-Y' } });
    fireEvent.change(document.querySelector('[data-context-field="activity"]'), { target: { value: 'AR-ACT-Z' } });
    fireEvent.click(screen.getByRole('button', { name: T.ar.fmAddEvidence }));
    addPhoto('arabic.jpg');
    fireEvent.click(screen.getByRole('button', { name: T.ar.done }));

    expect(screen.getByRole('heading', { name: 'ملفات للرفع' })).toBeTruthy();
    expect(screen.getByText(/لا تُحفظ تعديلات الحقول المرجعية/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/AR-ZONE-X|AR-GRID-Y|AR-ACT-Z/);
    fireEvent.click(screen.getByRole('button', { name: 'رفع الأدلة' }));
    await screen.findByRole('heading', { name: 'تم رفع الأدلة' });
    expect(screen.getByText(/WIR-2451-A/).textContent).toContain('تم الرفع والربط');
  });

  it('does not let a late Project A upload label a switched Project B draft as successful', async () => {
    const pending = deferred();
    listWirs.mockImplementation((projectId) => Promise.resolve(projectId === 'project-a' ? [WIR] : [OTHER_WIR]));
    uploadAttachment.mockReturnValueOnce(pending.promise);
    await openContext();
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    const photo = addPhoto('pending-a.jpg');
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /upload evidence/i }));
    expect(screen.getByRole('button', { name: /back/i }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /cancel/i }).disabled).toBe(true);

    act(() => setCurrentProjectId('project-b'));
    await screen.findByRole('heading', { name: /what are you recording/i });
    await act(async () => pending.resolve({ id: 'attachment-a' }));

    expect(uploadAttachment).toHaveBeenCalledWith({ recordType: 'wir', recordId: WIR.id, file: photo });
    expect(screen.queryByRole('heading', { name: /evidence uploaded/i })).toBeNull();
    expect(screen.queryByText(/uploaded and linked to WIR-3000-B/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /work progress/i }));
    await waitFor(() => expect(document.querySelector('[data-context-wir]').value).toBe(OTHER_WIR.id));
  });

  it('does not let a deferred upload completion reopen stale success after close and reopen', async () => {
    const pending = deferred();
    uploadAttachment.mockReturnValueOnce(pending.promise);
    const view = render(<CaptureSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByText('Work progress'));
    await waitFor(() => expect(document.querySelector('[data-context-wir]').value).toBe(WIR.id));
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    addPhoto('closed.jpg');
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /upload evidence/i }));

    await act(async () => view.rerender(<CaptureSheet open={false} onClose={() => {}} />));
    await act(async () => view.rerender(<CaptureSheet open onClose={() => {}} />));
    await act(async () => pending.resolve({ id: 'attachment-a' }));

    expect(screen.getByRole('heading', { name: /what are you recording/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /evidence uploaded/i })).toBeNull();
  });

  it('does not paint a completed result on the first same-project reopen frame', async () => {
    const snapshots = [];
    function ObservedSheet({ open }) {
      useLayoutEffect(() => {
        snapshots.push({ open, text: document.body.textContent });
      }, [open]);
      return <CaptureSheet open={open} onClose={() => {}} />;
    }

    const view = render(<StrictMode><ObservedSheet open /></StrictMode>);
    fireEvent.click(screen.getByText('Work progress'));
    await waitFor(() => expect(document.querySelector('[data-context-wir]').value).toBe(WIR.id));
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    addPhoto('same-project.jpg');
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /upload evidence/i }));
    await screen.findByRole('heading', { name: /evidence uploaded/i });

    await act(async () => view.rerender(<StrictMode><ObservedSheet open={false} /></StrictMode>));
    snapshots.length = 0;
    await act(async () => view.rerender(<StrictMode><ObservedSheet open /></StrictMode>));

    const firstReopen = snapshots[0];
    expect(firstReopen.open).toBe(true);
    expect(firstReopen.text).not.toContain('Evidence uploaded');
    expect(firstReopen.text).not.toContain('Uploaded and linked');
  });

  it('does not paint Project A completion on the first Project B reopen frame', async () => {
    listWirs.mockImplementation((projectId) => Promise.resolve(projectId === 'project-a' ? [WIR] : [OTHER_WIR]));
    const snapshots = [];
    function ObservedSheet({ open }) {
      useLayoutEffect(() => {
        snapshots.push({ open, projectId: getCurrentProjectId(), text: document.body.textContent });
      }, [open]);
      return <CaptureSheet open={open} onClose={() => {}} />;
    }

    const view = render(<ObservedSheet open />);
    fireEvent.click(screen.getByText('Work progress'));
    await waitFor(() => expect(document.querySelector('[data-context-wir]').value).toBe(WIR.id));
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    addPhoto('project-a.jpg');
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /upload evidence/i }));
    await screen.findByRole('heading', { name: /evidence uploaded/i });

    await act(async () => view.rerender(<ObservedSheet open={false} />));
    await act(async () => setCurrentProjectId('project-b'));
    await act(async () => view.rerender(<ObservedSheet open />));

    const firstB = snapshots.at(-1);
    expect(firstB.open).toBe(true);
    expect(firstB.projectId).toBe('project-b');
    expect(firstB.text).not.toContain('Evidence uploaded');
    expect(firstB.text).not.toContain(WIR.wir_number);
  });

  it('does not paint a completed result when capture permission starts a new eligible session', async () => {
    const snapshots = [];
    function ObservedSheet({ canCapture }) {
      useLayoutEffect(() => {
        snapshots.push({ canCapture, text: document.body.textContent });
      }, [canCapture]);
      return <CaptureSheet open canCapture={canCapture} onClose={() => {}} />;
    }

    const view = render(<ObservedSheet canCapture />);
    fireEvent.click(screen.getByText('Work progress'));
    await waitFor(() => expect(document.querySelector('[data-context-wir]').value).toBe(WIR.id));
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    addPhoto('permission-session.jpg');
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /upload evidence/i }));
    await screen.findByRole('heading', { name: /evidence uploaded/i });

    await act(async () => view.rerender(<ObservedSheet canCapture={false} />));
    snapshots.length = 0;
    await act(async () => view.rerender(<ObservedSheet canCapture />));

    expect(snapshots[0].canCapture).toBe(true);
    expect(snapshots[0].text).not.toContain('Evidence uploaded');
    expect(snapshots[0].text).not.toContain('Uploaded and linked');
    expect(snapshots[0].text).toContain('What are you recording?');
  });

  it('locks a partial batch to its original WIR and retries only incomplete attachments', async () => {
    uploadAttachment
      .mockResolvedValueOnce({ id: 'attachment-first' })
      .mockRejectedValueOnce(new Error('metadata failed'))
      .mockResolvedValueOnce({ id: 'attachment-second' });
    await openContext();
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    const first = addPhoto('first.jpg');
    const second = new File(['image-2'], 'second.jpg', { type: 'image/jpeg', lastModified: 2 });
    fireEvent.change(document.querySelector('[data-library-input]'), { target: { files: [second] } });
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /upload evidence/i }));
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(document.querySelector('[data-context-wir]').disabled).toBe(true);
    expect(document.querySelector('[data-context-wir]').value).toBe(WIR.id);
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /upload evidence/i }));

    await screen.findByRole('heading', { name: /evidence uploaded/i });
    expect(uploadAttachment).toHaveBeenCalledTimes(3);
    expect(uploadAttachment).toHaveBeenNthCalledWith(1, { recordType: 'wir', recordId: WIR.id, file: first });
    expect(uploadAttachment).toHaveBeenNthCalledWith(2, { recordType: 'wir', recordId: WIR.id, file: second });
    expect(uploadAttachment).toHaveBeenNthCalledWith(3, { recordType: 'wir', recordId: WIR.id, file: second });
    expect(screen.getByText(/uploaded and linked to WIR-2451-A/i)).toBeTruthy();
  });

  it('never offers a certify, approve, or commercial mutation', async () => {
    await openContext();
    for (const banned of [/certify/i, /approve/i, /mark paid/i, /submit ipc/i]) {
      expect(screen.queryByRole('button', { name: banned })).toBeNull();
    }
  });

  it('fails closed when the role cannot add WIR evidence', () => {
    render(<CaptureSheet open canCapture={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('rejects an image larger than the existing 25 MB attachment limit', async () => {
    await openContext();
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    const oversized = new File(['x'], 'too-large.jpg', { type: 'image/jpeg', lastModified: 2 });
    Object.defineProperty(oversized, 'size', { value: 25 * 1024 * 1024 + 1 });
    fireEvent.change(document.querySelector('[data-library-input]'), { target: { files: [oversized] } });
    expect(screen.getByRole('alert').textContent).toMatch(/25 MB or smaller/i);
    expect(screen.getByRole('button', { name: /done/i }).disabled).toBe(true);
  });
});
