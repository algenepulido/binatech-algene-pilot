// ============================================================
// IPC export — a professional, branded "Contractor's Application & Certificate
// for Payment" workbook built with ExcelJS (styling + images + LIVE formulas).
//
// - BIM QC logo (drawn on a canvas, embedded as PNG — no asset file needed),
//   top-left of every sheet.
// - Styled tables: navy title bar, accent section headers, bordered grids,
//   zebra rows, SAR number formats.
// - Real linked formulas: App A totals feed the summary; retention/VAT/net and
//   percentages all compute in-cell and recalc if a figure is edited.
//
// Sheets: IPC_SUMMARY, App A - Works Done, App C - Previous, App D - Advance,
//         App E - Deduction, App F - Insurances.
// ============================================================

import { loadExcelJS } from './loadExcel.js';
import { sanitizeCell } from './exportSanitize.js';

// ---- brand palette (ARGB for ExcelJS) ----
const C = {
  accent: 'FF1D4ED8',
  navy: 'FF0B1F4D',
  headFill: 'FFEAF1FF',
  zebra: 'FFF6F8FB',
  border: 'FFD9DEE7',
  white: 'FFFFFFFF',
  ink: 'FF1F2430',
  mute: 'FF6B7280',
  green: 'FF15803D',
  red: 'FFB91C1C',
};
const SAR = '#,##0.00';
const SAR_NEG = '#,##0.00;[Red]-#,##0.00';
const PCT = '0.0%';
const thin = { style: 'thin', color: { argb: C.border } };
const boxAll = { top: thin, left: thin, bottom: thin, right: thin };

