import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { CaptureSheet } from './CaptureSheet.jsx';
import { getCurrentProjectId, setCurrentProjectId } from '../../lib/currentProject.js';

const io = vi.hoisted(() => ({
  listWirs: vi.fn(),
  uploadAttachment: vi.fn(),
}));

vi.mock('../../api/wirs.js', () => ({ listWirs: (...args) => io.listWirs(...args) }));
vi.mock('../../lib/attachments.js', () => ({ uploadAttachment: (...args) => io.uploadAttachment(...args) }));
vi.mock('../../lib/project.jsx', () => ({
  useProject: () => ({ project: { name: 'Displayed project', code: 'DISPLAY' } }),
}));

const A = { id: 'wir-a', wir_number: 'WIR-A', location: 'Zone A', inspection_type: 'Pour A' };
const B = { id: 'wir-b', wir_number: 'WIR-B', location: 'Zone B', inspection_type: 'Pour B' };
const ORIGINAL_PROJECT_ID = getCurrentProjectId();

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function renderSheet(props = {}) {
  render(<CaptureSheet open onClose={() => {}} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /work progress/i }));
  return document.querySelector('[data-context-wir]');
}

beforeEach(() => {
  setCurrentProjectId('project-a');
  io.listWirs.mockReset();
  io.uploadAttachment.mockReset();
  io.uploadAttachment.mockResolvedValue({ id: 'attachment-1' });
});

afterEach(() => {
  expect(io.uploadAttachment).not.toHaveBeenCalled();
  cleanup();
  setCurrentProjectId(ORIGINAL_PROJECT_ID);
});

