/**
 * Corpus-only broadcast-realistic analog synthesis: wideband stereo FM
 * (`fm-broadcast-mpx`) and voiced full-carrier AM (`am-voice`).
 *
 * Motivation: the catalog `fm`/`am` stimuli are single-tone closed forms; a
 * classifier trained only on them calls real broadcast FM and real AM voice
 * `cw`/`gsm` (Atom-Classifier docs/ota-results.md, 2026-08-02). These
 * profiles supply content-seeded, spectrally realistic counterparts without
 * touching the catalog producers.
 *
 * Construction rule: every message signal is a seeded FINITE SUM OF COSINES.
 * That keeps each row a pure function of (contentSeed, contentRowIndex,
 * absolute sample index) — split and whole captures are identical — and
 * makes the FM phase integral exact closed form, so an independent oracle
 * can evaluate any sample from the drawn parameter list alone.
 *
 * Deliberate simplifications, disclosed: no RDS subcarrier (its BPSK
 * transitions would break the closed-form phase integral), no HD Radio
 * sidebands, and "voice" is a shaped multitone surrogate with syllabic
 * amplitude motion, not recorded speech.
 */
import { writeUnitBoundedCf32le } from '@atomos/dsp';
import { corpusContentWord, validateCorpusContentSeed } from './corpus-content-prng.js';

export const BROADCAST_CORPUS_PROFILES = ['fm-broadcast-mpx', 'am-voice'] as const;
export type BroadcastCorpusProfile = typeof BROADCAST_CORPUS_PROFILES[number];

export const BROADCAST_CORPUS_SAMPLE_RATE_HZ = 20_000_000 as const;
export const BROADCAST_CORPUS_BANDWIDTH_HZ = Object.freeze({
  // Carson: 2 * (75 kHz deviation + 53 kHz top MPX component).
  'fm-broadcast-mpx': 256_000,
  // Full-carrier DSB AM of a <=5 kHz message.
  'am-voice': 10_000,
} as const);

const MAX_BROADCAST_IQ_SAMPLES = 65_536 as const;
const IQ_BYTES_PER_SAMPLE = 8 as const;

const FM_DEVIATION_HZ = 75_000;
const FM_PILOT_HZ = 19_000;
const FM_STEREO_SUBCARRIER_HZ = 38_000;
const FM_PILOT_FRACTION = 0.09;
const FM_AUDIO_COMPONENTS = 24;
const FM_PREEMPHASIS_SECONDS = 75e-6;
const AM_VOICE_COMPONENTS = 16;
const AM_SYLLABIC_COMPONENTS = 3;

interface CosineTerm {
  amplitude: number;
  omega: number;   // rad/s
  phase: number;   // rad
}

function uniform(seed: number, namespace: string, index: number, lane: number): number {
  return (corpusContentWord(seed, namespace, index, lane) + 0.5) / 0x1_0000_0000;
}

/** Seeded audio band: components log-uniform in [lowHz, highHz], 1/sqrt(f)
 * spectral weighting, uniform phase. Lane space is partitioned per draw. */
function drawAudioTerms(
  seed: number, namespace: string, rowIndex: number, laneBase: number,
  count: number, lowHz: number, highHz: number, preemphasis: boolean,
): CosineTerm[] {
  const terms: CosineTerm[] = [];
  for (let k = 0; k < count; k += 1) {
    const lane = laneBase + k * 4;
    const frequencyHz = lowHz * (highHz / lowHz) ** uniform(seed, namespace, rowIndex, lane);
    let amplitude = (1 / Math.sqrt(frequencyHz / lowHz))
      * (0.5 + uniform(seed, namespace, rowIndex, lane + 1));
    if (preemphasis) {
      const tau = 2 * Math.PI * frequencyHz * FM_PREEMPHASIS_SECONDS;
      amplitude *= Math.sqrt(1 + tau * tau);
    }
    terms.push({
      amplitude,
      omega: 2 * Math.PI * frequencyHz,
      phase: 2 * Math.PI * uniform(seed, namespace, rowIndex, lane + 2) - Math.PI,
    });
  }
  return terms;
}

