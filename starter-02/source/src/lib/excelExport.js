// ============================================================
// Branded Excel export — turns any module's rows into a professional, branded
// .xlsx (BIM QC logo, navy title bar, project context, styled/bordered table
// with number formats, zebra rows, and optional column totals). Same look as
// the IPC certificate export. Uses ExcelJS (loaded on demand).
//
//   await exportSheet({
//     fileName: 'wirs',
//     title: 'WORK INSPECTION REQUESTS',
//     columns: [
//       { label: 'WIR No', key: 'wir_number', width: 14 },
//       { label: 'Amount', value: (r) => r.qty * r.rate, type: 'money', total: true },
//     ],
//     rows,
//   });
// ============================================================
import { getProject } from '../api/projects.js';
import { toast } from '../components/Toast.jsx';
import { loadExcelJS } from './loadExcel.js';
import { getCurrentProjectId } from './currentProject.js';
import { sanitizeCell } from './exportSanitize.js';

const C = {
  accent: 'FF1D4ED8', navy: 'FF0B1F4D', headFill: 'FFEAF1FF', zebra: 'FFF6F8FB',
  border: 'FFD9DEE7', white: 'FFFFFFFF', ink: 'FF1F2430', mute: 'FF6B7280',
};
const NUMFMT = { money: '#,##0.00', num: '#,##0.######', pct: '0.0%' };
const thin = { style: 'thin', color: { argb: C.border } };
const boxAll = { top: thin, left: thin, bottom: thin, right: thin };

// BIM QC logo (blue tile + three stacked iso blocks), drawn on a canvas → PNG.
function makeLogoDataUrl() {
  try {
    const s = 2, W = 230, H = 60;
    const cv = document.createElement('canvas'); cv.width = W * s; cv.height = H * s;
    const x = cv.getContext('2d'); x.scale(s, s);
    const r = 13, tx = 0, ty = 4, tw = 52, th = 52;
    x.fillStyle = '#0C447C'; x.beginPath();
    x.moveTo(tx + r, ty); x.arcTo(tx + tw, ty, tx + tw, ty + th, r); x.arcTo(tx + tw, ty + th, tx, ty + th, r);
    x.arcTo(tx, ty + th, tx, ty, r); x.arcTo(tx, ty, tx + tw, ty, r); x.closePath(); x.fill();
    const cx = 26; const dia = (cy, fill) => { x.beginPath(); x.moveTo(cx, cy - 5); x.lineTo(cx + 10, cy); x.lineTo(cx, cy + 5); x.lineTo(cx - 10, cy); x.closePath(); x.fillStyle = fill; x.fill(); };
    dia(40, '#185FA5'); dia(31, '#378ADD'); dia(22, '#ffffff');
    x.fillStyle = '#0b1f4d'; x.font = '600 24px Inter, Helvetica, Arial, sans-serif'; x.fillText('BIM QC', 64, 30);
    x.fillStyle = '#6b7280'; x.font = '600 9px Helvetica, Arial, sans-serif'; x.fillText("construction's system of record", 64, 44);
    return cv.toDataURL('image/png');
  } catch { return null; }
}

const cellVal = (col, row) => (typeof col.value === 'function' ? col.value(row) : row[col.key]);
const isNumCol = (t) => t === 'money' || t === 'num' || t === 'pct';

export async function exportSheet({ fileName = 'export', title = 'EXPORT', subtitle, columns = [], rows = [], project }) {
  if (!rows || rows.length === 0) { toast.info('Nothing to export yet.'); return; }
  const proj = project || await getProject(getCurrentProjectId()).catch(() => null);
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BIM QC'; wb.created = new Date();
  const ws = wb.addWorksheet(title.slice(0, 28) || 'Export', { views: [{ showGridLines: false }] });

  // column widths
  columns.forEach((col, i) => { ws.getColumn(i + 1).width = col.width || Math.min(40, Math.max(10, String(col.label || '').length + 4)); });
  const lastCol = columns.length;

  // logo band (rows 1-3) + navy title bar (row 4)
  ws.getRow(1).height = 18; ws.getRow(2).height = 18; ws.getRow(3).height = 8;
  const logo = makeLogoDataUrl();
  if (logo) { const id = wb.addImage({ base64: logo, extension: 'png' }); ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 184, height: 48 } }); }
  ws.mergeCells(4, 1, 4, Math.max(1, lastCol));
  const tc = ws.getCell(4, 1);
  tc.value = title;
  tc.font = { name: 'Calibri', size: 12, bold: true, color: { argb: C.white } };
  tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
  tc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(4).height = 22;
  for (let c = 1; c <= lastCol; c += 1) ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: C.accent } } };

  // meta line (row 5)
  const meta = [proj?.name && `Project: ${proj.name}`, proj?.contractor && `Contractor: ${proj.contractor}`, subtitle, `Exported ${new Date().toISOString().slice(0, 10)} · ${rows.length} rows`].filter(Boolean).join('   ·   ');
  ws.mergeCells(5, 1, 5, Math.max(1, lastCol));
  ws.getCell(5, 1).value = sanitizeCell(meta);
  ws.getCell(5, 1).font = { size: 9.5, italic: true, color: { argb: C.mute } };

  // header row (row 7)
  const HEAD = 7;
  columns.forEach((col, i) => {
    const c = ws.getCell(HEAD, i + 1);
    c.value = col.label;
    c.font = { bold: true, size: 10, color: { argb: C.navy } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headFill } };
    c.alignment = { vertical: 'middle', horizontal: isNumCol(col.type) ? 'right' : 'left', wrapText: true };
    c.border = boxAll;
  });
  ws.getRow(HEAD).height = 22;

  // data rows
  rows.forEach((row, ri) => {
    const r = HEAD + 1 + ri;
    columns.forEach((col, ci) => {
      const cell = ws.getCell(r, ci + 1);
      let v = cellVal(col, row);
      if (isNumCol(col.type)) { v = Number(v); if (Number.isNaN(v)) v = null; cell.numFmt = NUMFMT[col.type]; }
      else if (Array.isArray(v)) v = v.join('; ');
      else if (v != null && typeof v === 'object') v = JSON.stringify(v);
      cell.value = sanitizeCell(v == null ? '' : v); // formula-injection guard (strings only; numbers untouched)
      cell.font = { size: 10, color: { argb: C.ink } };
      cell.alignment = { vertical: 'top', horizontal: isNumCol(col.type) ? 'right' : 'left', wrapText: col.wrap || false };
      cell.border = boxAll;
      if (ri % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    });
  });

  // totals row (if any column requests it)
  if (columns.some((c) => c.total)) {
    const tr = HEAD + 1 + rows.length;
    const firstNum = columns.findIndex((c) => c.total);
    columns.forEach((col, ci) => {
      const cell = ws.getCell(tr, ci + 1);
      cell.font = { bold: true, size: 10, color: { argb: C.navy } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headFill } };
      cell.border = boxAll;
      if (ci === 0 && firstNum !== 0) cell.value = 'TOTAL';
      if (col.total) {
        cell.numFmt = NUMFMT[col.type] || NUMFMT.num;
        cell.alignment = { horizontal: 'right' };
        cell.value = rows.reduce((s, row) => s + (Number(cellVal(col, row)) || 0), 0);
      }
    });
  }

  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: HEAD, column: lastCol } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${String(fileName).replace(/[^\w.\-]+/g, '_')}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