// Draw a small BIM QC logo (blue tile + 3D cube + wordmark) and return a PNG data URL.
function makeLogoDataUrl() {
  try {
    const s = 2;
    const W = 250, H = 64;
    const cv = document.createElement('canvas');
    cv.width = W * s; cv.height = H * s;
    const x = cv.getContext('2d');
    x.scale(s, s);
    // rounded blue tile (brand mark)
    const r = 13, tx = 0, ty = 6, tw = 52, th = 52;
    x.fillStyle = '#0C447C';
    x.beginPath();
    x.moveTo(tx + r, ty); x.arcTo(tx + tw, ty, tx + tw, ty + th, r); x.arcTo(tx + tw, ty + th, tx, ty + th, r);
    x.arcTo(tx, ty + th, tx, ty, r); x.arcTo(tx, ty, tx + tw, ty, r); x.closePath(); x.fill();
    // three stacked isometric blocks (bottom darkest -> top white)
    const cx = 26;
    const diamond = (cy, hw, hh, fill) => { x.beginPath(); x.moveTo(cx, cy - hh); x.lineTo(cx + hw, cy); x.lineTo(cx, cy + hh); x.lineTo(cx - hw, cy); x.closePath(); x.fillStyle = fill; x.fill(); };
    diamond(42, 10, 5, '#185FA5');
    diamond(33, 10, 5, '#378ADD');
    diamond(24, 10, 5, '#ffffff');
    // wordmark + ribbon
    x.fillStyle = '#0b1f4d';
    x.font = '600 26px Inter, Helvetica, Arial, sans-serif';
    x.fillText('BIM QC', 64, 32);
    x.fillStyle = '#6b7280';
    x.font = '600 10px Helvetica, Arial, sans-serif';
    x.fillText("construction's system of record", 64, 48);
    return cv.toDataURL('image/png');
  } catch {
    return null;
  }
}

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function exportIpcWorkbook({ ipc, project, boqItems = [], prevIpcs = [] }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BIM QC';
  wb.created = new Date();

  const logo = makeLogoDataUrl();
  const logoId = logo ? wb.addImage({ base64: logo, extension: 'png' }) : null;

  // -- shared helpers bound to a worksheet --
  function header(ws, title, lastCol) {
    ws.views = [{ showGridLines: false }];
    ws.getRow(1).height = 18;
    ws.getRow(2).height = 18;
    ws.getRow(3).height = 10;
    // logo band, top-left (floating image over rows 1–3)
    if (logoId != null) ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 196, height: 50 } });
    // full-width navy title bar on its own row, with an accent underline
    ws.mergeCells(4, 1, 4, lastCol);
    const tc = ws.getCell(4, 1);
    tc.value = title;
    tc.font = { name: 'Calibri', size: 12, bold: true, color: { argb: C.white } };
    tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
    tc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(4).height = 24;
    for (let c = 1; c <= lastCol; c += 1) ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: C.accent } } };
  }
  function section(ws, row, label, lastCol) {
    ws.mergeCells(row, 1, row, lastCol);
    const c = ws.getCell(row, 1);
    c.value = label;
    c.font = { bold: true, size: 10.5, color: { argb: C.white } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.accent } };
    c.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(row).height = 18;
  }
  function kv(ws, row, label, value, opts = {}) {
    const a = ws.getCell(row, 1); a.value = label;
    a.font = { size: 10.5, color: { argb: C.ink }, bold: !!opts.bold };
    a.alignment = { vertical: 'middle', indent: 1 };
    const b = ws.getCell(row, 2); b.value = sanitizeCell(value);
    b.font = { size: 10.5, color: { argb: opts.color || C.ink }, bold: !!opts.bold };
    b.alignment = { vertical: 'middle', horizontal: opts.num ? 'right' : 'left', indent: 1 };
    if (opts.num) b.numFmt = opts.numFmt || SAR;
    a.border = { bottom: thin }; b.border = { bottom: thin };
    if (opts.fill) { a.fill = b.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } }; }
  }
  function thRow(ws, row, headers, widths) {
    headers.forEach((h, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = h;
      c.font = { bold: true, size: 10, color: { argb: C.navy } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headFill } };
      c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : (typeof widths?.[i] === 'object' ? 'right' : 'left'), wrapText: true };
      c.border = boxAll;
    });
    ws.getRow(row).height = 26;
  }

  // ============ App A — value of works done (built first; summary refers to it) ============
  const wsA = wb.addWorksheet('App A - Works Done');
  [10, 40, 8, 11, 12, 16, 12, 9, 17].forEach((w, i) => { wsA.getColumn(i + 1).width = w; });
  header(wsA, 'APPENDIX A — CUMULATIVE VALUE OF WORKS DONE', 9);
  const A_HEAD = 5;
  thRow(wsA, A_HEAD, ['Code', 'Description', 'Unit', 'Total Qty', 'Rate (SAR)', 'Total Amount', 'Approved Qty', '% Done', 'Value Certified'], [0, 0, 0, 1, 1, 1, 1, 1, 1]);
  const A_START = A_HEAD + 1;
  boqItems.forEach((it, i) => {
    const r = A_START + i;
    const row = wsA.getRow(r);
    row.getCell(1).value = sanitizeCell(it.code || '');
    row.getCell(2).value = sanitizeCell(it.description || '');
    row.getCell(3).value = sanitizeCell(it.unit || '');
    row.getCell(4).value = Number(it.qty || 0);
    row.getCell(5).value = Number(it.rate || 0);
    row.getCell(6).value = { formula: `D${r}*E${r}` };
    row.getCell(7).value = Number(it.approved_qty || 0);
    row.getCell(8).value = { formula: `IF(D${r}=0,0,G${r}/D${r})` };
    row.getCell(9).value = { formula: `G${r}*E${r}` };
    for (let c = 1; c <= 9; c += 1) {
      const cell = row.getCell(c);
      cell.border = boxAll;
      cell.font = { size: 10, color: { argb: C.ink } };
      if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      if (c >= 4) cell.alignment = { horizontal: 'right' };
      if (c === 5 || c === 6 || c === 9) cell.numFmt = SAR;
      if (c === 8) cell.numFmt = PCT;
    }
  });
  const A_END = boqItems.length ? A_START + boqItems.length - 1 : A_HEAD;
  const A_TOTAL = A_END + 1;
  const trA = wsA.getRow(A_TOTAL);
  trA.getCell(2).value = 'TOTAL';
  trA.getCell(6).value = boqItems.length ? { formula: `SUM(F${A_START}:F${A_END})` } : 0;
  trA.getCell(9).value = boqItems.length ? { formula: `SUM(I${A_START}:I${A_END})` } : 0;
  for (let c = 1; c <= 9; c += 1) {
    const cell = trA.getCell(c);
    cell.border = boxAll;
    cell.font = { bold: true, size: 10, color: { argb: C.navy } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headFill } };
    if (c === 6 || c === 9) { cell.numFmt = SAR; cell.alignment = { horizontal: 'right' }; }
  }
  const REF_CONTRACT = `'App A - Works Done'!F${A_TOTAL}`;
  const REF_CERT = `'App A - Works Done'!I${A_TOTAL}`;

  // ============ App C — previous certifications (summary subtracts this) ============
  const wsC = wb.addWorksheet('App C - Previous');
  [12, 16, 15, 14, 15, 13, 15, 12].forEach((w, i) => { wsC.getColumn(i + 1).width = w; });
  header(wsC, 'APPENDIX C — PREVIOUS CERTIFICATIONS', 8);
  const C_HEAD = 5;
  thRow(wsC, C_HEAD, ['IPC #', 'Period', 'Gross (SAR)', 'Retention 10%', 'Sub Total', 'VAT 15%', 'Net Payable', 'Status'], [0, 0, 1, 1, 1, 1, 1, 0]);
  const C_START = C_HEAD + 1;
  prevIpcs.forEach((p, i) => {
    const r = C_START + i;
    const row = wsC.getRow(r);
    row.getCell(1).value = sanitizeCell(p.ipc_number || '');
    row.getCell(2).value = sanitizeCell(p.period || '');
    row.getCell(3).value = money(p.gross_amount);
    row.getCell(4).value = { formula: `-C${r}*0.1` };
    row.getCell(5).value = { formula: `C${r}+D${r}` };
    row.getCell(6).value = { formula: `E${r}*0.15` };
    row.getCell(7).value = { formula: `E${r}+F${r}` };
    row.getCell(8).value = sanitizeCell(p.status || '');
    for (let c = 1; c <= 8; c += 1) {
      const cell = row.getCell(c);
      cell.border = boxAll;
      cell.font = { size: 10, color: { argb: C.ink } };
      if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      if (c >= 3 && c <= 7) { cell.numFmt = SAR_NEG; cell.alignment = { horizontal: 'right' }; }
    }
  });
  const C_END = prevIpcs.length ? C_START + prevIpcs.length - 1 : C_HEAD;
  const C_TOTAL = C_END + 1;
  const trC = wsC.getRow(C_TOTAL);
  trC.getCell(2).value = 'TOTAL';
  [3, 5, 7].forEach((c) => { trC.getCell(c).value = prevIpcs.length ? { formula: `SUM(${String.fromCharCode(64 + c)}${C_START}:${String.fromCharCode(64 + c)}${C_END})` } : 0; });
  for (let c = 1; c <= 8; c += 1) {
    const cell = trC.getCell(c);
    cell.border = boxAll;
    cell.font = { bold: true, size: 10, color: { argb: C.navy } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headFill } };
    if (c >= 3 && c <= 7) { cell.numFmt = SAR; cell.alignment = { horizontal: 'right' }; }
  }
  const REF_PREV_GROSS = `'App C - Previous'!C${C_TOTAL}`;

  // ============ IPC_SUMMARY (the certificate face) ============
  const ws = wb.addWorksheet('IPC_SUMMARY');
  ws.getColumn(1).width = 46; ws.getColumn(2).width = 26;
  header(ws, "CONTRACTOR'S APPLICATION & CERTIFICATE FOR PAYMENT", 2);
  let r = 5;
  section(ws, r, 'PROJECT DETAILS', 2); r += 1;
  kv(ws, r++, 'Project / Contract', project.name || '');
  kv(ws, r++, 'Owner / Employer', project.client || '');
  kv(ws, r++, 'Contractor', project.contractor || '');
  kv(ws, r++, 'Consultant / PMCM', project.consultant || '');
  kv(ws, r++, 'Contract Number', project.code || '');
  r += 1;
  section(ws, r, 'PAYMENT CERTIFICATE DETAILS', 2); r += 1;
  kv(ws, r++, 'Interim Statement No', ipc.ipc_number || '');
  kv(ws, r++, 'Statement type', 'INTERIM');
  kv(ws, r++, 'Period', ipc.period || '');
  kv(ws, r++, 'Status', (ipc.status || '').toString().toUpperCase());
  kv(ws, r++, 'Certified date', ipc.cert_date || '');
  r += 1;
  section(ws, r, 'CONTRACT DETAILS (SAR)', 2); r += 1;
  const rContract = r; kv(ws, r++, 'Contract value (excl VAT)', { formula: REF_CONTRACT }, { num: true });
  const rCVat = r; kv(ws, r++, 'VAT (15%)', { formula: `B${rContract}*0.15` }, { num: true });
  kv(ws, r++, 'Contract value (incl VAT)', { formula: `B${rContract}+B${rCVat}` }, { num: true, bold: true });
  r += 1;
  section(ws, r, 'THIS PAYMENT CERTIFICATE (SAR)', 2); r += 1;
  // forward-references the cumulative row (rCum) defined just below
  const rGross = r; r += 1;       // Gross value certified
  const rRet = r; r += 1;         // Retention
  const rSub = r; r += 1;         // Sub total
  const rVat = r; r += 1;         // VAT
  const rNet = r; r += 1;         // Net payable
  r += 1;
  const rCum = r; r += 1;         // cumulative certified
  const rPct = r; r += 1;         // percentage
  kv(ws, rGross, 'Gross value certified (this period)', { formula: `B${rCum}-${REF_PREV_GROSS}` }, { num: true });
  kv(ws, rRet, 'Less: Retention (10%)', { formula: `-B${rGross}*0.1` }, { num: true, color: C.red, numFmt: SAR_NEG });
  kv(ws, rSub, 'Sub total', { formula: `B${rGross}+B${rRet}` }, { num: true });
  kv(ws, rVat, 'VAT (15%)', { formula: `B${rSub}*0.15` }, { num: true });
  kv(ws, rNet, 'NET PAYABLE THIS CERTIFICATE', { formula: `B${rSub}+B${rVat}` }, { num: true, bold: true, color: C.accent, fill: C.headFill });
  kv(ws, rCum, 'Cumulative certified to date (from BoQ)', { formula: REF_CERT }, { num: true, bold: true });
  kv(ws, rPct, 'Percentage of contract certified', { formula: `IF(B${rContract}=0,0,B${rCum}/B${rContract})` }, { num: true, numFmt: PCT });
  ws.getCell(rNet, 1).font = { bold: true, size: 11, color: { argb: C.accent } };
  ws.getCell(rNet, 2).font = { bold: true, size: 12, color: { argb: C.accent } };

  // ============ App D — advance payment status ============
  const wsD = wb.addWorksheet('App D - Advance');
  [34, 22, 22, 22, 20].forEach((w, i) => { wsD.getColumn(i + 1).width = w; });
  header(wsD, 'APPENDIX D — STATUS OF ADVANCE PAYMENT', 5);
  thRow(wsD, 5, ['Description', 'Contract (excl VAT)', 'Cumulative Value', 'Advance Recovery 10%', 'Balance Advance'], [0, 1, 1, 1, 1]);
  const dRow = wsD.getRow(6);
  dRow.getCell(1).value = 'Contract';
  dRow.getCell(2).value = { formula: REF_CONTRACT };
  dRow.getCell(3).value = { formula: REF_CERT };
  dRow.getCell(4).value = { formula: 'C6*0.1' };
  dRow.getCell(5).value = { formula: 'B6*0.1-D6' };
  for (let c = 1; c <= 5; c += 1) { const cc = dRow.getCell(c); cc.border = boxAll; cc.font = { size: 10 }; if (c > 1) { cc.numFmt = SAR; cc.alignment = { horizontal: 'right' }; } }
  wsD.getCell(8, 1).value = 'Note: advance-payment schedule is not captured in-app — recovery shown at 10% of cumulative value for reference.';
  wsD.getCell(8, 1).font = { italic: true, size: 9.5, color: { argb: C.mute } };

  // ============ App E — deduction (retention) status ============
  const wsE = wb.addWorksheet('App E - Deduction');
  [34, 24, 16, 22].forEach((w, i) => { wsE.getColumn(i + 1).width = w; });
  header(wsE, 'APPENDIX E — STATUS OF DEDUCTION (RETENTION)', 4);
  thRow(wsE, 5, ['Description', 'Value of Work', 'Deduction %', 'Value of Deduction'], [0, 1, 0, 1]);
  const eRows = [
    ['Cumulative (from BoQ)', { formula: REF_CERT }],
    ['This certificate', { formula: `'IPC_SUMMARY'!B${rGross}` }],
  ];
  eRows.forEach(([label, val], i) => {
    const rr = wsE.getRow(6 + i);
    rr.getCell(1).value = label;
    rr.getCell(2).value = val;
    rr.getCell(3).value = 0.1;
    rr.getCell(4).value = { formula: `B${6 + i}*0.1` };
    for (let c = 1; c <= 4; c += 1) { const cc = rr.getCell(c); cc.border = boxAll; cc.font = { size: 10 }; if (i % 2) cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } }; if (c === 2 || c === 4) { cc.numFmt = SAR; cc.alignment = { horizontal: 'right' }; } if (c === 3) { cc.numFmt = PCT; cc.alignment = { horizontal: 'right' }; } }
  });

  // ============ App F — insurances & certificates (template) ============
  const wsF = wb.addWorksheet('App F - Insurances');
  [6, 46, 18, 28].forEach((w, i) => { wsF.getColumn(i + 1).width = w; });
  header(wsF, 'APPENDIX F — LIST OF INSURANCES & CERTIFICATES', 4);
  thRow(wsF, 5, ['Sr', 'Insurance / Certificate', 'Date of Expiry', 'Remarks'], [0, 0, 0, 0]);
  const FROWS = [
    "Contractor's All Risk Insurance", 'Equipment Insurance', 'Workers Insurance',
    'Third Party Insurance', 'Vehicle Insurance', 'Performance / Final Bank Guarantee',
    'Advance Payment Guarantee', 'GOSI Certificate', 'Zakat & Tax Certificate', 'Saudization (Nitaqat) Certificate',
  ];
  FROWS.forEach((label, i) => {
    const rr = wsF.getRow(6 + i);
    rr.getCell(1).value = i + 1;
    rr.getCell(2).value = label;
    for (let c = 1; c <= 4; c += 1) { const cc = rr.getCell(c); cc.border = boxAll; cc.font = { size: 10 }; if (i % 2) cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } }; }
    rr.getCell(1).alignment = { horizontal: 'center' };
  });
  wsF.getCell(6 + FROWS.length + 1, 1).value = 'Note: complete expiry dates & remarks manually — not captured in-app.';
  wsF.getCell(6 + FROWS.length + 1, 1).font = { italic: true, size: 9.5, color: { argb: C.mute } };

  // -- order sheets so the certificate face is first --
  const order = ['IPC_SUMMARY', 'App A - Works Done', 'App C - Previous', 'App D - Advance', 'App E - Deduction', 'App F - Insurances'];
  wb.worksheets.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

  // -- download --
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (ipc.ipc_number || 'IPC').replace(/[^\w.\-]+/g, '_');
  a.href = url; a.download = `${safe}-certificate.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
