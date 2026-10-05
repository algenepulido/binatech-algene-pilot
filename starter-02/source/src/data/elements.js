import { COL } from '../lib/theme.js';

export const ELEMENTS = [
  // FOUNDATION
  { id: 'FND-01',   guid: '0Ra$ft01xQ9', name: 'Raft Foundation',        type: 'Foundation', level: 'Foundation', discipline: 'Structural',    shape: 'box', position: [0, -0.4, 0],    size: [15, 0.8, 11],   status: 'approved',    material: 'C40/50 RC' },

  // GROUND FLOOR - COLUMNS
  { id: 'COL-G01',  guid: '1Co$lG01aB2', name: 'Column G-A1',            type: 'Column',     level: 'Ground',     discipline: 'Structural',    shape: 'box', position: [-6, 1.75, -4],  size: [0.5, 3.5, 0.5], status: 'approved',    material: 'C40 RC' },
  { id: 'COL-G02',  guid: '1Co$lG02aB3', name: 'Column G-B1',            type: 'Column',     level: 'Ground',     discipline: 'Structural',    shape: 'box', position: [0, 1.75, -4],   size: [0.5, 3.5, 0.5], status: 'approved',    material: 'C40 RC' },
  { id: 'COL-G03',  guid: '1Co$lG03aB4', name: 'Column G-C1',            type: 'Column',     level: 'Ground',     discipline: 'Structural',    shape: 'box', position: [6, 1.75, -4],   size: [0.5, 3.5, 0.5], status: 'pending',     material: 'C40 RC' },
  { id: 'COL-G04',  guid: '1Co$lG04aB5', name: 'Column G-A2',            type: 'Column',     level: 'Ground',     discipline: 'Structural',    shape: 'box', position: [-6, 1.75, 4],   size: [0.5, 3.5, 0.5], status: 'approved',    material: 'C40 RC' },
  { id: 'COL-G05',  guid: '1Co$lG05aB6', name: 'Column G-B2',            type: 'Column',     level: 'Ground',     discipline: 'Structural',    shape: 'box', position: [0, 1.75, 4],    size: [0.5, 3.5, 0.5], status: 'in_progress', material: 'C40 RC' },
  { id: 'COL-G06',  guid: '1Co$lG06aB7', name: 'Column G-C2',            type: 'Column',     level: 'Ground',     discipline: 'Structural',    shape: 'box', position: [6, 1.75, 4],    size: [0.5, 3.5, 0.5], status: 'approved',    material: 'C40 RC' },

  // GROUND FLOOR - BEAMS (at L1 floor level)
  { id: 'BM-G01',   guid: '2Be$mG01cD2', name: 'Beam G-North',          type: 'Beam',       level: 'Ground',     discipline: 'Structural',    shape: 'box', position: [0, 3.4, -4],    size: [12.5, 0.6, 0.4],status: 'approved',    material: 'C40 RC' },
  { id: 'BM-G02',   guid: '2Be$mG02cD3', name: 'Beam G-South',          type: 'Beam',       level: 'Ground',     discipline: 'Structural',    shape: 'box', position: [0, 3.4, 4],     size: [12.5, 0.6, 0.4],status: 'approved',    material: 'C40 RC' },
  { id: 'BM-G03',   guid: '2Be$mG03cD4', name: 'Beam G-West',           type: 'Beam',       level: 'Ground',     discipline: 'Structural',    shape: 'box', position: [-6, 3.4, 0],    size: [0.4, 0.6, 8.5], status: 'approved',    material: 'C40 RC' },
  { id: 'BM-G04',   guid: '2Be$mG04cD5', name: 'Beam G-East',           type: 'Beam',       level: 'Ground',     discipline: 'Structural',    shape: 'box', position: [6, 3.4, 0],     size: [0.4, 0.6, 8.5], status: 'pending',     material: 'C40 RC' },

  // L1 SLAB
  { id: 'SLB-L01',  guid: '3Sl$bL01eF2', name: 'Slab Level 1',          type: 'Slab',       level: 'L1',         discipline: 'Structural',    shape: 'box', position: [0, 3.75, 0],    size: [14.5, 0.3, 10], status: 'approved',    material: 'C40 RC' },

  // GROUND - WALLS
  { id: 'WALL-GN',  guid: '4Wa$lGN0gH2', name: 'External Wall G-North', type: 'Wall',       level: 'Ground',     discipline: 'Architectural', shape: 'box', position: [0, 1.75, -4.9], size: [13, 3.4, 0.2],  status: 'approved',    material: 'Block + render' },
  { id: 'WALL-GS',  guid: '4Wa$lGS0gH3', name: 'External Wall G-South', type: 'Wall',       level: 'Ground',     discipline: 'Architectural', shape: 'box', position: [0, 1.75, 4.9],  size: [13, 3.4, 0.2],  status: 'in_progress', material: 'Block + render' },
  { id: 'WALL-GW',  guid: '4Wa$lGW0gH4', name: 'External Wall G-West',  type: 'Wall',       level: 'Ground',     discipline: 'Architectural', shape: 'box', position: [-7, 1.75, 0],   size: [0.2, 3.4, 9.4], status: 'approved',    material: 'Block + render' },
  { id: 'PART-G01', guid: '4Wa$lGP0gH5', name: 'Partition Wall G-01',   type: 'Partition',  level: 'Ground',     discipline: 'Architectural', shape: 'box', position: [2.5, 1.75, 0],  size: [0.15, 3.4, 8],  status: 'pending',     material: 'Gypsum partition' },

  // GROUND - WINDOWS
  { id: 'WIN-G01',  guid: '5Wi$nG01iJ2', name: 'Window G-N1',           type: 'Window',     level: 'Ground',     discipline: 'Architectural', shape: 'box', position: [-3, 2.0, -4.9], size: [2.2, 1.6, 0.25],status: 'approved',    material: 'Aluminium + DGU' },
  { id: 'WIN-G02',  guid: '5Wi$nG02iJ3', name: 'Window G-N2',           type: 'Window',     level: 'Ground',     discipline: 'Architectural', shape: 'box', position: [3, 2.0, -4.9],  size: [2.2, 1.6, 0.25],status: 'rejected',    material: 'Aluminium + DGU' },
  { id: 'WIN-G03',  guid: '5Wi$nG03iJ4', name: 'Window G-W1',           type: 'Window',     level: 'Ground',     discipline: 'Architectural', shape: 'box', position: [-7, 2.0, 2.5],  size: [0.25, 1.6, 2.2],status: 'approved',    material: 'Aluminium + DGU' },

  // GROUND - DOORS
  { id: 'DOOR-G01', guid: '6Do$rG01kL2', name: 'Entrance Door G',       type: 'Door',       level: 'Ground',     discipline: 'Architectural', shape: 'box', position: [0, 1.15, 4.9],  size: [1.4, 2.3, 0.3], status: 'approved',    material: 'Glazed aluminium' },
  { id: 'DOOR-G02', guid: '6Do$rG02kL3', name: 'Internal Door G-01',    type: 'Door',       level: 'Ground',     discipline: 'Architectural', shape: 'box', position: [2.5, 1.05, -2], size: [0.3, 2.1, 1.0], status: 'pending',     material: 'Solid timber' },

  // LEVEL 1 - COLUMNS
  { id: 'COL-L101', guid: '1Co$lL11aB8', name: 'Column L1-A1',          type: 'Column',     level: 'L1',         discipline: 'Structural',    shape: 'box', position: [-6, 5.5, -4],   size: [0.45, 3.5, 0.45],status: 'in_progress', material: 'C40 RC' },
  { id: 'COL-L102', guid: '1Co$lL12aB9', name: 'Column L1-C1',          type: 'Column',     level: 'L1',         discipline: 'Structural',    shape: 'box', position: [6, 5.5, -4],    size: [0.45, 3.5, 0.45],status: 'in_progress', material: 'C40 RC' },
  { id: 'COL-L103', guid: '1Co$lL13aC1', name: 'Column L1-A2',          type: 'Column',     level: 'L1',         discipline: 'Structural',    shape: 'box', position: [-6, 5.5, 4],    size: [0.45, 3.5, 0.45],status: 'approved',    material: 'C40 RC' },
  { id: 'COL-L104', guid: '1Co$lL14aC2', name: 'Column L1-C2',          type: 'Column',     level: 'L1',         discipline: 'Structural',    shape: 'box', position: [6, 5.5, 4],     size: [0.45, 3.5, 0.45],status: 'not_started', material: 'C40 RC' },

  // LEVEL 1 - BEAM + SLAB
  { id: 'BM-L101',  guid: '2Be$mL11cD6', name: 'Beam L1-North',         type: 'Beam',       level: 'L1',         discipline: 'Structural',    shape: 'box', position: [0, 7.1, -4],    size: [12.5, 0.5, 0.4],status: 'in_progress', material: 'C40 RC' },
  { id: 'SLB-L02',  guid: '3Sl$bL02eF3', name: 'Slab Level 2',          type: 'Slab',       level: 'L2',         discipline: 'Structural',    shape: 'box', position: [0, 7.25, 0],    size: [14.5, 0.3, 10], status: 'not_started', material: 'C40 RC' },

  // LEVEL 1 - WALL, WINDOWS, DOOR
  { id: 'WALL-L1N', guid: '4Wa$lL1NgH6', name: 'External Wall L1-North',type: 'Wall',       level: 'L1',         discipline: 'Architectural', shape: 'box', position: [0, 5.5, -4.9],  size: [13, 3.4, 0.2],  status: 'in_progress', material: 'Block + render' },
  { id: 'WIN-L101', guid: '5Wi$nL11iJ5', name: 'Window L1-N1',          type: 'Window',     level: 'L1',         discipline: 'Architectural', shape: 'box', position: [-3, 5.75, -4.9],size: [2.2, 1.6, 0.25],status: 'pending',     material: 'Aluminium + DGU' },
  { id: 'WIN-L102', guid: '5Wi$nL12iJ6', name: 'Window L1-N2',          type: 'Window',     level: 'L1',         discipline: 'Architectural', shape: 'box', position: [3, 5.75, -4.9], size: [2.2, 1.6, 0.25],status: 'not_started', material: 'Aluminium + DGU' },
  { id: 'DOOR-L101',guid: '6Do$rL11kL4', name: 'Internal Door L1-01',   type: 'Door',       level: 'L1',         discipline: 'Architectural', shape: 'box', position: [2.5, 4.8, -2], size: [0.3, 2.1, 1.0], status: 'ncr',         material: 'Solid timber' },

  // LEVEL 2 - COLUMN, ROOF SLAB, WINDOW
  { id: 'COL-L201', guid: '1Co$lL21aC3', name: 'Column L2-A1',          type: 'Column',     level: 'L2',         discipline: 'Structural',    shape: 'box', position: [-6, 9.0, -4],   size: [0.45, 3.5, 0.45],status: 'not_started', material: 'C40 RC' },
  { id: 'SLB-RF',   guid: '3Sl$bRF0eF4', name: 'Roof Slab',             type: 'Slab',       level: 'Roof',       discipline: 'Structural',    shape: 'box', position: [0, 10.75, 0],   size: [14.5, 0.3, 10], status: 'not_started', material: 'C40 RC' },
  { id: 'WIN-L201', guid: '5Wi$nL21iJ7', name: 'Window L2-N1',          type: 'Window',     level: 'L2',         discipline: 'Architectural', shape: 'box', position: [-3, 9.25, -4.9],size: [2.2, 1.6, 0.25],status: 'not_started', material: 'Aluminium + DGU' },

  // CORE (stair / lift, spans all floors)
  { id: 'CORE-01',  guid: '7Cr$e001mN2', name: 'Stair / Lift Core',     type: 'Core Wall',  level: 'Multi',      discipline: 'Structural',    shape: 'box', position: [5.8, 5.2, -3],  size: [0.2, 10.5, 4],  status: 'approved',    material: 'C40 RC shear wall' }
];

