/**
 * Ortho Diamond seed (docs/SPEC.md §12). The ONLY place sample business data lives.
 * Deterministic (seeded PRNG) and re-runnable: wipes all business tables first.
 *
 * Sample prices / GST / HSN are illustrative — the owner edits real values in the Admin Panel.
 */
import path from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { seedDemo } from './seed-demo';

const prisma = new PrismaClient();

// ── deterministic random ──
let seedState = 20261115;
const rand = () => {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 10) / 10);
  return out;
};
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const days = (n: number) => new Date(Date.now() + n * 86400_000);
const rupees = (r: number) => Math.round(r) * 100;

// ── reference data ──
const CATEGORIES = [
  ['Screws', 'screw'],
  ['Plates', 'plate'],
  ['Intramedullary Nails', 'nail'],
  ['K-Wires & Pins', 'wire'],
  ['External Fixators', 'fixator'],
  ['Drivers & Instruments', 'instrument'],
  ['Operation Kits', 'kit'],
  ['Arthroplasty', 'joint'],
  ['Spine', 'spine'],
  ['Consumables', 'consumable'],
] as const;

const BRANDS = [
  { name: 'Diamond Ortho Line', country: 'India' },
  { name: 'Narmada Surgical', country: 'India' },
  { name: 'Malwa Medi-Tech', country: 'India' },
  { name: 'Orthomax Instruments', country: 'India' },
];

const MATERIALS = [
  { name: 'Stainless Steel SS 316L', code: 'SS' },
  { name: 'Titanium Ti-6Al-4V', code: 'TI' },
  { name: 'Cobalt Chrome', code: 'CC' },
  { name: 'PEEK', code: 'PK' },
];

type Mat = 'SS' | 'TI' | 'CC' | 'PK';

interface ProductDef {
  name: string;
  cat: (typeof CATEGORIES)[number][0];
  brand: number; // index into BRANDS
  sku: string; // SKU prefix
  desc: string;
  hsn: string;
  gst: number;
  sterile?: boolean;
  tags: string[];
  mats?: Mat[];
  diameterMm?: number[];
  lengthMm?: number[];
  holes?: number[];
  side?: ('L' | 'R')[];
  angle?: number[];
  threadType?: string;
  /** base price in rupees for the smallest variant (SS) */
  price: number;
  /** extra rupees per step of length / holes / diameter */
  step?: number;
}

const IMPLANT = { hsn: '9021', gst: 5 };
const INSTRUMENT = { hsn: '9018', gst: 12 };

