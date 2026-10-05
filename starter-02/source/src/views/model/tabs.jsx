import { useMemo } from 'react';
import { Activity, AlertOctagon, Box, ClipboardCheck, Eye, FileImage, FileText, Flag, FlaskConical, Layers, Upload } from 'lucide-react';
import { Empty, StatusPill } from '../../components/primitives.jsx';
import { CONTROLLED_DOCS, DOC_STATUS, DOC_TYPES } from '../../data/documents.js';
import { SNAG_ITEMS, SNAG_PRIORITY, SNAG_STATUS } from '../../data/quality.js';
import { fmt } from '../../lib/format.js';
import { COL } from '../../lib/theme.js';

export function PropertiesTab({ el, t }) {
  if (!el) return <div className="p-5 text-xs" style={{ color: COL.textMute }}>Select an element to see its properties.</div>;
  const dims = Array.isArray(el.size) && el.size.length ? el.size.join(' × ') + ' m' : null;
  const rows = [
    [t.elementId, el.id, true],
    [t.ifcGuid, el.guid, true],
    [t.type, el.type],
    [t.level, el.level],
    [t.discipline, el.discipline],
    [t.material, el.material],
    [t.dimensions, dims, true],
  ];
  return (
    <div className="p-5 space-y-3">
      {rows.map(([k, v, mono]) => {
        const empty = v == null || v === '';
        return (
          <div key={k} className="flex justify-between items-start gap-3 text-xs">
            <span className="flex-shrink-0" style={{ color: COL.textDim }}>{k}</span>
            <span className={`${mono && !empty ? 'mono text-[11px]' : ''} min-w-0 break-words`} style={{ color: empty ? COL.textMute : COL.text, textAlign: 'end' }}>{empty ? '—' : v}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DrawingsTab({ drawings }) {
  if (drawings.length === 0) return <Empty label="No drawings linked" />;
  return <div className="p-5 space-y-2">{drawings.map(d => (
    <div key={d.id + d.rev} className="p-3 rounded border" style={{ background: COL.surface, borderColor: COL.border }}>
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <div className="mono text-[11px] font-semibold" style={{ color: COL.accent }}>{d.id} <span style={{ color: COL.textMute }}>REV {d.rev}</span></div>
          <div className="text-[12px] font-medium mt-0.5">{d.title}</div>
        </div>
        <StatusPill status={d.status} />
      </div>
      <div className="flex items-center justify-between mono text-[10px]" style={{ color: COL.textDim }}>
        <span>{d.date} · {d.size}</span>
        <button className="text-blue-700 hover:underline flex items-center gap-1"><Eye size={9} /> Open</button>
      </div>
    </div>
  ))}</div>;
}

export function WIRsTab({ wirs }) {
  if (wirs.length === 0) return <Empty label="No WIRs linked" />;
  return <div className="p-5 space-y-2">{wirs.map(w => (
    <div key={w.id} className="p-3 rounded border" style={{ background: COL.surface, borderColor: COL.border }}>
      <div className="flex items-start justify-between mb-1.5">
        <div><div className="mono text-[11px] font-semibold" style={{ color: COL.accent }}>{w.id}</div><div className="text-[12px] font-medium mt-0.5">{w.type}</div></div>
        <StatusPill status={w.result} />
      </div>
      <div className="text-[11px] mb-1.5" style={{ color: COL.text }}>{w.remarks}</div>
      <div className="flex items-center gap-3 mono text-[10px]" style={{ color: COL.textDim }}>
        <span>{w.date}</span><span>{w.inspector}</span>
      </div>
    </div>
  ))}</div>;
}

export function QCTab({ qcs }) {
  if (qcs.length === 0) return <Empty label="No QC tests" />;
  return <div className="p-5 space-y-2">{qcs.map(q => (
    <div key={q.id} className="p-3 rounded border" style={{ background: COL.surface, borderColor: COL.border }}>
      <div className="flex items-start justify-between mb-1.5">
        <div><div className="mono text-[11px] font-semibold" style={{ color: COL.accent }}>{q.id}</div><div className="text-[12px] font-medium mt-0.5">{q.test}</div></div>
        <StatusPill status={q.result} />
      </div>
      <div className="flex justify-between text-[11px] mb-1"><span style={{ color: COL.textDim }}>Result</span><span className="mono font-semibold" style={{ color: q.result === 'Pass' ? '#16a34a' : '#d97706' }}>{q.value}</span></div>
      <div className="flex gap-3 mono text-[10px]" style={{ color: COL.textDim }}><span>{q.date}</span><span>Lab: {q.lab}</span></div>
    </div>
  ))}</div>;
}

export function NCRsTab({ ncrs }) {
  if (ncrs.length === 0) return <Empty label="Clean record. No NCRs raised." />;
  return <div className="p-5 space-y-2">{ncrs.map(n => (
    <div key={n.id} className="p-3 rounded border-l-4 border-y border-r" style={{ background: '#fef2f2', borderLeftColor: '#dc2626', borderColor: '#fecaca' }}>
      <div className="flex items-start justify-between mb-1.5">
        <div><div className="mono text-[11px] font-semibold" style={{ color: '#991b1b' }}>{n.id}</div><div className="text-[12px] font-medium mt-0.5">{n.severity} Severity</div></div>
        <StatusPill status={n.status} />
      </div>
      <div className="text-[11px] mb-2" style={{ color: COL.text }}>{n.desc}</div>
      <div className="flex gap-3 mono text-[10px]" style={{ color: COL.textDim }}><span>{n.date}</span><span>By: {n.raisedBy}</span></div>
    </div>
  ))}</div>;
}

export function QSTab({ boq, t }) {
  return (
    <div className="p-5">
      <div className="rounded border overflow-hidden" style={{ borderColor: COL.border }}>
        <div className="px-3 py-2.5 border-b" style={{ background: COL.bg, borderColor: COL.border }}>
          <div className="flex items-center justify-between">
            <div className="mono text-[11px] font-bold" style={{ color: COL.accent }}>{boq.code}</div>
            <span className="mono text-[10px]" style={{ color: COL.textDim }}>BoQ LINE</span>
          </div>
          <div className="text-[12px] mt-1">{boq.desc}</div>
        </div>
        <table className="w-full text-[11px] mono">
          <tbody>
            <tr className="border-b" style={{ borderColor: '#f0ede0' }}><td className="px-3 py-2" style={{ color: COL.textDim }}>{t.modelQuantity}</td><td className="px-3 py-2 text-right font-semibold">{boq.qty} {boq.unit}</td></tr>
            <tr className="border-b" style={{ borderColor: '#f0ede0' }}><td className="px-3 py-2" style={{ color: COL.textDim }}>{t.approvedQuantity}</td><td className="px-3 py-2 text-right font-semibold" style={{ color: boq.approved > 0 ? '#16a34a' : COL.textMute }}>{boq.approved} {boq.unit}</td></tr>
            <tr className="border-b" style={{ borderColor: '#f0ede0' }}><td className="px-3 py-2" style={{ color: COL.textDim }}>{t.unitRate}</td><td className="px-3 py-2 text-right font-semibold">SAR {fmt(boq.rate)}</td></tr>
            <tr className="border-b" style={{ borderColor: '#f0ede0' }}><td className="px-3 py-2" style={{ color: COL.textDim }}>{t.totalBoqValue}</td><td className="px-3 py-2 text-right font-semibold">SAR {fmt(boq.qty * boq.rate)}</td></tr>
            <tr className="border-b" style={{ borderColor: '#f0ede0', background: boq.approved > 0 ? '#f0fdf4' : COL.surface }}><td className="px-3 py-2" style={{ color: COL.textDim }}>{t.certifiedValue}</td><td className="px-3 py-2 text-right font-bold" style={{ color: '#16a34a' }}>SAR {fmt(boq.approved * boq.rate)}</td></tr>
            <tr style={{ background: boq.approved < boq.qty ? '#fef9c3' : COL.surface }}><td className="px-3 py-2 font-semibold" style={{ color: COL.textDim }}>{t.pendingCertification}</td><td className="px-3 py-2 text-right font-bold" style={{ color: boq.approved < boq.qty ? '#a16207' : '#16a34a' }}>SAR {fmt((boq.qty - boq.approved) * boq.rate)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TimelineTab({ wirs, qcs, ncrs, drawings, snags = [], docs = [] }) {
  // Build chronological event list across all linked (real) records
  const events = useMemo(() => {
    const list = [];
    drawings.forEach(d => list.push({ ts: d.date, type: 'drawing', icon: FileImage, color: '#2563eb', title: `${d.id} Rev ${d.rev}`, subtitle: d.title, status: d.status }));
    docs.forEach(d => list.push({ ts: d.date, type: 'document', icon: FileText, color: DOC_TYPES[d.type]?.color || '#475569', title: `${d.no} Rev ${d.rev}`, subtitle: d.title, status: DOC_STATUS[d.status]?.label || d.status }));
    wirs.forEach(w => list.push({ ts: w.date, type: 'wir', icon: ClipboardCheck, color: '#0891b2', title: `${w.id} · ${w.type}`, subtitle: w.remarks, status: w.result }));
    qcs.forEach(q => list.push({ ts: q.date, type: 'qc', icon: FlaskConical, color: '#7c3aed', title: `${q.id} · ${q.test}`, subtitle: `${q.value} · ${q.lab}`, status: q.result }));
    ncrs.forEach(n => list.push({ ts: n.date, type: 'ncr', icon: AlertOctagon, color: '#dc2626', title: `${n.id} · ${n.severity}`, subtitle: (n.desc || '').slice(0, 80), status: n.status }));
    snags.forEach(s => list.push({ ts: s.raisedDate, type: 'snag', icon: Flag, color: SNAG_PRIORITY[s.priority]?.color || '#d97706', title: `${s.id} · ${SNAG_PRIORITY[s.priority]?.label || ''}`, subtitle: s.title, status: SNAG_STATUS[s.status]?.label || s.status }));
    return list.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  }, [wirs, qcs, ncrs, drawings, snags, docs]);

  if (events.length === 0) return <Empty label="No timeline events yet" />;

  return (
    <div className="p-5">
      <div className="mono text-[9px] tracking-widest mb-3" style={{ color: COL.textDim }}>CHRONOLOGICAL EVENTS · {events.length}</div>
      <div className="relative pl-6">
        <div className="absolute left-2 top-1 bottom-1 w-px" style={{ background: COL.border }} />
        {events.map((e, i) => {
          const Icon = e.icon;
          return (
            <div key={i} className="relative pb-4">
              <div className="absolute -left-[18px] top-0.5 w-3 h-3 rounded-full border-2 flex items-center justify-center" style={{ background: COL.surface, borderColor: e.color }}>
                <div className="w-1 h-1 rounded-full" style={{ background: e.color }} />
              </div>
              <div className="rounded border p-2.5" style={{ background: COL.surface, borderColor: COL.border }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Icon size={11} style={{ color: e.color }} />
                    <span className="mono text-[10px] font-semibold uppercase" style={{ color: e.color }}>{e.type}</span>
                  </div>
                  <span className="mono text-[10px]" style={{ color: COL.textDim }}>{e.ts}</span>
                </div>
                <div className="mono text-[11px] font-semibold" style={{ color: COL.text }}>{e.title}</div>
                <div className="text-[11px] mt-0.5" style={{ color: COL.textDim }}>{e.subtitle}</div>
                <div className="mt-1.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold mono" style={{ color: e.color, background: e.color + '15' }}>{e.status}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PhotosTab({ el }) {
  // Placeholder inspection photos with captions
  const photos = [
    { caption: 'Pre-pour rebar inspection', date: '2026-04-02', shade: '#a8a29e', icon: ClipboardCheck },
    { caption: 'Concrete pour in progress',  date: '2026-04-05', shade: '#78716c', icon: Activity },
    { caption: 'Post-pour surface finish',   date: '2026-04-07', shade: '#57534e', icon: Eye },
    { caption: 'PT duct positioning',         date: '2026-04-12', shade: '#92400e', icon: Layers },
    { caption: 'Cube samples cast on site',   date: '2026-04-05', shade: '#0c4a6e', icon: FlaskConical },
    { caption: 'Formwork strike sequence',    date: '2026-04-14', shade: '#3f3f46', icon: Box }
  ];

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="mono text-[9px] tracking-widest" style={{ color: COL.textDim }}>INSPECTION PHOTOS · {photos.length}</div>
        <button className="mono text-[10px] flex items-center gap-1 hover:underline" style={{ color: COL.accent }}><Upload size={11} /> Upload</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {photos.map((p, i) => {
          const Icon = p.icon;
          return (
            <div key={i} className="rounded border overflow-hidden" style={{ borderColor: COL.border, background: COL.surface }}>
              <div className="aspect-square flex items-center justify-center relative" style={{ background: `linear-gradient(135deg, ${p.shade} 0%, ${p.shade}cc 100%)` }}>
                <Icon size={36} color="#ffffff" opacity={0.4} />
                <div className="absolute bottom-1 left-1 mono text-[8px] px-1 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}>{p.date}</div>
              </div>
              <div className="px-2 py-1.5 text-[10px]" style={{ color: COL.text }}>{p.caption}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 text-[10px] text-center" style={{ color: COL.textDim }}>
        All photos tagged to <span className="mono">{el.id}</span> · GUID <span className="mono">{el.guid}</span>
      </div>
    </div>
  );
}

export function SnagsTab({ snags = [] }) {
  if (snags.length === 0) return <Empty label="No snag items raised for this element" />;
  return (
    <div className="p-5 space-y-2">
      {snags.map(s => (
        <div key={s.id} className="p-3 rounded border" style={{ background: COL.surface, borderColor: COL.border, borderLeftWidth: 3, borderLeftColor: SNAG_PRIORITY[s.priority]?.color }}>
          <div className="flex items-start justify-between mb-1.5">
            <div>
              <div className="mono text-[11px] font-semibold" style={{ color: SNAG_PRIORITY[s.priority]?.color }}>{s.id}</div>
              <div className="text-[12px] font-medium mt-0.5">{s.title}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mono" style={{ color: SNAG_PRIORITY[s.priority]?.color, background: SNAG_PRIORITY[s.priority]?.bg }}>{SNAG_PRIORITY[s.priority]?.label.toUpperCase()}</span>
              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold mono" style={{ color: SNAG_STATUS[s.status]?.color, background: SNAG_STATUS[s.status]?.bg }}>{SNAG_STATUS[s.status]?.label}</span>
            </div>
          </div>
          <div className="text-[10.5px] mb-2" style={{ color: COL.textDim }}>{s.desc}</div>
          <div className="flex items-center justify-between mono text-[10px]" style={{ color: COL.textDim }}>
            <span>{s.assignee}</span>
            <span>Target: {s.targetDate}</span>
          </div>
          {(s.blocksHandover || s.blocksPayment) && (
            <div className="mt-2 flex gap-1">
              {s.blocksPayment && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ color: '#991b1b', background: '#fecaca' }}>BLOCKS PAYMENT</span>}
              {s.blocksHandover && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ color: '#991b1b', background: '#fecaca' }}>BLOCKS HANDOVER</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function DocsTab({ docs = [] }) {
  if (docs.length === 0) return <Empty label="No controlled documents linked" />;
  return (
    <div className="p-5 space-y-2">
      {docs.map(d => (
        <div key={d.id} className="p-3 rounded border" style={{ background: COL.surface, borderColor: COL.border }}>
          <div className="flex items-start justify-between mb-1.5">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold mono" style={{ color: DOC_TYPES[d.type]?.color, background: DOC_TYPES[d.type]?.bg }}>{DOC_TYPES[d.type]?.label}</span>
                <span className="mono text-[10px] font-semibold" style={{ color: COL.accent }}>{d.no} · REV {d.rev}</span>
              </div>
              <div className="text-[12px] font-medium mt-1">{d.title}</div>
            </div>
            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mono" style={{ color: DOC_STATUS[d.status]?.color, background: DOC_STATUS[d.status]?.bg }}>{DOC_STATUS[d.status]?.label}</span>
          </div>
          <div className="flex items-center justify-between mono text-[10px]" style={{ color: COL.textDim }}>
            <span>{d.date} · {d.size}</span>
            <span>{d.pkg}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

