import { COL } from '../lib/theme.js';

export const BOQ = {
  // Foundation
  'FND-01':   { code: 'A.01.01', desc: 'C40/50 Raft Foundation incl rebar & waterproofing', unit: 'm³', qty: 132.0, rate: 1450, approved: 132.0 },
  // Ground columns
  'COL-G01':  { code: 'B.01.01', desc: 'C40 RC Column 500×500 incl rebar & formwork', unit: 'm³', qty: 0.88, rate: 1850, approved: 0.88 },
  'COL-G02':  { code: 'B.01.01', desc: 'C40 RC Column 500×500 incl rebar & formwork', unit: 'm³', qty: 0.88, rate: 1850, approved: 0.88 },
  'COL-G03':  { code: 'B.01.01', desc: 'C40 RC Column 500×500 incl rebar & formwork', unit: 'm³', qty: 0.88, rate: 1850, approved: 0 },
  'COL-G04':  { code: 'B.01.01', desc: 'C40 RC Column 500×500 incl rebar & formwork', unit: 'm³', qty: 0.88, rate: 1850, approved: 0.88 },
  'COL-G05':  { code: 'B.01.01', desc: 'C40 RC Column 500×500 incl rebar & formwork', unit: 'm³', qty: 0.88, rate: 1850, approved: 0 },
  'COL-G06':  { code: 'B.01.01', desc: 'C40 RC Column 500×500 incl rebar & formwork', unit: 'm³', qty: 0.88, rate: 1850, approved: 0.88 },
  // Ground beams
  'BM-G01':   { code: 'B.02.01', desc: 'C40 RC Beam 400×600 incl rebar & formwork', unit: 'm³', qty: 3.0, rate: 1750, approved: 3.0 },
  'BM-G02':   { code: 'B.02.01', desc: 'C40 RC Beam 400×600 incl rebar & formwork', unit: 'm³', qty: 3.0, rate: 1750, approved: 3.0 },
  'BM-G03':   { code: 'B.02.01', desc: 'C40 RC Beam 400×600 incl rebar & formwork', unit: 'm³', qty: 2.0, rate: 1750, approved: 2.0 },
  'BM-G04':   { code: 'B.02.01', desc: 'C40 RC Beam 400×600 incl rebar & formwork', unit: 'm³', qty: 2.0, rate: 1750, approved: 0 },
  // Slabs
  'SLB-L01':  { code: 'B.03.01', desc: 'C40 RC Slab 300mm incl rebar & formwork', unit: 'm³', qty: 43.5, rate: 1550, approved: 43.5 },
  'SLB-L02':  { code: 'B.03.01', desc: 'C40 RC Slab 300mm incl rebar & formwork', unit: 'm³', qty: 43.5, rate: 1550, approved: 0 },
  'SLB-RF':   { code: 'B.03.01', desc: 'C40 RC Roof Slab 300mm incl rebar & formwork', unit: 'm³', qty: 43.5, rate: 1550, approved: 0 },
  // Walls & partition
  'WALL-GN':  { code: 'C.01.01', desc: 'Blockwork external wall incl render', unit: 'm²', qty: 44.2, rate: 165, approved: 44.2 },
  'WALL-GS':  { code: 'C.01.01', desc: 'Blockwork external wall incl render', unit: 'm²', qty: 44.2, rate: 165, approved: 0 },
  'WALL-GW':  { code: 'C.01.01', desc: 'Blockwork external wall incl render', unit: 'm²', qty: 32.0, rate: 165, approved: 32.0 },
  'PART-G01': { code: 'C.02.01', desc: 'Gypsum partition 150mm incl finish', unit: 'm²', qty: 27.2, rate: 120, approved: 0 },
  'WALL-L1N': { code: 'C.01.01', desc: 'Blockwork external wall incl render', unit: 'm²', qty: 44.2, rate: 165, approved: 0 },
  'CORE-01':  { code: 'B.04.01', desc: 'C40 RC shear wall 200mm incl rebar', unit: 'm³', qty: 8.4, rate: 1950, approved: 8.4 },
  // Windows
  'WIN-G01':  { code: 'D.01.01', desc: 'Aluminium window incl double-glazed unit', unit: 'nr', qty: 1, rate: 3800, approved: 1 },
  'WIN-G02':  { code: 'D.01.01', desc: 'Aluminium window incl double-glazed unit', unit: 'nr', qty: 1, rate: 3800, approved: 0 },
  'WIN-G03':  { code: 'D.01.01', desc: 'Aluminium window incl double-glazed unit', unit: 'nr', qty: 1, rate: 3800, approved: 1 },
  'WIN-L101': { code: 'D.01.01', desc: 'Aluminium window incl double-glazed unit', unit: 'nr', qty: 1, rate: 3800, approved: 0 },
  'WIN-L102': { code: 'D.01.01', desc: 'Aluminium window incl double-glazed unit', unit: 'nr', qty: 1, rate: 3800, approved: 0 },
  'WIN-L201': { code: 'D.01.01', desc: 'Aluminium window incl double-glazed unit', unit: 'nr', qty: 1, rate: 3800, approved: 0 },
  // Doors
  'DOOR-G01': { code: 'D.02.01', desc: 'Glazed aluminium entrance door', unit: 'nr', qty: 1, rate: 6500, approved: 1 },
  'DOOR-G02': { code: 'D.02.02', desc: 'Solid timber internal door incl frame & ironmongery', unit: 'nr', qty: 1, rate: 1850, approved: 0 },
  'DOOR-L101':{ code: 'D.02.02', desc: 'Solid timber internal door incl frame & ironmongery', unit: 'nr', qty: 1, rate: 1850, approved: 0 },
  // L1 columns & beam
  'COL-L101': { code: 'B.01.02', desc: 'C40 RC Column 450×450 incl rebar & formwork', unit: 'm³', qty: 0.71, rate: 1900, approved: 0 },
  'COL-L102': { code: 'B.01.02', desc: 'C40 RC Column 450×450 incl rebar & formwork', unit: 'm³', qty: 0.71, rate: 1900, approved: 0 },
  'COL-L103': { code: 'B.01.02', desc: 'C40 RC Column 450×450 incl rebar & formwork', unit: 'm³', qty: 0.71, rate: 1900, approved: 0.71 },
  'COL-L104': { code: 'B.01.02', desc: 'C40 RC Column 450×450 incl rebar & formwork', unit: 'm³', qty: 0.71, rate: 1900, approved: 0 },
  'BM-L101':  { code: 'B.02.01', desc: 'C40 RC Beam 400×500 incl rebar & formwork', unit: 'm³', qty: 2.5, rate: 1750, approved: 0 },
  'COL-L201': { code: 'B.01.02', desc: 'C40 RC Column 450×450 incl rebar & formwork', unit: 'm³', qty: 0.71, rate: 1900, approved: 0 }
};