const PRODUCTS: ProductDef[] = [
  // ── Screws ──
  { name: '2.7mm Cortical Screw', cat: 'Screws', brand: 0, sku: 'CS27', desc: 'Self-tapping cortical screw, hex head, for small fragment fixation.', ...IMPLANT, tags: ['cortical', 'small fragment'], mats: ['SS', 'TI'], diameterMm: [2.7], lengthMm: range(10, 30, 2), threadType: 'Cortical', price: 140, step: 4 },
  { name: '3.5mm Cortical Screw', cat: 'Screws', brand: 0, sku: 'CS35', desc: 'Self-tapping cortical screw for 3.5 mm plates (DCP / LCP combi holes).', ...IMPLANT, tags: ['cortical', 'small fragment'], mats: ['SS', 'TI'], diameterMm: [3.5], lengthMm: range(10, 50, 2), threadType: 'Cortical', price: 160, step: 4 },
  { name: '4.5mm Cortical Screw', cat: 'Screws', brand: 0, sku: 'CS45', desc: 'Cortical screw for 4.5 mm large fragment plates.', ...IMPLANT, tags: ['cortical', 'large fragment'], mats: ['SS', 'TI'], diameterMm: [4.5], lengthMm: range(20, 60, 2), threadType: 'Cortical', price: 210, step: 5 },
  { name: '4.0mm Cancellous Screw (Partial Thread)', cat: 'Screws', brand: 1, sku: 'CC40', desc: 'Partially threaded cancellous screw for metaphyseal bone.', ...IMPLANT, tags: ['cancellous', 'lag'], mats: ['SS'], diameterMm: [4.0], lengthMm: range(20, 50, 5), threadType: 'Cancellous partial', price: 190, step: 6 },
  { name: '6.5mm Cancellous Screw 32mm Thread', cat: 'Screws', brand: 1, sku: 'CC65', desc: 'Large cancellous lag screw, 32 mm thread length.', ...IMPLANT, tags: ['cancellous', 'lag', 'large fragment'], mats: ['SS', 'TI'], diameterMm: [6.5], lengthMm: range(50, 100, 5), threadType: 'Cancellous 32mm', price: 320, step: 8 },
  { name: '3.5mm Locking Screw', cat: 'Screws', brand: 0, sku: 'LS35', desc: 'Self-tapping locking head screw for 3.5 mm LCP plates, T15 star drive.', ...IMPLANT, tags: ['locking', 'small fragment'], mats: ['SS', 'TI'], diameterMm: [3.5], lengthMm: range(10, 50, 2), threadType: 'Locking', price: 420, step: 6 },
  { name: '2.7mm Locking Screw', cat: 'Screws', brand: 0, sku: 'LS27', desc: 'Locking screw for 2.7 mm distal radius and hand plates.', ...IMPLANT, tags: ['locking', 'distal radius'], mats: ['TI'], diameterMm: [2.7], lengthMm: range(10, 26, 2), threadType: 'Locking', price: 460, step: 6 },
  { name: '5.0mm Locking Screw', cat: 'Screws', brand: 0, sku: 'LS50', desc: 'Locking screw for 4.5/5.0 mm large fragment LCP plates.', ...IMPLANT, tags: ['locking', 'large fragment'], mats: ['SS', 'TI'], diameterMm: [5.0], lengthMm: range(20, 60, 4), threadType: 'Locking', price: 560, step: 8 },
  { name: '4.0mm Cannulated Screw', cat: 'Screws', brand: 2, sku: 'CN40', desc: 'Cannulated cancellous screw over 1.25 mm guide wire.', ...IMPLANT, tags: ['cannulated'], mats: ['SS', 'TI'], diameterMm: [4.0], lengthMm: range(20, 50, 5), threadType: 'Cannulated', price: 650, step: 10 },
  { name: '7.0mm Cannulated Screw', cat: 'Screws', brand: 2, sku: 'CN70', desc: 'Large cannulated screw for femoral neck fixation, over 2.8 mm guide wire.', ...IMPLANT, tags: ['cannulated', 'femoral neck'], mats: ['SS', 'TI'], diameterMm: [7.0], lengthMm: range(70, 110, 5), threadType: 'Cannulated', price: 980, step: 15 },
  { name: '4.5mm Malleolar Screw', cat: 'Screws', brand: 1, sku: 'MS45', desc: 'Malleolar screw with trocar tip for medial malleolus fixation.', ...IMPLANT, tags: ['malleolar', 'ankle'], mats: ['SS'], diameterMm: [4.5], lengthMm: range(30, 60, 5), threadType: 'Cancellous', price: 240, step: 6 },
  { name: '3.0mm Headless Compression Screw', cat: 'Screws', brand: 2, sku: 'HC30', desc: 'Headless cannulated compression screw for scaphoid and small bone fractures.', ...IMPLANT, sterile: true, tags: ['headless', 'scaphoid'], mats: ['TI'], diameterMm: [3.0], lengthMm: range(16, 30, 2), threadType: 'Differential pitch', price: 2800, step: 40 },
  { name: '4.9mm Interlocking Bolt', cat: 'Screws', brand: 1, sku: 'IB49', desc: 'Interlocking bolt for tibial and femoral nails.', ...IMPLANT, tags: ['interlocking', 'nail'], mats: ['SS', 'TI'], diameterMm: [4.9], lengthMm: range(30, 80, 5), threadType: 'Cortical', price: 380, step: 6 },

  // ── Plates ──
  { name: '3.5mm LCP Narrow Plate', cat: 'Plates', brand: 0, sku: 'LCP35', desc: 'Locking compression plate with combi holes, small fragment.', ...IMPLANT, tags: ['lcp', 'locking', 'small fragment'], mats: ['SS', 'TI'], holes: [4, 5, 6, 7, 8, 9, 10, 12], price: 2400, step: 250 },
  { name: '4.5mm LCP Broad Plate', cat: 'Plates', brand: 0, sku: 'LCP45B', desc: 'Broad locking compression plate for femoral shaft.', ...IMPLANT, tags: ['lcp', 'locking', 'large fragment', 'femur'], mats: ['SS', 'TI'], holes: [6, 8, 10, 12, 14], price: 4200, step: 400 },
  { name: '4.5mm LCP Narrow Plate', cat: 'Plates', brand: 0, sku: 'LCP45N', desc: 'Narrow locking compression plate for tibia and humerus shaft.', ...IMPLANT, tags: ['lcp', 'locking', 'large fragment'], mats: ['SS', 'TI'], holes: [6, 7, 8, 9, 10, 12], price: 3800, step: 350 },
  { name: '3.5mm DCP Plate', cat: 'Plates', brand: 1, sku: 'DCP35', desc: 'Dynamic compression plate, small fragment.', ...IMPLANT, tags: ['dcp', 'small fragment'], mats: ['SS'], holes: [4, 5, 6, 7, 8, 10], price: 900, step: 90 },
  { name: '4.5mm DCP Narrow Plate', cat: 'Plates', brand: 1, sku: 'DCP45', desc: 'Dynamic compression plate, large fragment.', ...IMPLANT, tags: ['dcp', 'large fragment'], mats: ['SS'], holes: [6, 7, 8, 9, 10, 12], price: 1300, step: 120 },
  { name: '3.5mm Reconstruction Plate', cat: 'Plates', brand: 1, sku: 'REC35', desc: 'Contourable reconstruction plate for pelvis, acetabulum and clavicle.', ...IMPLANT, tags: ['reconstruction', 'pelvis'], mats: ['SS', 'TI'], holes: [6, 8, 10, 12], price: 1600, step: 180 },
  { name: '3.5mm T-Plate', cat: 'Plates', brand: 1, sku: 'TP35', desc: 'T-buttress plate for distal radius and tibial plateau.', ...IMPLANT, tags: ['t-plate', 'buttress'], mats: ['SS'], holes: [3, 4, 5, 6], price: 1100, step: 100 },
  { name: '4.5mm L-Buttress Plate', cat: 'Plates', brand: 1, sku: 'LB45', desc: 'L-shaped buttress plate for lateral tibial plateau.', ...IMPLANT, tags: ['l-plate', 'buttress', 'tibia'], mats: ['SS'], holes: [4, 5, 6, 8], side: ['L', 'R'], price: 1500, step: 120 },
  { name: 'One-Third Tubular Plate', cat: 'Plates', brand: 1, sku: 'OTT', desc: '3.5 mm one-third tubular plate for lateral malleolus.', ...IMPLANT, tags: ['tubular', 'ankle', 'fibula'], mats: ['SS'], holes: [4, 5, 6, 7, 8, 10], price: 650, step: 60 },
  { name: 'Distal Radius Volar Locking Plate', cat: 'Plates', brand: 0, sku: 'DRV', desc: 'Anatomical 2.7 mm volar locking plate for distal radius.', ...IMPLANT, tags: ['distal radius', 'locking', 'volar'], mats: ['TI'], holes: [3, 4, 5], side: ['L', 'R'], price: 7800, step: 600 },
  { name: 'Proximal Tibia Lateral Locking Plate', cat: 'Plates', brand: 0, sku: 'PTL', desc: 'Anatomical lateral locking plate for proximal tibia fractures.', ...IMPLANT, tags: ['tibia', 'locking', 'plateau'], mats: ['SS', 'TI'], holes: [5, 7, 9, 11], side: ['L', 'R'], price: 8500, step: 700 },
  { name: 'Proximal Humerus Locking Plate', cat: 'Plates', brand: 0, sku: 'PHL', desc: 'Anatomical locking plate for proximal humerus fractures.', ...IMPLANT, tags: ['humerus', 'locking', 'shoulder'], mats: ['SS', 'TI'], holes: [3, 5, 8], price: 8200, step: 800 },
  { name: 'Distal Femur Locking Plate', cat: 'Plates', brand: 0, sku: 'DFL', desc: 'Anatomical lateral locking plate for distal femur.', ...IMPLANT, tags: ['femur', 'locking', 'knee'], mats: ['SS', 'TI'], holes: [6, 9, 11, 13], side: ['L', 'R'], price: 11500, step: 900 },
  { name: 'Clavicle Superior Locking Plate', cat: 'Plates', brand: 2, sku: 'CLV', desc: 'Pre-contoured S-shaped superior clavicle locking plate.', ...IMPLANT, tags: ['clavicle', 'locking'], mats: ['TI'], holes: [6, 7, 8], side: ['L', 'R'], price: 6900, step: 500 },
  { name: 'Calcaneal Locking Plate', cat: 'Plates', brand: 2, sku: 'CAL', desc: 'Low-profile calcaneal locking plate.', ...IMPLANT, tags: ['calcaneus', 'locking', 'foot'], mats: ['TI'], holes: [0], side: ['L', 'R'], price: 9800 },
  { name: '2.0mm Mini Plate Straight', cat: 'Plates', brand: 2, sku: 'MP20', desc: 'Mini fragment plate for hand and maxillofacial fixation.', ...IMPLANT, tags: ['mini', 'hand'], mats: ['TI'], holes: [4, 6, 8], price: 1200, step: 150 },

  // ── Intramedullary nails ──
  { name: 'Tibial Interlocking Nail', cat: 'Intramedullary Nails', brand: 1, sku: 'TIN', desc: 'Cannulated tibial interlocking nail with proximal bend.', ...IMPLANT, tags: ['nail', 'tibia', 'interlocking'], mats: ['SS', 'TI'], diameterMm: [8, 9, 10, 11], lengthMm: range(280, 380, 20), price: 5200, step: 150 },
  { name: 'Femoral Interlocking Nail', cat: 'Intramedullary Nails', brand: 1, sku: 'FIN', desc: 'Antegrade femoral interlocking nail.', ...IMPLANT, tags: ['nail', 'femur', 'interlocking'], mats: ['SS', 'TI'], diameterMm: [9, 10, 11, 12], lengthMm: range(340, 440, 20), price: 6800, step: 180 },
  { name: 'Proximal Femoral Nail (PFN)', cat: 'Intramedullary Nails', brand: 0, sku: 'PFN', desc: 'Short proximal femoral nail with hip and anti-rotation screws, for intertrochanteric fractures.', ...IMPLANT, tags: ['pfn', 'femur', 'intertrochanteric', 'hip'], mats: ['SS', 'TI'], diameterMm: [9, 10, 11], lengthMm: [240, 250], angle: [130, 135], price: 9500, step: 250 },
  { name: 'Humeral Interlocking Nail', cat: 'Intramedullary Nails', brand: 1, sku: 'HIN', desc: 'Antegrade humeral interlocking nail.', ...IMPLANT, tags: ['nail', 'humerus'], mats: ['SS', 'TI'], diameterMm: [7, 8], lengthMm: range(220, 280, 20), price: 5600, step: 150 },
  { name: 'Titanium Elastic Nail (TENS)', cat: 'Intramedullary Nails', brand: 2, sku: 'TEN', desc: 'Flexible titanium elastic nail for paediatric long-bone fractures.', ...IMPLANT, sterile: true, tags: ['elastic', 'paediatric', 'tens'], mats: ['TI'], diameterMm: [2.0, 2.5, 3.0, 3.5, 4.0], lengthMm: [440], price: 1900, step: 100 },

  // ── K-wires & pins ──
  { name: 'K-Wire Smooth Trocar Tip', cat: 'K-Wires & Pins', brand: 3, sku: 'KW', desc: 'Kirschner wire, smooth, trocar tip both ends.', ...IMPLANT, sterile: true, tags: ['k-wire'], mats: ['SS'], diameterMm: [1.0, 1.2, 1.5, 1.8, 2.0, 2.5], lengthMm: [150, 250], price: 45, step: 8 },
  { name: 'K-Wire Threaded Tip', cat: 'K-Wires & Pins', brand: 3, sku: 'KWT', desc: 'Kirschner wire with threaded tip for better purchase.', ...IMPLANT, sterile: true, tags: ['k-wire', 'threaded'], mats: ['SS'], diameterMm: [1.5, 1.8, 2.0], lengthMm: [150, 250], price: 70, step: 10 },
  { name: 'Steinmann Pin', cat: 'K-Wires & Pins', brand: 3, sku: 'STP', desc: 'Steinmann pin for skeletal traction.', ...IMPLANT, tags: ['pin', 'traction'], mats: ['SS'], diameterMm: [3.0, 4.0, 5.0], lengthMm: [225], price: 160, step: 30 },
  { name: 'Schanz Pin Self-Drilling', cat: 'K-Wires & Pins', brand: 3, sku: 'SCH', desc: 'Self-drilling Schanz pin for external fixation.', ...IMPLANT, tags: ['schanz', 'external fixation'], mats: ['SS'], diameterMm: [4.0, 5.0, 6.0], lengthMm: [150, 200], price: 380, step: 40 },
  { name: 'Cerclage Wire Coil', cat: 'K-Wires & Pins', brand: 3, sku: 'CW', desc: 'Stainless steel cerclage / tension band wire coil, 10 m.', ...IMPLANT, sterile: true, tags: ['cerclage', 'tension band', 'patella'], mats: ['SS'], diameterMm: [0.8, 1.0, 1.2], price: 450, step: 60 },

  // ── External fixators ──
  { name: 'External Fixator Rod 11mm', cat: 'External Fixators', brand: 3, sku: 'EFR', desc: 'Carbon-steel tubular rod for AO-type external fixator.', ...IMPLANT, tags: ['external fixator', 'rod'], mats: ['SS'], diameterMm: [11], lengthMm: range(200, 400, 50), price: 950, step: 120 },
  { name: 'Pin-to-Rod Clamp', cat: 'External Fixators', brand: 3, sku: 'PRC', desc: 'Universal pin-to-rod clamp for 11 mm rods.', ...IMPLANT, tags: ['external fixator', 'clamp'], mats: ['SS'], price: 1350 },
  { name: 'Rod-to-Rod Clamp', cat: 'External Fixators', brand: 3, sku: 'RRC', desc: 'Rod-to-rod clamp for 11 mm rods.', ...IMPLANT, tags: ['external fixator', 'clamp'], mats: ['SS'], price: 1450 },
  { name: 'Ilizarov Full Ring', cat: 'External Fixators', brand: 3, sku: 'ILR', desc: 'Ilizarov full ring for circular external fixation.', ...IMPLANT, tags: ['ilizarov', 'ring'], mats: ['SS'], diameterMm: [140, 160, 180], price: 2200, step: 200 },

  // ── Drivers & instruments ──
  { name: 'Hexagonal Screwdriver', cat: 'Drivers & Instruments', brand: 3, sku: 'HSD', desc: 'Hex screwdriver with quick-coupling handle.', ...INSTRUMENT, tags: ['driver', 'instrument'], mats: ['SS'], diameterMm: [2.5, 3.5], price: 1800, step: 300 },
  { name: 'Torque Limiting Screwdriver T15', cat: 'Drivers & Instruments', brand: 3, sku: 'TLS', desc: 'Torque limiting handle for locking screws (1.5 Nm / 4 Nm).', ...INSTRUMENT, tags: ['driver', 'torque', 'locking'], mats: ['SS'], angle: [1.5, 4], price: 6500, step: 900 },
  { name: 'Depth Gauge', cat: 'Drivers & Instruments', brand: 3, sku: 'DG', desc: 'Depth gauge for small (up to 60 mm) and large (up to 110 mm) screws.', ...INSTRUMENT, tags: ['depth gauge', 'instrument'], mats: ['SS'], lengthMm: [60, 110], price: 1500, step: 400 },
  { name: 'Drill Bit Quick Coupling', cat: 'Drivers & Instruments', brand: 3, sku: 'DB', desc: 'Calibrated drill bit with AO quick coupling.', ...INSTRUMENT, tags: ['drill bit'], mats: ['SS'], diameterMm: [2.0, 2.5, 2.7, 3.2, 3.5, 4.5], lengthMm: [110, 145], price: 650, step: 60 },
  { name: 'Drill Sleeve Double', cat: 'Drivers & Instruments', brand: 3, sku: 'DS', desc: 'Double drill guide for 3.5 / 2.5 mm and 4.5 / 3.2 mm.', ...INSTRUMENT, tags: ['drill guide'], mats: ['SS'], diameterMm: [3.5, 4.5], price: 900, step: 150 },
  { name: 'Bone Tap', cat: 'Drivers & Instruments', brand: 3, sku: 'BT', desc: 'Tap for cortical screws.', ...INSTRUMENT, tags: ['tap'], mats: ['SS'], diameterMm: [3.5, 4.5], price: 850, step: 150 },
  { name: 'Bone Holding Forceps Self-Centering', cat: 'Drivers & Instruments', brand: 3, sku: 'BHF', desc: 'Self-centering bone holding forceps.', ...INSTRUMENT, tags: ['forceps'], mats: ['SS'], lengthMm: [170, 200], price: 2400, step: 400 },
  { name: 'Plate Bending Iron (Pair)', cat: 'Drivers & Instruments', brand: 3, sku: 'PBI', desc: 'Pair of bending irons for 3.5 / 4.5 mm plates.', ...INSTRUMENT, tags: ['bender'], mats: ['SS'], price: 3200 },

  // ── Arthroplasty ──
  { name: 'Austin Moore Prosthesis', cat: 'Arthroplasty', brand: 1, sku: 'AMP', desc: 'Uncemented Austin Moore hemiarthroplasty prosthesis.', ...IMPLANT, sterile: true, tags: ['hemiarthroplasty', 'hip'], mats: ['SS'], diameterMm: range(38, 55, 1), price: 3800, step: 40 },
  { name: 'Bipolar Head', cat: 'Arthroplasty', brand: 0, sku: 'BPH', desc: 'Bipolar head for hip hemiarthroplasty, 28 mm inner.', ...IMPLANT, sterile: true, tags: ['bipolar', 'hip'], mats: ['CC'], diameterMm: range(40, 55, 1), price: 14500, step: 150 },
  { name: 'Cemented Femoral Stem', cat: 'Arthroplasty', brand: 0, sku: 'CFS', desc: 'Polished tapered cemented femoral stem.', ...IMPLANT, sterile: true, tags: ['stem', 'hip', 'cemented'], mats: ['SS'], lengthMm: [130, 140, 150, 160], price: 12500, step: 300 },

  // ── Spine ──
  { name: 'Polyaxial Pedicle Screw', cat: 'Spine', brand: 2, sku: 'PPS', desc: 'Polyaxial pedicle screw for 5.5 mm rod system.', ...IMPLANT, sterile: true, tags: ['pedicle screw', 'spine'], mats: ['TI'], diameterMm: [5.5, 6.5], lengthMm: range(35, 55, 5), price: 3900, step: 60 },
  { name: 'Spinal Rod 5.5mm', cat: 'Spine', brand: 2, sku: 'SR55', desc: 'Pre-cut straight titanium rod for 5.5 mm system.', ...IMPLANT, sterile: true, tags: ['rod', 'spine'], mats: ['TI'], diameterMm: [5.5], lengthMm: [100, 200, 300, 500], price: 2400, step: 600 },
  { name: 'Lumbar Interbody Cage (TLIF)', cat: 'Spine', brand: 2, sku: 'TLIF', desc: 'PEEK TLIF interbody fusion cage.', ...IMPLANT, sterile: true, tags: ['cage', 'tlif', 'spine'], mats: ['PK'], lengthMm: [26, 30], holes: [0], angle: [0, 5], price: 11500, step: 500 },

  // ── Consumables ──
  { name: 'Bone Cement 40g', cat: 'Consumables', brand: 1, sku: 'BCM', desc: 'Radiopaque PMMA bone cement, 40 g pack with liquid monomer.', hsn: '3006', gst: 12, sterile: true, tags: ['cement', 'pmma'], price: 2400 },
  { name: 'Bone Cement with Gentamicin 40g', cat: 'Consumables', brand: 1, sku: 'BCG', desc: 'Antibiotic-loaded PMMA bone cement, 40 g.', hsn: '3006', gst: 12, sterile: true, tags: ['cement', 'antibiotic'], price: 3900 },
  { name: 'Synthetic Bone Graft Granules', cat: 'Consumables', brand: 2, sku: 'BGS', desc: 'Beta-TCP bone graft substitute granules.', hsn: '9021', gst: 5, sterile: true, tags: ['bone graft'], lengthMm: [5, 10], price: 4500, step: 3500 },
  { name: 'Closed Wound Suction Drain Set', cat: 'Consumables', brand: 3, sku: 'DRN', desc: 'Closed wound suction drain with 400 ml reservoir.', hsn: '9018', gst: 12, sterile: true, tags: ['drain'], diameterMm: [12, 14, 16], price: 480, step: 20 },
  { name: 'Bone Wax 2.5g', cat: 'Consumables', brand: 3, sku: 'BWX', desc: 'Sterile bone wax for haemostasis, 2.5 g foil (box of 12).', hsn: '3006', gst: 12, sterile: true, tags: ['bone wax'], price: 1100 },
];

