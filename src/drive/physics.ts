import type { CarSpec } from './cars';

/**
 * Arcade vehicle model for V8 LAB DRIVE. Longitudinal: engine torque curve → gears → traction
 * limit → aero/rolling/grade/brake forces. Lateral: the road's curvature demands v²·κ of
 * centripetal acceleration; the tyres can supply up to μg (less while braking). Whatever the
 * driver does not cancel with steering pushes the car toward the outside of the curve, and
 * demand beyond the grip limit turns into a slide that scrubs speed.
 */

export const G = 9.81;
/** Curvature per unit of track "curve" value (1/m). curve 5 ≈ 71 m radius. */
export const KAPPA_PER_CURVE = 0.0028;
export const BOOST_TIME = 3.2;
const BOOST_FORCE_MUL = 1.45;
const BOOST_THRUST_G = 0.22;

export interface DriveState {
  v: number;
  gear: number;
  pendingGear: number;
  shiftT: number;
  rpm: number;
  x: number;
  vLat: number;
  steer: number;
  slip: number;
  spin: number;
  gauge: number;
  boostT: number;
  offroad: boolean;
  wallT: number;
  engineThrottle: number;
  limiter: boolean;
}

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
}

export interface RoadSample {
  /** Signed track curve value (+ = bends right). */
  curve: number;
  /** dy/dz of the road (+ = uphill). */
  slope: number;
  halfWidthM: number;
  /** Normalised x of barriers (null = open ground). */
  wallL: number | null;
  wallR: number | null;
  /** Grip multiplier of the ground beyond the road edge. */
  offroadGrip: number;
  /** Extra drag off the road, in g. */
  offroadDrag: number;
}

export interface StepEvents {
  shift?: 'up' | 'down';
  wall?: number;
  boostEnd?: boolean;
}

