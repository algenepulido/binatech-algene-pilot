import { describe, it, expect } from 'vitest';
import { sanitizeCell, sanitizeCsvField } from './exportSanitize.js';

describe('exportSanitize — spreadsheet formula-injection guard', () => {
  // ── sanitizeCell: typed cells (XLSX / ExcelJS) ──
  describe('sanitizeCell (XLSX cells)', () => {
    it('escapes malicious formula-triggering strings', () => {
      expect(sanitizeCell('=HYPERLINK("http://evil","x")')).toBe("'=HYPERLINK(\"http://evil\",\"x\")");
      expect(sanitizeCell('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)");
      expect(sanitizeCell('-SUM(A1)')).toBe("'-SUM(A1)");
      expect(sanitizeCell('@cmd')).toBe("'@cmd");
      expect(sanitizeCell('=1+1')).toBe("'=1+1");
      expect(sanitizeCell('\t=1')).toBe("'\t=1");   // leading tab
      expect(sanitizeCell('\r=1')).toBe("'\r=1");   // leading carriage return
    });
    it('leaves ordinary text untouched', () => {
      expect(sanitizeCell('Cast-in-situ concrete barrier')).toBe('Cast-in-situ concrete barrier');
      expect(sanitizeCell('WIR-2481')).toBe('WIR-2481');
      expect(sanitizeCell('Mohsin: 60%')).toBe('Mohsin: 60%');
      expect(sanitizeCell('')).toBe('');
    });
    it('does NOT corrupt genuine numbers/booleans/null (stay typed)', () => {
      expect(sanitizeCell(-10)).toBe(-10);            // real number, not a string
      expect(sanitizeCell(43200)).toBe(43200);
      expect(sanitizeCell(0)).toBe(0);
      expect(sanitizeCell(true)).toBe(true);
      expect(sanitizeCell(null)).toBe(null);
    });
    it('leaves ExcelJS formula objects untouched (app-authored formulas)', () => {
      const f = { formula: 'D5*E5' };
      expect(sanitizeCell(f)).toBe(f); // objects pass through — app formulas preserved
    });
  });

  // ── sanitizeCsvField: text fields (CSV) ──
  describe('sanitizeCsvField (CSV fields)', () => {
    it('escapes malicious text values', () => {
      expect(sanitizeCsvField('=cmd|\' /C calc\'!A1')).toBe("'=cmd|' /C calc'!A1");
      expect(sanitizeCsvField('+1+1')).toBe("'+1+1");
      expect(sanitizeCsvField('@SUM(1)')).toBe("'@SUM(1)");
      expect(sanitizeCsvField('-10')).toBe("'-10");   // STRING '-10' is escaped (per spec)
    });
    it('keeps genuine numbers numeric (not prefixed)', () => {
      expect(sanitizeCsvField(-10)).toBe('-10');       // real number stays numeric text
      expect(sanitizeCsvField(43200)).toBe('43200');
      expect(sanitizeCsvField(true)).toBe('true');
    });
    it('joins arrays and guards the joined result', () => {
      expect(sanitizeCsvField(['WIR-1', 'WIR-2'])).toBe('WIR-1; WIR-2');
      expect(sanitizeCsvField(['=evil', 'b'])).toBe("'=evil; b");
    });
    it('handles null/undefined as empty string', () => {
      expect(sanitizeCsvField(null)).toBe('');
      expect(sanitizeCsvField(undefined)).toBe('');
    });
    it('leaves ordinary text untouched', () => {
      expect(sanitizeCsvField('Anti-carbonation coating')).toBe('Anti-carbonation coating');
    });
  });
});