interface VariantRow {
  sku: string;
  attributes: Record<string, unknown>;
  mat: Mat;
  pricePaise: number;
}

function buildVariants(p: ProductDef): VariantRow[] {
  const mats = p.mats ?? ['SS'];
  const dia = p.diameterMm ?? [undefined];
  const len = p.lengthMm ?? [undefined];
  const holes = p.holes ?? [undefined];
  const side = p.side ?? [undefined];
  const angle = p.angle ?? [undefined];
  const rows: VariantRow[] = [];
  for (const m of mats)
    dia.forEach((d, di) =>
      len.forEach((l, li) =>
        holes.forEach((h, hi) =>
          for_(side, (s) =>
            angle.forEach((a, ai) => {
              const attributes: Record<string, unknown> = {};
              if (d !== undefined) attributes.diameterMm = d;
              if (l !== undefined) attributes.lengthMm = l;
              if (h !== undefined && h > 0) attributes.holes = h;
              if (s !== undefined) attributes.side = s;
              if (a !== undefined && a > 0) attributes.angle = a;
              if (p.threadType) attributes.threadType = p.threadType;
              const steps = di + li + hi + ai;
              const base = p.price + steps * (p.step ?? 0);
              const priceR = m === 'TI' && mats.length > 1 ? base * 1.9 : base;
              const parts = [
                p.sku,
                d !== undefined ? (d < 7 ? d.toFixed(1) : String(d)).replace('.', '') : null,
                l !== undefined ? `L${l}` : null,
                h ? `${h}H` : null,
                s ?? null,
                a ? `A${String(a).replace('.', '')}` : null,
                m,
              ].filter(Boolean);
              rows.push({ sku: parts.join('-'), attributes, mat: m, pricePaise: rupees(priceR) });
            }),
          ),
        ),
      ),
    );
  return rows;
}
function for_<T>(arr: T[], fn: (v: T) => void) {
  arr.forEach(fn);
}

