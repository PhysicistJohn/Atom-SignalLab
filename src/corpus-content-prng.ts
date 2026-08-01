/**
 * Stateless deterministic content draws for corpus-only waveform variants.
 *
 * This is deliberately separate from catalog/measurement seeds. A draw is a
 * pure function of the content seed, profile namespace, absolute logical
 * index, and lane, so a whole capture and any partition of that capture stay
 * identical. It is not a cryptographic PRNG and must not be used for product
 * security or protocol identity generation.
 */

export function validateCorpusContentSeed(seed: number): number {
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffff_ffff) {
    throw new RangeError('Corpus content seed must be an integer from 1 through 0xffffffff');
  }
  return seed >>> 0;
}

export function corpusContentWord(
  contentSeed: number,
  profileNamespace: string,
  absoluteIndex: number,
  lane: number = 0,
): number {
  const seed = validateCorpusContentSeed(contentSeed);
  if (typeof profileNamespace !== 'string' || profileNamespace.length === 0) {
    throw new RangeError('Corpus content profile namespace must be a non-empty string');
  }
  if (!Number.isSafeInteger(absoluteIndex) || absoluteIndex < 0) {
    throw new RangeError('Corpus content absolute index must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(lane) || lane < 0 || lane > 0xffff_ffff) {
    throw new RangeError('Corpus content lane must be an integer from 0 through 0xffffffff');
  }
  const low = absoluteIndex >>> 0;
  const high = Math.floor(absoluteIndex / 0x1_0000_0000) >>> 0;
  return mix32(
    seed
    ^ fnv1a32(profileNamespace)
    ^ Math.imul(low, 0x9e37_79b1)
    ^ Math.imul(high, 0x85eb_ca6b)
    ^ Math.imul(lane >>> 0, 0xc2b2_ae35),
  );
}

export function corpusContentBit(
  contentSeed: number,
  profileNamespace: string,
  absoluteIndex: number,
  lane: number = 0,
): 0 | 1 {
  return (corpusContentWord(contentSeed, profileNamespace, absoluteIndex, lane) & 1) as 0 | 1;
}

function fnv1a32(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb_352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846c_a68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}