describe('MOB-M1 Capture WIR read-state truth', () => {
  it('renders a distinct pending state tied to the exact project and makes no write', async () => {
    const pending = deferred();
    io.listWirs.mockReturnValue(pending.promise);

    const select = renderSheet();

    expect(await screen.findByText('Loading inspections…')).toBeTruthy();
    expect(select.disabled).toBe(true);
    expect(screen.queryByText('No inspections found for this project.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(io.listWirs).toHaveBeenCalledWith('project-a');
    expect(io.uploadAttachment).not.toHaveBeenCalled();
  });

  it('keeps successful records selectable and preserves existing action availability', async () => {
    io.listWirs.mockResolvedValue([A]);

    const select = renderSheet();

    await waitFor(() => expect(select.value).toBe(A.id));
    expect(screen.getByRole('option', { name: A.wir_number })).toBeTruthy();
    expect(screen.getByRole('button', { name: /add evidence/i }).disabled).toBe(false);
    expect(screen.queryByText('No inspections found for this project.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders successful [] as true empty rather than loading or error', async () => {
    io.listWirs.mockResolvedValue([]);

    const select = renderSheet();

    expect(await screen.findByText('No inspections found for this project.')).toBeTruthy();
    expect(select.disabled).toBe(true);
    expect(screen.queryByText('Loading inspections…')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /add evidence/i }).disabled).toBe(true);
  });

  it('renders a rejected read as truthful English error, never empty, then retries only the read', async () => {
    io.listWirs
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce([A]);

    const select = renderSheet();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Couldn’t load inspections.');
    expect(alert.textContent).toContain('Check your connection and try again.');
    expect(screen.queryByText('No inspections found for this project.')).toBeNull();
    expect(screen.queryByText(/0 records|no WIRs/i)).toBeNull();
    expect(select.value).toBe('');
    expect(screen.getByRole('button', { name: /add evidence/i }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(select.value).toBe(A.id));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(io.listWirs).toHaveBeenNthCalledWith(1, 'project-a');
    expect(io.listWirs).toHaveBeenNthCalledWith(2, 'project-a');
    expect(io.uploadAttachment).not.toHaveBeenCalled();
  });

  it('renders a semantically equivalent Arabic error and retry', async () => {
    io.listWirs.mockRejectedValue(new Error('source unavailable'));

    renderSheet({ lang: 'ar' });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('تعذّر تحميل طلبات الفحص.');
    expect(alert.textContent).toContain('تحقق من اتصالك وحاول مرة أخرى.');
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeTruthy();
    expect(screen.queryByText('لا توجد طلبات فحص لهذا المشروع.')).toBeNull();
  });

  it('clears A immediately and never presents A records or linked fallback as B after B errors', async () => {
    io.listWirs.mockImplementation((projectId) => (
      projectId === 'project-a' ? Promise.resolve([A]) : Promise.reject(new Error('B unavailable'))
    ));

    const select = renderSheet({ linkedWir: A });
    await waitFor(() => expect(select.value).toBe(A.id));

    act(() => setCurrentProjectId('project-b'));

    expect(select.value).toBe('');
    expect(document.querySelector('[data-context-field="zone"]').value).toBe('');
    expect(document.querySelector('[data-context-field="activity"]').value).toBe('');
    expect(screen.queryByRole('option', { name: A.wir_number })).toBeNull();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(A.wir_number)).toBeNull();
    expect(document.querySelector('[data-context-field="zone"]').value).toBe('');
    expect(document.querySelector('[data-context-field="activity"]').value).toBe('');
    expect(io.listWirs).toHaveBeenLastCalledWith('project-b');
    expect(io.uploadAttachment).not.toHaveBeenCalled();
  });

  it('ignores a late A result after switching to B and keeps B records selected', async () => {
    const pendingA = deferred();
    const pendingB = deferred();
    io.listWirs.mockImplementation((projectId) => (
      projectId === 'project-a' ? pendingA.promise : pendingB.promise
    ));

    const select = renderSheet({ linkedWir: A });
    await waitFor(() => expect(io.listWirs).toHaveBeenCalledWith('project-a'));
    act(() => setCurrentProjectId('project-b'));
    await waitFor(() => expect(io.listWirs).toHaveBeenCalledWith('project-b'));

    await act(async () => pendingB.resolve([B]));
    await waitFor(() => expect(select.value).toBe(B.id));
    expect(document.querySelector('[data-context-field="zone"]').value).toBe(B.location);
    expect(document.querySelector('[data-context-field="activity"]').value).toBe(B.inspection_type);
    await act(async () => pendingA.resolve([A]));

    expect(select.value).toBe(B.id);
    expect(screen.getByRole('option', { name: B.wir_number })).toBeTruthy();
    expect(screen.queryByRole('option', { name: A.wir_number })).toBeNull();
  });

  it('does not carry A empty truth into a pending B request', async () => {
    const pendingB = deferred();
    io.listWirs.mockImplementation((projectId) => (
      projectId === 'project-a' ? Promise.resolve([]) : pendingB.promise
    ));

    renderSheet();
    expect(await screen.findByText('No inspections found for this project.')).toBeTruthy();

    act(() => setCurrentProjectId('project-b'));

    expect(screen.queryByText('No inspections found for this project.')).toBeNull();
    expect(screen.getByText('Loading inspections…')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not carry A error into pending B and replaces it with successful B records', async () => {
    const pendingB = deferred();
    io.listWirs.mockImplementation((projectId) => (
      projectId === 'project-a' ? Promise.reject(new Error('A unavailable')) : pendingB.promise
    ));

    const select = renderSheet();
    expect(await screen.findByRole('alert')).toBeTruthy();

    act(() => setCurrentProjectId('project-b'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Loading inspections…')).toBeTruthy();

    await act(async () => pendingB.resolve([B]));
    await waitFor(() => expect(select.value).toBe(B.id));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not revive a stale linked A when B successfully returns empty', async () => {
    const pendingB = deferred();
    io.listWirs.mockImplementation((projectId) => (
      projectId === 'project-a' ? Promise.resolve([A]) : pendingB.promise
    ));

    const select = renderSheet({ linkedWir: A });
    await waitFor(() => expect(select.value).toBe(A.id));

    act(() => setCurrentProjectId('project-b'));
    expect(select.value).toBe('');
    expect(document.querySelector('[data-context-field="zone"]').value).toBe('');
    expect(document.querySelector('[data-context-field="activity"]').value).toBe('');

    await act(async () => pendingB.resolve([]));
    expect(await screen.findByText('No inspections found for this project.')).toBeTruthy();
    expect(select.value).toBe('');
    expect(screen.queryByText(A.wir_number)).toBeNull();
    expect(document.querySelector('[data-context-field="zone"]').value).toBe('');
    expect(document.querySelector('[data-context-field="activity"]').value).toBe('');
  });

  it('ignores a late A rejection after B records have loaded', async () => {
    const pendingA = deferred();
    io.listWirs.mockImplementation((projectId) => (
      projectId === 'project-a' ? pendingA.promise : Promise.resolve([B])
    ));

    const select = renderSheet({ linkedWir: A });
    await waitFor(() => expect(io.listWirs).toHaveBeenCalledWith('project-a'));
    act(() => setCurrentProjectId('project-b'));
    await waitFor(() => expect(select.value).toBe(B.id));

    await act(async () => pendingA.reject(new Error('late A failure')));

    expect(select.value).toBe(B.id);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('[data-context-field="zone"]').value).toBe(B.location);
  });

  it('discards a pending request when closed and opens with the latest canonical project', async () => {
    const pendingA = deferred();
    io.listWirs.mockImplementation((projectId) => (
      projectId === 'project-a' ? pendingA.promise : Promise.resolve([B])
    ));
    const props = { onClose: () => {}, linkedWir: A };
    const { rerender } = render(<CaptureSheet open {...props} />);
    await waitFor(() => expect(io.listWirs).toHaveBeenCalledWith('project-a'));

    rerender(<CaptureSheet open={false} {...props} />);
    act(() => setCurrentProjectId('project-b'));
    rerender(<CaptureSheet open {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /work progress/i }));
    const select = document.querySelector('[data-context-wir]');
    await waitFor(() => expect(select.value).toBe(B.id));

    await act(async () => pendingA.resolve([A]));
    expect(select.value).toBe(B.id);
    expect(screen.queryByRole('option', { name: A.wir_number })).toBeNull();
    expect(io.listWirs).toHaveBeenLastCalledWith('project-b');
  });

  it('never commits stale A context fields when reopening directly into current project B', async () => {
    const pendingB = deferred();
    io.listWirs.mockImplementation((projectId) => (
      projectId === 'project-a' ? Promise.resolve([A]) : pendingB.promise
    ));
    const snapshots = [];
    function ObservedSheet({ open }) {
      useLayoutEffect(() => {
        snapshots.push({
          open,
          projectId: getCurrentProjectId(),
          zone: document.querySelector('[data-context-field="zone"]')?.value || '',
          activity: document.querySelector('[data-context-field="activity"]')?.value || '',
        });
      }, [open]);
      return <CaptureSheet open={open} onClose={() => {}} linkedWir={A} />;
    }

    const view = render(<ObservedSheet open />);
    fireEvent.click(screen.getByRole('button', { name: /work progress/i }));
    await waitFor(() => expect(document.querySelector('[data-context-wir]').value).toBe(A.id));
    view.rerender(<ObservedSheet open={false} />);
    act(() => setCurrentProjectId('project-b'));
    view.rerender(<ObservedSheet open />);

    const firstB = snapshots.find((snapshot) => snapshot.open && snapshot.projectId === 'project-b');
    expect(firstB).toBeTruthy();
    expect(firstB.zone).toBe('');
    expect(firstB.activity).toBe('');
  });

  it('gates stale A context from the first reopened B review frame', async () => {
    const pendingB = deferred();
    io.listWirs.mockImplementation((projectId) => (
      projectId === 'project-a' ? Promise.resolve([A]) : pendingB.promise
    ));
    const snapshots = [];
    function ObservedSheet({ open }) {
      useLayoutEffect(() => {
        snapshots.push({ open, projectId: getCurrentProjectId(), text: document.body.textContent });
      }, [open]);
      return <CaptureSheet open={open} onClose={() => {}} linkedWir={A} />;
    }

    const view = render(<ObservedSheet open />);
    fireEvent.click(screen.getByRole('button', { name: /work progress/i }));
    await waitFor(() => expect(document.querySelector('[data-context-wir]').value).toBe(A.id));
    fireEvent.click(screen.getByRole('button', { name: /add evidence/i }));
    const photo = new File(['image'], 'review.jpg', { type: 'image/jpeg', lastModified: 3 });
    fireEvent.change(document.querySelector('[data-library-input]'), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.getByRole('heading', { name: /files to upload/i })).toBeTruthy();

    view.rerender(<ObservedSheet open={false} />);
    act(() => setCurrentProjectId('project-b'));
    view.rerender(<ObservedSheet open />);

    const firstB = snapshots.find((snapshot) => snapshot.open && snapshot.projectId === 'project-b');
    expect(firstB).toBeTruthy();
    expect(firstB.text).not.toContain(A.location);
    expect(firstB.text).not.toContain(A.inspection_type);
    expect(firstB.text).not.toContain(A.wir_number);
  });
});
