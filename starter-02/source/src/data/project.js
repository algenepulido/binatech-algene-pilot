import { Activity, AlertOctagon, CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';

export const PROJECT = {
  code: 'SYN-SAMPLE',
  name: 'Sample Residences (fictional) / Block C, Levels G-L2',
  nameAr: 'مساكن نموذجية (وهمية) / مبنى ج، الأرضي-الثاني',
  client: 'Fictional Developer Co.',
  contractor: 'Fictional Main Contractor',
  consultant: 'Fictional Design Consultant',
  contractValue: 62400000,
  startDate: '2025-09-01',
  endDate: '2027-03-31',
  revision: 'C-04',
  lastSync: '2026-05-12 08:42',
  zatcaVatRate: 0.15,
  retentionRate: 0.10,
  scope: '3-level RC frame residential block, 35 tracked elements: foundation, columns, beams, slabs, walls, doors, windows',
  structureType: 'RC frame building'
};

export const STATUS = {
  approved:    { label: 'Approved',    labelAr: 'معتمد',       color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
  pending:     { label: 'Pending',     labelAr: 'معلق',         color: '#d97706', bg: '#fef3c7', icon: Clock },
  rejected:    { label: 'Rejected',    labelAr: 'مرفوض',        color: '#dc2626', bg: '#fee2e2', icon: XCircle },
  ncr:         { label: 'Open NCR',    labelAr: 'عدم مطابقة',   color: '#991b1b', bg: '#fecaca', icon: AlertOctagon },
  in_progress: { label: 'In Progress', labelAr: 'قيد التنفيذ', color: '#2563eb', bg: '#dbeafe', icon: Activity },
  not_started: { label: 'Not Started', labelAr: 'لم يبدأ',     color: '#78716c', bg: '#f5f5f4', icon: Circle }
};

// Element shape: 'box' (default), 'cylinder'. Opacity is derived from type at render
// so walls read as semi-transparent and you can see the frame, doors and windows inside.