/** Human label used for kit/template lookups and logs. */
const lookup = new Map<string, string>(); // sku -> variantId

async function wipe() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
}

async function main() {
  console.log('Seeding Ortho Diamond…');
  await wipe();

  // ── categories, brands, materials ──
  const catId = new Map<string, string>();
  for (const [i, [name, icon]] of CATEGORIES.entries()) {
    const c = await prisma.category.create({ data: { name, slug: slugify(name), icon, sortOrder: i + 1 } });
    catId.set(name, c.id);
  }
  const brandIds: string[] = [];
  for (const b of BRANDS) brandIds.push((await prisma.brand.create({ data: b })).id);
  const matId = new Map<string, string>();
  for (const m of MATERIALS) matId.set(m.code, (await prisma.material.create({ data: m })).id);

  // ── products, variants, stock ──
  let variantCount = 0;
  const zeroStock: string[] = [];
  const expiringBatches: string[] = [];
  const allBatches: Prisma.StockBatchCreateManyInput[] = [];

  for (const [pi, p] of PRODUCTS.entries()) {
    const product = await prisma.product.create({
      data: {
        name: p.name,
        slug: slugify(p.name),
        categoryId: catId.get(p.cat)!,
        brandId: brandIds[p.brand],
        description: p.desc,
        images: [],
        hsnCode: p.hsn,
        gstPercent: p.gst,
        isSterile: p.sterile ?? false,
        tags: p.tags,
      },
    });
    const variants = buildVariants(p);
    await prisma.productVariant.createMany({
      data: variants.map((v) => ({
        sku: v.sku,
        productId: product.id,
        attributes: v.attributes as Prisma.InputJsonValue,
        materialId: matId.get(v.mat),
        pricePaise: v.pricePaise,
        mrpPaise: Math.round((v.pricePaise * 1.25) / 100) * 100,
        lowStockThreshold: p.cat === 'Screws' ? 10 : 3,
        barcode: `890${String(pi + 1).padStart(3, '0')}${String(variantCount + variants.indexOf(v)).padStart(6, '0')}`,
      })),
    });
    const created = await prisma.productVariant.findMany({ where: { productId: product.id }, select: { id: true, sku: true } });
    created.sort((a, b) => a.sku.localeCompare(b.sku));
    for (const v of created) lookup.set(v.sku, v.id);
    variantCount += created.length;

    created.forEach((v, vi) => {
      // Every 6th product: its last variant is out of stock (>= 8 zero-stock variants overall).
      if (pi % 6 === 0 && vi === created.length - 1) {
        zeroStock.push(v.sku);
        return;
      }
      const lots = rand() < 0.3 ? 2 : 1;
      for (let l = 0; l < lots; l++) {
        allBatches.push({
          variantId: v.id,
          lotNo: `LOT${String(24 + l)}${String(randInt(1000, 9999))}`,
          qty: p.cat === 'Screws' || p.cat === 'K-Wires & Pins' ? randInt(6, 60) : randInt(1, 12),
          expiryDate: p.sterile ? days(randInt(200, 1400)) : null,
          receivedAt: days(-randInt(10, 240)),
          supplier: BRANDS[p.brand]!.name,
        });
      }
    });
  }

  // 3 sterile batches expiring within 60 days
  const sterileIdx = allBatches.map((b, i) => (b.expiryDate ? i : -1)).filter((i) => i >= 0);
  [20, 35, 52].forEach((d, k) => {
    const idx = sterileIdx[k * 7]!;
    allBatches[idx]!.expiryDate = days(d);
    expiringBatches.push(allBatches[idx]!.lotNo);
  });
  await prisma.stockBatch.createMany({ data: allBatches, skipDuplicates: true });

  const sku = (s: string) => {
    const id = lookup.get(s);
    if (!id) throw new Error(`Seed SKU not found: ${s}`);
    return id;
  };

  // ── hospitals (Indore) ──
  const hospitals = await Promise.all(
    [
      { name: 'City Hospital', address: 'Scheme No. 54, Vijay Nagar, Indore, MP 452010', lat: 22.7533, lng: 75.8937, otContactName: 'Sister Kavita Sharma', otContactPhone: '+919000000101', gstin: '23AAACC1234A1Z5', creditLimitPaise: rupees(500000), paymentTermsDays: 30 },
      { name: 'Indore Trauma & Ortho Centre', address: 'AB Road, Near Palasia Square, Indore, MP 452001', lat: 22.7242, lng: 75.8862, otContactName: 'Mr. Sunil Patidar', otContactPhone: '+919000000102', gstin: '23AAACI5678B1Z2', creditLimitPaise: rupees(300000), paymentTermsDays: 45 },
      { name: 'Malwa Multispeciality Hospital', address: 'Ring Road, Bhawarkuan, Indore, MP 452014', lat: 22.6928, lng: 75.8675, otContactName: 'Sister Rekha Yadav', otContactPhone: '+919000000103', gstin: null, creditLimitPaise: rupees(200000), paymentTermsDays: 30 },
    ].map((h) => prisma.hospital.create({ data: h })),
  );
  const [city, trauma, malwa] = hospitals as [typeof hospitals[0], typeof hospitals[0], typeof hospitals[0]];

  // ── users ──
  const owner = await prisma.user.create({ data: { phone: '+919000000001', name: 'Owner — Ortho Diamond', email: 'owner@orthodiamond.local', role: 'SUPER_ADMIN' } });
  await prisma.user.create({ data: { phone: '+919000000002', name: 'Pooja Malviya', email: 'staff@orthodiamond.local', role: 'STAFF' } });

  const doctors = [
    { phone: '+919000000011', fullName: 'Dr. Rajesh Verma', email: 'rajesh.verma@example.com', specialisation: 'Orthopaedic Surgery (MS Ortho)', councilRegNo: 'MP-12345', status: 'APPROVED' as const, hospitals: [city.id, trauma.id] },
    { phone: '+919000000012', fullName: 'Dr. Neha Joshi', email: 'neha.joshi@example.com', specialisation: 'Orthopaedic Trauma (DNB Ortho)', councilRegNo: 'MP-23456', status: 'APPROVED' as const, hospitals: [trauma.id, malwa.id] },
    { phone: '+919000000013', fullName: 'Dr. Amit Choudhary', email: 'amit.choudhary@example.com', specialisation: 'Orthopaedic Surgery (D Ortho)', councilRegNo: 'MP-34567', status: 'PENDING' as const, hospitals: [malwa.id] },
  ];
  for (const d of doctors) {
    await prisma.user.create({
      data: {
        phone: d.phone,
        name: d.fullName,
        email: d.email,
        role: 'DOCTOR',
        doctor: {
          create: {
            fullName: d.fullName,
            email: d.email,
            specialisation: d.specialisation,
            councilRegNo: d.councilRegNo,
            stateCouncil: 'Madhya Pradesh Medical Council',
            status: d.status,
            reviewedById: d.status === 'APPROVED' ? owner.id : null,
            reviewedAt: d.status === 'APPROVED' ? days(-30) : null,
            hospitals: { create: d.hospitals.map((hospitalId) => ({ hospitalId })) },
          },
        },
      },
    });
  }

  for (const a of [
    { phone: '+919000000021', name: 'Ravi Kushwah', vehicleNo: 'MP09 AB 1234', lat: 22.7196, lng: 75.8577 },
    { phone: '+919000000022', name: 'Imran Khan', vehicleNo: 'MP09 CD 5678', lat: 22.7279, lng: 75.8723 },
  ]) {
    await prisma.user.create({
      data: {
        phone: a.phone,
        name: a.name,
        role: 'DELIVERY_AGENT',
        deliveryAgent: { create: { vehicleNo: a.vehicleNo, lastLat: a.lat, lastLng: a.lng, lastSeenAt: new Date() } },
      },
    });
  }

  // Hospital purchase desk (approved buyer belongs to City Hospital)
  await prisma.user.create({ data: { phone: '+919000000031', name: 'City Hospital Purchase Desk', role: 'HOSPITAL_PURCHASE', hospitalId: city.id } });

  // ── operation kits (6, 2 LOAN) ──
  const kitDefs = [
    {
      name: 'Small Fragment Set', type: 'LOAN' as const, physicalSets: 2, rental: 3500, sale: 0,
      description: 'Loan set: 3.5 mm cortical & locking screws, 3.5 mm LCP/DCP plates and instruments in a sterilisable tray.',
      contents: [
        ...range(12, 40, 2).map((l) => [`CS35-35-L${l}-SS`, 6] as const),
        ...range(12, 40, 2).map((l) => [`LS35-35-L${l}-SS`, 6] as const),
        ['LCP35-6H-SS', 2], ['LCP35-8H-SS', 2], ['DCP35-6H-SS', 2], ['OTT-6H-SS', 2],
        ['DB-27-L110-SS', 2], ['DB-35-L110-SS', 1], ['HSD-35-SS', 1], ['DG-L60-SS', 1], ['DS-35-SS', 1], ['BT-35-SS', 1], ['TLS-A15-SS', 1],
      ],
    },
    {
      name: 'Large Fragment Set', type: 'LOAN' as const, physicalSets: 1, rental: 4500, sale: 0,
      description: 'Loan set: 4.5 mm cortical, 5.0 mm locking and 6.5 mm cancellous screws, 4.5 mm plates and instruments.',
      contents: [
        ...range(24, 50, 2).map((l) => [`CS45-45-L${l}-SS`, 4] as const),
        ...range(24, 52, 4).map((l) => [`LS50-50-L${l}-SS`, 4] as const),
        ['CC65-65-L70-SS', 2], ['CC65-65-L80-SS', 2],
        ['LCP45N-8H-SS', 2], ['LCP45B-10H-SS', 1], ['DCP45-8H-SS', 2],
        ['DB-32-L145-SS', 2], ['DB-45-L145-SS', 1], ['HSD-35-SS', 1], ['DG-L110-SS', 1], ['DS-45-SS', 1], ['BT-45-SS', 1], ['PBI-SS', 1],
      ],
    },
    {
      name: 'Distal Radius Kit', type: 'SALE' as const, physicalSets: 6, rental: 0, sale: 0,
      description: 'Sterile-packed distal radius volar plating kit (right).',
      contents: [['DRV-4H-R-TI', 1], ['LS27-27-L18-TI', 4], ['LS27-27-L20-TI', 3], ['CS27-27-L14-TI', 2], ['KW-15-L150-SS', 2]],
    },
    {
      name: 'Tibial Nailing Kit', type: 'SALE' as const, physicalSets: 4, rental: 0, sale: 0,
      description: 'Tibial interlocking nail 9 x 340 mm with distal and proximal bolts.',
      contents: [['TIN-9-L340-SS', 1], ['IB49-49-L35-SS', 2], ['IB49-49-L40-SS', 2], ['IB49-49-L45-SS', 1]],
    },
    {
      name: 'PFN Hip Kit', type: 'SALE' as const, physicalSets: 4, rental: 0, sale: 0,
      description: 'Proximal femoral nail 10 x 250 mm 130° with distal bolts.',
      contents: [['PFN-10-L250-A130-SS', 1], ['IB49-49-L35-SS', 1], ['IB49-49-L40-SS', 1]],
    },
    {
      name: 'Tension Band Wiring Kit', type: 'SALE' as const, physicalSets: 8, rental: 0, sale: 0,
      description: 'K-wires and cerclage wire for patella / olecranon tension band wiring.',
      contents: [['KW-18-L250-SS', 2], ['KW-20-L250-SS', 2], ['CW-10-SS', 1]],
    },
  ];

  const kitIds = new Map<string, string>();
  for (const k of kitDefs) {
    const contents = k.contents.map(([s, qty]) => ({ variantId: sku(String(s)), qty: Number(qty) }));
    let salePricePaise = rupees(k.sale);
    if (k.type === 'SALE') {
      const prices = await prisma.productVariant.findMany({ where: { id: { in: contents.map((c) => c.variantId) } }, select: { id: true, pricePaise: true } });
      const sum = contents.reduce((acc, c) => acc + (prices.find((p) => p.id === c.variantId)?.pricePaise ?? 0) * c.qty, 0);
      salePricePaise = Math.round((sum * 0.95) / 100) * 100; // 5% kit discount
    }
    const kit = await prisma.operationKit.create({
      data: {
        name: k.name,
        slug: slugify(k.name),
        description: k.description,
        type: k.type,
        trayPhotos: [],
        rentalChargePaise: rupees(k.rental),
        salePricePaise,
        physicalSets: k.physicalSets,
        sterilisationStatus: k.type === 'LOAN' ? 'STERILE' : 'NOT_REQUIRED',
        contents: { create: contents },
      },
    });
    kitIds.set(k.name, kit.id);
  }

  // ── procedure templates (5) ──
  const templates = [
    { name: 'Distal Radius ORIF', description: 'Volar locking plate fixation of distal radius fracture.', kit: 'Distal Radius Kit', items: [['DRV-4H-R-TI', 1], ['LS27-27-L18-TI', 4], ['LS27-27-L20-TI', 3], ['CS27-27-L14-TI', 2]] },
    { name: 'Bimalleolar Ankle ORIF', description: 'One-third tubular plate for fibula + malleolar screws for medial malleolus.', kit: 'Small Fragment Set', items: [['OTT-6H-SS', 1], ['CS35-35-L14-SS', 4], ['CS35-35-L16-SS', 2], ['CC40-40-L35-SS', 1], ['MS45-45-L40-SS', 2]] },
    { name: 'Tibial Shaft IM Nailing', description: 'Interlocking nail for tibial shaft fracture.', kit: 'Tibial Nailing Kit', items: [['TIN-9-L340-SS', 1], ['IB49-49-L35-SS', 2], ['IB49-49-L40-SS', 2]] },
    { name: 'Intertrochanteric Fracture PFN', description: 'Proximal femoral nail for intertrochanteric femur fracture.', kit: 'PFN Hip Kit', items: [['PFN-10-L250-A130-SS', 1], ['IB49-49-L35-SS', 1]] },
    { name: 'Patella Tension Band Wiring', description: 'Two K-wires with figure-of-eight cerclage wire.', kit: 'Tension Band Wiring Kit', items: [['KW-18-L250-SS', 2], ['CW-10-SS', 1]] },
  ];
  for (const t of templates) {
    await prisma.procedureTemplate.create({
      data: {
        name: t.name,
        description: t.description,
        kitId: kitIds.get(t.kit),
        items: { create: t.items.map(([s, qty]) => ({ variantId: sku(s as string), qty: qty as number })) },
      },
    });
  }

  // ── owner WhatsApp + settings ──
  await prisma.ownerContact.create({ data: { name: 'Owner', whatsappNumber: '+919000000001', enabled: true } });
  await prisma.appSetting.createMany({
    data: [
      { key: 'business', value: { name: 'Ortho Diamond', city: 'Indore', address: 'Indore, Madhya Pradesh', gstin: '', supportPhone: '+919000000001' } },
      { key: 'orders', value: { orderNoPrefix: 'OD', emergencyAutoAlert: true, cancelAllowedUntil: 'PACKED' } },
      { key: 'kits', value: { defaultLoanDays: 3 } },
    ],
  });

  const totals = {
    categories: CATEGORIES.length,
    products: PRODUCTS.length,
    variants: variantCount,
    batches: allBatches.length,
    zeroStockVariants: zeroStock.length,
    expiringWithin60Days: expiringBatches.length,
    kits: kitDefs.length,
    templates: templates.length,
    hospitals: hospitals.length,
  };
  const demo = await seedDemo(prisma, path.resolve(__dirname, '..', process.env.UPLOAD_DIR ?? 'uploads'));
  console.table({ ...totals, orders: demo.historyAndToday, todaysLiveOrders: demo.today });
  console.log('Zero-stock SKUs:', zeroStock.join(', '));
  console.log('Login phones (OTP printed in backend log):');
  console.log('  Owner  9000000001 | Staff 9000000002 | Dr Verma 9000000011 (approved) | Dr Joshi 9000000012 (approved)');
  console.log('  Dr Choudhary 9000000013 (PENDING) | Agents 9000000021, 9000000022 | Hospital buyer 9000000031');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
