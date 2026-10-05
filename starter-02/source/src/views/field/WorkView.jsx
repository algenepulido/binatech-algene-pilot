// ============================================================
// WorkView — frame B of the approved Field Mode Target: "Grouped by WIR state ·
// no separate inspection object."
//
// The design merges assigned inspections into the WIR lifecycle, so this is
// three state groups on one fill surface each — not a row of filter pills over
// a flat list. A group with nothing in it is omitted rather than drawn empty.
//
// Buckets are derived from `result`, which is the only lifecycle field WIRs
// actually carry. There is no assignment model and no due date on a WIR, so
// there is no "assigned to me" bucket and no Overdue state: the design's
// Overdue chip needs a due date that does not exist yet.
//
// MOB-UI1.1: with the desktop module-tree drawer gone below 1024, the existing
// NCRs and Snagging destinations are reached from here — one "Quality records"
// surface of rows, shown only for roles canView already allows. Navigation
// only: no new route, no new permission logic.
// ============================================================
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Loader2, AlertOctagon, Flag } from 'lucide-react';
import { canView } from '../../lib/permissions.js';
import { listWirs } from '../../api/wirs.js';
import { getCurrentProjectId } from '../../lib/currentProject.js';
import { FIELD, MONO } from '../../lib/fieldTokens.js';
import { Surface, Rule, Eyebrow } from './surface.jsx';

const isReturned = (w) => /reject/i.test(String(w.result || ''));
const isApproved = (w) => /approv/i.test(String(w.result || ''));

