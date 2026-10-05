// ============================================================
// FieldHome — frame A of the approved Field Mode Target.
//
// The screen answers one question before anything else: what needs me. Three
// fill surfaces and one hairline replace every border, and no surface nests
// inside another.
//
// WHAT THE DESIGN DRAWS THAT THIS DELIBERATELY OMITS, per its own §13:
//   · the sync foot line ("2 items on this device · waiting to sync") — the
//     offline queue is Planned. The design says Home ships without it.
//   · the readiness blocker row ("Pour card photo missing / Add photo") — the
//     readiness rule service is Planned. Without it Home simply has fewer
//     items, which is exactly what §13 prescribes.
//   · a working project chevron — project switching is Planned, so the strip
//     shows the project and the chevron is inert rather than a dead control.
//   · the "Overdue" state — WIRs carry `inspection_date`, not a due date.
//     Deriving overdue from it would invent product behaviour.
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { listWirs } from '../../api/wirs.js';
import { FIELD, MONO } from '../../lib/fieldTokens.js';
import { Surface, Rule, Eyebrow } from './surface.jsx';
import { fieldTaskCatalog, validQuickActionKeys } from './fieldTaskCatalog.js';

function greetingKey(hour) {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function FieldHome({ t = {}, lang = 'en', userName, role = 'Admin', permissionRole = role, onNavigate, onCapture, onOpenWir, quickActionKeys, tablet = false }) {
  const ar = lang === 'ar';
  const Chevron = ar ? ChevronLeft : ChevronRight;
  const [wirs, setWirs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listWirs()
      .then((r) => { if (alive) setWirs(r || []); })
      .catch(() => { if (alive) setWirs([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // "Needs your action" is returned work: the inspector rejected it and it is
  // back with this person. That is the one bucket the data genuinely supports.
  const needsAction = useMemo(() => wirs.filter((w) => /reject/i.test(String(w.result || ''))), [wirs]);
  const top = needsAction.slice(0, 3);

  const part = greetingKey(new Date().getHours());
  const greet = { morning: t.fmGreetMorning || 'Good morning',
    afternoon: t.fmGreetAfternoon || 'Good afternoon',
    evening: t.fmGreetEvening || 'Good evening' }[part];


  const catalogue = fieldTaskCatalog({ t, role: permissionRole, onNavigate, onCapture });
  const selected = validQuickActionKeys(quickActionKeys, catalogue);
  const actions = selected.map((key) => catalogue.find((task) => task.key === key)).filter(Boolean);

  return (
    <div className="flex-1 flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'} style={{ background: FIELD.page, color: FIELD.ink }}>

      {/* NO project strip here. The app Header already renders the project and
          a WORKING ProjectSwitcher at every width, so a second project line
          would be duplicated chrome — and §13's "project switching is Planned"
          is stale for this repo, which is exactly the drift open decision 05
          predicts ("the boundary between accepted-local and live will move").
          The design's intent — project binding visible at the switch moment —
          is already satisfied by the Header. Only the role, which the Header
          does not show, is carried here. */}
      <div className="flex-none" style={{ height: 1, background: FIELD.hair }} />

      <div data-field-home-grid className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: tablet ? 32 : '18px 20px 0', display: tablet ? 'grid' : 'flex', flexDirection: tablet ? undefined : 'column', gridTemplateColumns: tablet ? '1.5fr 1fr' : undefined, gap: tablet ? 32 : undefined, alignItems: tablet ? 'start' : undefined }}>
        <section data-field-workload>
        <div data-field-identity style={{ fontSize: 15, color: FIELD.mute, marginBottom: 6 }}>
          {userName ? `${greet}, ${userName}` : greet}{role ? ` · ${role}` : ''}
        </div>

        {loading ? (
          <div className="flex items-center gap-2" style={{ minHeight: 44, fontSize: 15, color: FIELD.mute }}>
            <Loader2 size={16} className="animate-spin" /> {t.loading || 'Loading…'}
          </div>
        ) : top.length === 0 ? (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2, margin: '0 0 8px' }}>
              {t.fmNothingNeedsYou || 'Nothing needs you right now'}
            </h1>
            <p style={{ fontSize: 15, color: FIELD.mute, margin: '0 0 15px' }}>
              {t.fmNothingReturned || 'No work has been returned to you on this project.'}
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2, margin: '0 0 15px' }}>
              {top.length === 1
                ? (t.fmNeedAttention1 || '1 item needs your attention')
                : (t.fmNeedAttention || '{n} items need your attention').replace('{n}', top.length)}
            </h1>
            <Surface>
              {top.map((w, i) => (
                <div key={w.id}>
                  {i > 0 && <Rule />}
                  <button onClick={() => onOpenWir?.(w)} className="w-full text-start flex items-center gap-3"
                    style={{ padding: '10px 17px', minHeight: 62, borderRadius: 0, background: 'transparent' }}>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate" style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>
                        {[w.inspection_type, w.location].filter(Boolean).join(' — ') || w.wir_number}
                      </span>
                      <span className="block truncate" style={{ fontSize: 13.5, color: FIELD.mute, marginTop: 3 }}>
                        {t.fmReturnedToYou || 'Returned — needs your action'}
                      </span>
                    </span>
                    <span className="flex-none" style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: FIELD.fail }}>
                      {t.fmReturned || 'Returned'}
                    </span>
                  </button>
                </div>
              ))}
            </Surface>
          </>
        )}

        <button onClick={() => onNavigate?.('work')} className="flex items-center gap-2 text-start"
          style={{ minHeight: 48, marginTop: 2, fontSize: 14.5, fontWeight: 500, borderRadius: 0, background: 'transparent' }}>
          <span>{t.fmViewAllWork || 'View all work'}</span>
          <Chevron size={16} />
        </button>
        </section>

        <section data-field-quick-actions>
        <Eyebrow style={{ marginTop: tablet ? 34 : 10, marginBottom: tablet ? 12 : 8 }}>{t.fmQuickActions || 'Quick actions'}</Eyebrow>
        <Surface style={{ marginBottom: 24 }}>
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <div key={a.key}>
                {i > 0 && <Rule inset={51} />}
                <button onClick={a.go} className="w-full text-start flex items-center gap-3.5"
                  style={{ minHeight: tablet ? 66 : 52, padding: tablet ? '0 20px' : '0 17px', borderRadius: 0, background: 'transparent' }}>
                  <Icon size={19} className="flex-none" style={{ color: FIELD.ink }} />
                  <span className="flex-1 truncate" style={{ fontSize: 15.5, fontWeight: 500 }}>{a.label}</span>
                </button>
              </div>
            );
          })}
        </Surface>
        </section>
      </div>
    </div>
  );
}