export function newDriveState(car: CarSpec): DriveState {
  return {
    v: 0,
    gear: 1,
    pendingGear: 1,
    shiftT: 0,
    rpm: car.idleRpm,
    x: 0,
    vLat: 0,
    steer: 0,
    slip: 0,
    spin: 0,
    gauge: 0,
    boostT: 0,
    offroad: false,
    wallT: 0,
    engineThrottle: 0,
    limiter: false,
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Full-load engine torque (N·m) at rpm. */
export function engineTorque(car: CarSpec, rpm: number): number {
  const r = Math.max(car.idleRpm, Math.min(rpm, car.redline));
  const tPeak = car.torqueNm;
  const tAtPower = Math.min(tPeak, (car.powerPs * 735.5) / ((car.powerRpm * 2 * Math.PI) / 60));
  const flatEnd = car.torqueFlatTo ?? car.torqueRpm;
  if (r <= car.torqueRpm) {
    const t = (r - car.idleRpm) / Math.max(1, car.torqueRpm - car.idleRpm);
    const low = car.torqueFlatTo ? 0.45 : 0.62;
    return tPeak * (low + (1 - low) * smooth(Math.max(0, Math.min(1, t))));
  }
  if (r <= flatEnd) return tPeak;
  if (r <= car.powerRpm) {
    const t = (r - flatEnd) / Math.max(1, car.powerRpm - flatEnd);
    return tPeak + (tAtPower - tPeak) * t;
  }
  // past peak power: torque falls ~12 % per 1,000 rpm
  return tAtPower * (1 - ((r - car.powerRpm) / 1000) * 0.12);
}

export function gearRpm(car: CarSpec, v: number, gear: number): number {
  const wheelRps = v / (2 * Math.PI * car.tireR);
  return wheelRps * 60 * car.gears[gear - 1] * car.finalDrive;
}

export function kmh(v: number) {
  return v * 3.6;
}

/** Engine free-revving in neutral (pre-start countdown). */
export function revNeutral(car: CarSpec, st: DriveState, throttle: number, dt: number) {
  const target = car.idleRpm + throttle * (car.redline * 0.9 - car.idleRpm);
  const k = target > st.rpm ? 7 : 3.5;
  st.rpm += (target - st.rpm) * (1 - Math.exp(-dt * k));
  st.engineThrottle = throttle;
}

/** Fires the boost if the gauge is full. */
export function tryBoost(st: DriveState): boolean {
  if (st.boostT > 0 || st.gauge < 0.999) return false;
  st.boostT = BOOST_TIME;
  return true;
}

/** Lateral acceleration capacity (m/s²) of the tyres in the current state. */
export function lateralCapacity(car: CarSpec, st: DriveState, brake: number, gripMul: number): number {
  const mu = car.grip * gripMul * (st.boostT > 0 ? 1.05 : 1);
  const brakeShare = Math.min(0.85, (brake * car.brakeG) / mu);
  const latG = mu * Math.sqrt(Math.max(0.15, 1 - brakeShare * brakeShare));
  return Math.min(latG * G, (st.v * st.v) / 4 + 2);
}

/** Highest speed (m/s) a curve can be taken at without sliding, for HUD advice. */
export function cornerSpeed(car: CarSpec, curve: number): number {
  const k = Math.abs(curve) * KAPPA_PER_CURVE;
  return k > 0 ? Math.sqrt((car.grip * G) / k) : Infinity;
}

export function stepCar(car: CarSpec, st: DriveState, inp: DriveInput, road: RoadSample, dt: number): StepEvents {
  const ev: StepEvents = {};
  const m = car.massKg;

  // ── boost timer & gauge
  if (st.boostT > 0) {
    st.boostT -= dt;
    st.gauge = Math.max(0, st.boostT / BOOST_TIME);
    if (st.boostT <= 0) {
      st.boostT = 0;
      st.gauge = 0;
      ev.boostEnd = true;
    }
  } else {
    const fill = 0.035 + 0.075 * Math.min(1, st.v / 70) + 0.12 * st.slip;
    st.gauge = Math.min(1, st.gauge + dt * fill * (st.offroad ? 0.3 : 1));
  }
  const boosting = st.boostT > 0;
  const gripMul = st.offroad ? road.offroadGrip : 1;

  // ── gearbox
  if (st.shiftT > 0) {
    st.shiftT -= dt;
    if (st.shiftT <= 0) {
      st.shiftT = 0;
      st.gear = st.pendingGear;
    }
  }
  let sp = gearRpm(car, st.v, st.gear);
  if (st.shiftT <= 0) {
    const n = car.gears.length;
    if (st.gear < n && (sp > car.redline * 0.985 || (sp > car.redline * 0.95 && inp.throttle > 0.3 && st.v > 3))) {
      st.pendingGear = st.gear + 1;
      st.shiftT = car.shiftTime;
      ev.shift = 'up';
    } else if (st.gear > 1) {
      const down = gearRpm(car, st.v, st.gear - 1);
      const lugging = sp < Math.max(car.idleRpm * 1.6, car.redline * (inp.brake > 0.2 ? 0.5 : 0.36));
      const kickdown = inp.throttle > 0.85 && sp < car.powerRpm * 0.7 && down < car.redline * 0.9;
      if ((lugging || kickdown) && down < car.redline * 0.93) {
        st.gear -= 1;
        st.pendingGear = st.gear;
        st.shiftT = car.shiftTime * 0.5;
        ev.shift = 'down';
        sp = down;
      }
    }
  }

  // ── engine speed (clutch slip at launch)
  const thrIn = Math.max(0, Math.min(1, inp.throttle));
  let rpm = sp;
  if (st.gear === 1 && sp < car.launchRpm) rpm = Math.max(sp, car.idleRpm + thrIn * (car.launchRpm - car.idleRpm));
  rpm = Math.max(car.idleRpm, rpm);
  st.limiter = rpm >= car.redline;
  const cut = st.shiftT > 0 || st.limiter;
  const thr = cut ? 0 : boosting ? 1 : thrIn;
  st.engineThrottle = thr;
  st.rpm = Math.min(rpm, car.redline + 80);

  // ── longitudinal forces
  const ratio = car.gears[st.gear - 1] * car.finalDrive;
  let fDrive = (engineTorque(car, rpm) * thr * ratio * 0.86) / car.tireR;
  if (boosting) fDrive = fDrive * BOOST_FORCE_MUL + m * G * BOOST_THRUST_G;
  const driveShare = car.drive === 'FR' ? 0.56 : 0.54;
  const fTraction = car.grip * gripMul * m * G * driveShare * (boosting ? 1.2 : 1);
  st.spin = fDrive > fTraction ? Math.min(1, (fDrive - fTraction) / fTraction) : 0;
  fDrive = Math.min(fDrive, fTraction);

  const fAero = 0.6 * car.cdA * st.v * st.v;
  const fRoll = 0.013 * m * G;
  // engine braking only once the clutch is engaged (not when standing still)
  const fEngineBrake = thr < 0.05 && st.shiftT <= 0 ? (((25 + rpm * 0.01) * ratio) / car.tireR) * Math.min(1, st.v / 5) : 0;
  const fBrake = Math.max(0, Math.min(1, inp.brake)) * Math.min(car.brakeG, car.grip * gripMul) * m * G;
  const fOff = st.offroad ? m * G * (road.offroadDrag + 0.004 * st.v) : 0;
  const fScrub = st.slip * m * G * 0.28;
  const resist = fAero + fRoll + fEngineBrake + fBrake + fOff + fScrub;
  let net = fDrive - m * G * road.slope - resist;
  if (st.v <= 0.05 && net < 0) net = 0; // at rest, friction/brakes hold the car
  st.v = Math.max(0, st.v + (net / m) * dt);

  // ── lateral: steering vs. the curve's centripetal demand
  st.steer += (inp.steer - st.steer) * (1 - Math.exp(-dt * 13));
  const kappa = road.curve * KAPPA_PER_CURVE;
  const aNeed = st.v * st.v * kappa;
  const aCap = lateralCapacity(car, st, inp.brake, gripMul);
  const excess = Math.abs(aNeed) - aCap;
  const slipTarget = excess > 0 ? Math.min(1, excess / (aCap * 0.6 + 0.1)) : 0;
  st.slip += (slipTarget - st.slip) * (1 - Math.exp(-dt * 6));
  // arcade: steering can move the car a little beyond pure grip, so it feels light and responsive
  let aRel = st.steer * aCap * 1.3 * (1 - 0.3 * st.slip) - aNeed;
  if (st.slip > 0.01) aRel -= Math.sign(kappa) * st.slip * aCap * 0.35;
  st.vLat += aRel * dt;
  st.vLat *= Math.exp(-dt * 2.8);
  st.x += (st.vLat * dt) / road.halfWidthM;

  // ── barriers and surface
  st.wallT = Math.max(0, st.wallT - dt);
  const hit = (side: -1 | 1, wall: number) => {
    const impact = Math.abs(st.vLat) + st.v * 0.05;
    st.x = wall - side * 0.01;
    st.vLat = -side * Math.abs(st.vLat) * 0.35;
    st.v *= 1 - Math.min(0.35, 0.04 + impact * 0.03);
    st.wallT = 0.35;
    ev.wall = impact;
  };
  if (road.wallL !== null && st.x < road.wallL) hit(-1, road.wallL);
  if (road.wallR !== null && st.x > road.wallR) hit(1, road.wallR);
  st.offroad = Math.abs(st.x) > 1;
  // open ground: keep the car within a sane distance of the road
  if (Math.abs(st.x) > 3) {
    st.x = Math.sign(st.x) * 3;
    st.vLat = 0;
  }
  return ev;
}

/** Quick flat-road launch test used for the car-select stats (game physics, not measured data). */
export function carPerformance(car: CarSpec): { t100: number; topKmh: number } {
  const st = newDriveState(car);
  const road: RoadSample = { curve: 0, slope: 0, halfWidthM: 7, wallL: null, wallR: null, offroadGrip: 1, offroadDrag: 0 };
  let t = 0;
  let t100 = NaN;
  let top = 0;
  const dt = 1 / 60;
  while (t < 75) {
    stepCar(car, st, { throttle: 1, brake: 0, steer: 0 }, road, dt);
    t += dt;
    const k = kmh(st.v);
    if (Number.isNaN(t100) && k >= 100) t100 = t;
    top = Math.max(top, k);
  }
  return { t100, topKmh: top };
}