function normalizeTotalAmplitude(terms: CosineTerm[], target: number): void {
  const total = terms.reduce((sum, term) => sum + Math.abs(term.amplitude), 0);
  if (total <= 0) return;
  for (const term of terms) term.amplitude *= target / total;
}

/** Expand a product cos(a t + p) * cos(b t + q) into two cosine terms. */
function productTerms(amplitude: number, omegaA: number, phaseA: number,
                      omegaB: number, phaseB: number): CosineTerm[] {
  return [
    { amplitude: amplitude / 2, omega: omegaA + omegaB, phase: phaseA + phaseB },
    { amplitude: amplitude / 2, omega: Math.abs(omegaA - omegaB),
      phase: omegaA >= omegaB ? phaseA - phaseB : phaseB - phaseA },
  ];
}

export interface BroadcastCorpusRowPlan {
  profile: BroadcastCorpusProfile;
  /** Flat cosine expansion of the message (MPX for FM, voice for AM). */
  messageTerms: CosineTerm[];
  /** AM only: modulation index in [0.35, 0.85]. */
  modulationIndex: number;
}

/** Draw one row's complete parameter set. Exported so oracle tests can
 * evaluate samples independently of the synthesis loop. */
export function planBroadcastCorpusRow(
  profile: BroadcastCorpusProfile, contentSeed: number, contentRowIndex: number,
): BroadcastCorpusRowPlan {
  validateCorpusContentSeed(contentSeed);
  if (!Number.isSafeInteger(contentRowIndex) || contentRowIndex < 0) {
    throw new RangeError('contentRowIndex must be a non-negative safe integer');
  }
  if (profile === 'fm-broadcast-mpx') {
    const namespace = 'broadcast-corpus/fm-mpx/v1';
    const left = drawAudioTerms(contentSeed, namespace, contentRowIndex, 0,
                                FM_AUDIO_COMPONENTS, 50, 12_000, true);
    const right = drawAudioTerms(contentSeed, namespace, contentRowIndex, 200,
                                 FM_AUDIO_COMPONENTS, 50, 12_000, true);
    normalizeTotalAmplitude(left, 0.45);
    normalizeTotalAmplitude(right, 0.45);
    const pilotPhase = 2 * Math.PI * uniform(contentSeed, namespace, contentRowIndex, 400) - Math.PI;
    const messageTerms: CosineTerm[] = [];
    // (L+R)/2 mono sum.
    for (const term of left) messageTerms.push({ ...term, amplitude: term.amplitude / 2 });
    for (const term of right) messageTerms.push({ ...term, amplitude: term.amplitude / 2 });
    // 19 kHz pilot; the 38 kHz subcarrier is phase-locked at 2x pilot phase.
    messageTerms.push({ amplitude: FM_PILOT_FRACTION,
                        omega: 2 * Math.PI * FM_PILOT_HZ, phase: pilotPhase });
    const subcarrierOmega = 2 * Math.PI * FM_STEREO_SUBCARRIER_HZ;
    const subcarrierPhase = 2 * pilotPhase;
    // (L-R)/2 DSB-SC on the 38 kHz subcarrier, expanded to plain cosines.
    for (const term of left) {
      messageTerms.push(...productTerms(term.amplitude / 2, term.omega,
                                        term.phase, subcarrierOmega, subcarrierPhase));
    }
    for (const term of right) {
      messageTerms.push(...productTerms(-term.amplitude / 2, term.omega,
                                        term.phase, subcarrierOmega, subcarrierPhase));
    }
    // Bound peak MPX magnitude at 1 so deviation never exceeds 75 kHz.
    normalizeTotalAmplitude(messageTerms, 1.0);
    return { profile, messageTerms, modulationIndex: 0 };
  }
  const namespace = 'broadcast-corpus/am-voice/v1';
  const voice = drawAudioTerms(contentSeed, namespace, contentRowIndex, 0,
                               AM_VOICE_COMPONENTS, 150, 5_000, false);
  // Syllabic motion: multiply the voice band by (1 + slow cosines), which is
  // again a finite cosine expansion.
  const syllabic = drawAudioTerms(contentSeed, namespace, contentRowIndex, 100,
                                  AM_SYLLABIC_COMPONENTS, 1.5, 8, false);
  normalizeTotalAmplitude(voice, 1.0);
  normalizeTotalAmplitude(syllabic, 0.6);
  const messageTerms: CosineTerm[] = [...voice];
  for (const voiceTerm of voice) {
    for (const syllabicTerm of syllabic) {
      messageTerms.push(...productTerms(
        voiceTerm.amplitude * syllabicTerm.amplitude,
        voiceTerm.omega, voiceTerm.phase,
        syllabicTerm.omega, syllabicTerm.phase));
    }
  }
  normalizeTotalAmplitude(messageTerms, 1.0);
  const modulationIndex = 0.35
    + 0.5 * uniform(contentSeed, namespace, contentRowIndex, 300);
  return { profile, messageTerms, modulationIndex };
}