export function WorkView({ t = {}, lang = 'en', role = 'admin', onNavigate, onOpenWir }) {
  const ar = lang === 'ar';
  const [read, setRead] = useState({ status: 'loading', rows: [], retrying: false });
  const generation = useRef(0);
  const inFlight = useRef(false);

  const readCurrentWork = useCallback((retry = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const current = ++generation.current;
    const projectId = getCurrentProjectId();
    const isCurrent = () => current === generation.current && projectId === getCurrentProjectId();
    if (retry) setRead((previous) => previous.status === 'error' ? { ...previous, retrying: true } : previous);
    else setRead({ status: 'loading', rows: [], retrying: false });

    listWirs(projectId).then(
      (rows) => {
        if (!isCurrent()) return;
        if (!Array.isArray(rows)) throw new Error('Invalid Work read result');
        setRead({ status: rows.length > 0 ? 'records' : 'empty', rows, retrying: false });
      },
      () => {
        if (isCurrent()) setRead({ status: 'error', rows: [], retrying: false });
      },
    ).catch(() => {
      if (isCurrent()) setRead({ status: 'error', rows: [], retrying: false });
    }).finally(() => {
      if (current === generation.current) inFlight.current = false;
    });
  }, []);

  useEffect(() => {
    readCurrentWork();
    return () => {
      generation.current += 1;
      inFlight.current = false;
    };
  }, [readCurrentWork]);

  const groups = useMemo(() => ([
    { key: 'action', label: t.fmNeedsAction || 'Needs your action', tone: FIELD.fail, rows: read.rows.filter(isReturned) },
    { key: 'awaiting', label: t.fmAwaiting || 'Awaiting inspection', tone: FIELD.mute, rows: read.rows.filter((w) => !isReturned(w) && !isApproved(w)) },
    { key: 'approved', label: t.fmApproved || 'Approved', tone: FIELD.mute, rows: read.rows.filter(isApproved) },
  ]).filter((g) => g.rows.length > 0), [read.rows, t]);
  const records = [
    { id: 'ncrs', label: t.ncrs || 'NCRs', icon: AlertOctagon },
    { id: 'snagging', label: t.snagging || 'Snagging', icon: Flag },
  ].filter((r) => canView(role, r.id));

  return (
    <div className="flex-1 flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'} style={{ background: FIELD.page, color: FIELD.ink }}>
      <div className="flex-none" style={{ background: FIELD.surface, padding: '2px 20px 14px' }}>
        <div className="flex items-center" style={{ minHeight: 44 }}>
          <h1 style={{ fontSize: 27, fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>{t.workTitle || 'Work'}</h1>
        </div>
      </div>
      <div className="flex-none" style={{ height: 1, background: FIELD.hair }} />

      <div data-work-read-state={read.status} aria-live="polite"
        className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '22px 20px 0' }}>
        {read.status === 'loading' ? (
          <div className="flex items-center gap-2" style={{ minHeight: 44, fontSize: 15, color: FIELD.mute }}>
            <Loader2 size={16} className="animate-spin" /> {t.loading || 'Loading…'}
          </div>
        ) : read.status === 'error' ? (
          <div role="alert" aria-busy={read.retrying ? 'true' : 'false'} style={{ paddingTop: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: FIELD.ink }}>
              {t.workReadError || 'Couldn’t load work.'}
            </div>
            <div style={{ marginTop: 4, fontSize: 13.5, color: FIELD.mute }}>
              {t.workReadErrorHint || 'Check your connection and try again.'}
            </div>
            <button type="button" onClick={() => readCurrentWork(true)} disabled={read.retrying}
              style={{ minHeight: 48, marginTop: 12, padding: '0 16px', borderRadius: 8, background: FIELD.ink, color: FIELD.surface, fontSize: 14, fontWeight: 600 }}>
              {t.tryAgain || 'Try again'}
            </button>
          </div>
        ) : read.status === 'empty' ? (
          <div style={{ fontSize: 15, color: FIELD.mute, paddingTop: 8 }}>
            {t.fmNoWorkYet || 'No work on this project yet.'}
          </div>
        ) : groups.map((g) => (
          <div key={g.key} data-group={g.key} style={{ marginBottom: 22 }}>
            <Eyebrow tone={g.tone}>{g.label} · {g.rows.length}</Eyebrow>
            <Surface>
              {g.rows.map((w, i) => (
                <div key={w.id}>
                  {i > 0 && <Rule />}
                  <button onClick={() => onOpenWir?.(w)} className="w-full text-start flex items-center gap-3"
                    style={{ padding: '14px 17px', minHeight: 72, borderRadius: 0, background: 'transparent' }}>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate"
                        style={{ fontSize: 15.5, fontWeight: g.key === 'action' ? 600 : 500, lineHeight: 1.3, color: g.key === 'action' ? FIELD.ink : FIELD.inkSoft }}>
                        {[w.inspection_type, w.location].filter(Boolean).join(' — ') || w.wir_number}
                      </span>
                      <span className="block truncate" style={{ fontFamily: MONO, fontSize: 12, color: FIELD.mute, marginTop: 3 }}>
                        {w.wir_number}
                      </span>
                    </span>
                    {/* State reads as shape plus text, never hue alone. */}
                    {g.key === 'action' && (
                      <span className="flex-none" style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: FIELD.fail }}>
                        {t.fmReturned || 'Returned'}
                      </span>
                    )}
                    {g.key === 'awaiting' && (
                      <span aria-hidden="true" className="flex-none" style={{ width: 7, height: 7, borderRadius: 4, background: FIELD.ink }} />
                    )}
                    {g.key === 'approved' && (
                      <span className="flex-none" style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: FIELD.certified }}>
                        {t.fmCertified || 'Approved'}
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </Surface>
          </div>
        ))}
        {records.length > 0 && (
          <div data-quality-records style={{ marginBottom: 22 }}>
            <Eyebrow>{t.fmQualityRecords || 'Quality records'}</Eyebrow>
            <Surface>
              {records.map((r, i) => { const Icon = r.icon; return (
                <div key={r.id}>
                  {i > 0 && <Rule inset={51} />}
                  <button type="button" onClick={() => onNavigate?.(r.id)} className="w-full text-start flex items-center gap-3.5"
                    style={{ minHeight: 54, padding: '0 17px', borderRadius: 0, background: 'transparent' }}>
                    <Icon size={19} className="flex-none" style={{ color: FIELD.ink }} />
                    <span className="flex-1 truncate" style={{ fontSize: 15.5, fontWeight: 500 }}>{r.label}</span>
                  </button>
                </div>
              ); })}
            </Surface>
          </div>
        )}
      </div>
    </div>
  );
}
