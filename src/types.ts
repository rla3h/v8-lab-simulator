// ───────────────────────── Provenance ─────────────────────────

/** How much a value can be trusted. Shown next to every spec in the UI. */
export type Confidence =
  | 'public-spec' // widely published manufacturer figure, not yet cross-checked against a primary source here
  | 'assumption' // modelling assumption chosen by V8 LAB, not a vehicle fact
  | 'unknown'; // not available — never filled with an invented value

export interface SpecValue<T> {
  value: T | null;
  confidence: Confidence;
  note?: string;
}

/** Audio provenance badge (spec §6-D). */
export type AudioProvenance = 'REFERENCE' | 'SIMULATED' | 'VALIDATED';

// ───────────────────────── Engines ─────────────────────────

export type Induction = 'NA' | 'turbo' | 'supercharger';

export interface EngineVoicing {
  /** Blowdown pulse length in crank degrees. */
  pulseWidthDeg: number;
  /** Turbulent flow noise riding on each pulse (0..1). */
  rasp: number;
  raspHz: number;
  /** Induction (intake) roar amount (0..1) and airbox resonance. */
  intakeRoar: number;
  intakeHz: number;
  /** Mechanical / valvetrain noise (0..1). */
  mech: number;
  /** Cycle-to-cycle variation at idle (0..0.2). */
  idleJitter: number;
  /** Fixed cylinder-to-cylinder amplitude spread (0..0.1). */
  cylSpread: number;
  /** Turbine pulse smoothing (turbo only, 0..1). */
  turboDamping?: number;
  /** Supercharger whine as a crank order, and its level (supercharger only). */
  whineOrder?: number;
  whineLevel?: number;
}

export interface EngineDef {
  id: string;
  manufacturer: string;
  code: string;
  application: string; // vehicle it is referenced from
  status: 'ready' | 'data-pending';
  displacementCc: SpecValue<number>;
  cylinders: number;
  layout: 'V' | 'inline' | 'flat';
  bankAngleDeg: SpecValue<number>;
  crank: SpecValue<'cross-plane' | 'flat-plane'>;
  firingOrder: SpecValue<number[]>;
  /** Bank of each cylinder number ('L' | 'R'), looking forward from the driver's seat. */
  bankOf: Record<number, 'L' | 'R'>;
  bankNote: string;
  /** Firing intervals in crank degrees; omitted = even firing (720 / cylinders). */
  firingIntervalsDeg?: number[];
  induction: Induction;
  boreMm: SpecValue<number>;
  strokeMm: SpecValue<number>;
  powerNote: SpecValue<string>;
  idleRpm: SpecValue<number>;
  redlineRpm: SpecValue<number>;
  /** Range the simulator actually uses (always an assumption unless verified). */
  sim: { idleRpm: number; maxRpm: number };
  voicing: EngineVoicing;
  voicingNote: string;
  stockExhaustId: string;
  sources: string[];
}

export interface VehicleDef {
  id: string;
  name: string;
  chassis: string;
  engineId: string;
  years: string;
  oemExhaustId: string;
  notes: string;
}

// ───────────────────────── Exhaust ─────────────────────────

export type PartKind =
  | 'pipe'
  | 'res-helmholtz'
  | 'res-absorptive'
  | 'quarter-wave'
  | 'muffler-chambered'
  | 'muffler-straight'
  | 'muffler-valved';

export interface Part {
  uid: string;
  kind: PartKind;
  params: Record<string, number>;
}

export type CrossoverType = 'none' | 'h' | 'x';

export interface ExhaustConfig {
  id: string;
  name: string;
  /** Every layout in this version is conceptual: no measured underbody dimensions. */
  basis: 'conceptual';
  catalyst: 'oem';
  frontPipe: { lengthMm: number; diameterMm: number };
  crossover: { type: CrossoverType; coupling: number; diameterMm: number };
  /** Post-crossover parts, front → rear. Exactly one muffler per side. */
  left: Part[];
  right: Part[];
  tips: { finish: 'black' | 'chrome' | 'titanium'; diameterMm: number };
  valve: { autoOpenRpm: number; autoCloseRpm: number; autoThrottle: number };
  notes?: string;
}

export type ValveMode = 'closed' | 'open' | 'auto';
export type ListenerMode = 'exterior' | 'interior';

// ───────────────────────── A/B sources ─────────────────────────

export type SourceKind = 'oem' | 'design' | 'snapshot' | 'target';

// ───────────────────────── Recordings (hybrid) ─────────────────────────

export interface RecordingMeta {
  id: string;
  engineId: string;
  fileName: string;
  durationSec: number;
  /** Steady RPM the clip was recorded at — needed to pitch-track it. */
  recordedRpm: number;
  position: ListenerMode;
  exhaust: 'oem' | 'modified' | 'unknown';
  source: string;
  rightsConfirmed: boolean;
}

// ───────────────────────── Exterior ─────────────────────────

export interface ExteriorPlan {
  finish: 'matte-black';
  colorHex: string;
  items: {
    body: boolean;
    grilleEmblem: boolean;
    wheels: boolean;
    exhaustTips: boolean;
    chromeTrim: boolean;
    rearBadges: boolean;
    calipers: boolean;
  };
  note: string;
}

// ───────────────────────── Legal pre-check ─────────────────────────

export type CheckState = 'todo' | 'done' | 'na';