/** Exact complex sample at an absolute index, straight from the plan. */
export function broadcastCorpusSampleAt(
  plan: BroadcastCorpusRowPlan, sampleRateHz: number, absoluteSampleIndex: number,
): readonly [number, number] {
  const t = absoluteSampleIndex / sampleRateHz;
  if (plan.profile === 'fm-broadcast-mpx') {
    // phase(t) = 2*pi*deviation * integral of MPX: exact term-by-term.
    let phase = 0;
    for (const term of plan.messageTerms) {
      if (term.omega === 0) continue;
      phase += (term.amplitude / term.omega) * Math.sin(term.omega * t + term.phase);
    }
    phase *= 2 * Math.PI * FM_DEVIATION_HZ;
    return [Math.cos(phase), Math.sin(phase)];
  }
  let message = 0;
  for (const term of plan.messageTerms) {
    message += term.amplitude * Math.cos(term.omega * t + term.phase);
  }
  const envelope = (1 + plan.modulationIndex * message) / (1 + plan.modulationIndex);
  return [envelope, 0];
}

export interface BroadcastCorpusContentIqInput {
  profile: BroadcastCorpusProfile;
  sampleRateHz: number;
  bandwidthHz: number;
  sampleCount: number;
  startSampleIndex: number;
  contentSeed: number;
  contentRowIndex: number;
}

export function synthesizeBroadcastCorpusContentIq(
  input: BroadcastCorpusContentIqInput,
): Uint8Array {
  const profile = input.profile;
  if (!BROADCAST_CORPUS_PROFILES.includes(profile)) {
    throw new RangeError(`Unsupported broadcast corpus profile: ${profile}`);
  }
  if (input.sampleRateHz !== BROADCAST_CORPUS_SAMPLE_RATE_HZ) {
    throw new RangeError(
      `${profile} requires ${BROADCAST_CORPUS_SAMPLE_RATE_HZ} samples/s`);
  }
  if (input.bandwidthHz !== BROADCAST_CORPUS_BANDWIDTH_HZ[profile]) {
    throw new RangeError(
      `${profile} requires the ${BROADCAST_CORPUS_BANDWIDTH_HZ[profile]} Hz binding`);
  }
  if (!Number.isSafeInteger(input.sampleCount) || input.sampleCount < 1
    || input.sampleCount > MAX_BROADCAST_IQ_SAMPLES) {
    throw new RangeError(
      `${profile} sample count must be 1..${MAX_BROADCAST_IQ_SAMPLES}`);
  }
  const start = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(start) || start < 0
    || !Number.isSafeInteger(start + input.sampleCount)) {
    throw new RangeError(`${profile} start sample index must be a non-negative safe integer`);
  }
  const plan = planBroadcastCorpusRow(profile, input.contentSeed, input.contentRowIndex);
  const bytes = new Uint8Array(input.sampleCount * IQ_BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < input.sampleCount; index += 1) {
    const [inPhase, quadrature] = broadcastCorpusSampleAt(
      plan, input.sampleRateHz, start + index);
    writeUnitBoundedCf32le(view, index * IQ_BYTES_PER_SAMPLE, inPhase, quadrature);
  }
  return bytes;
}
