import type { GeranFixedBurstProfile } from './geran-fixed-bursts.js';

/**
 * Dependency-light identity registry shared by catalog metadata, governance,
 * and the exact GERAN adapter. It must not import the catalog or generator.
 */
export const GERAN_FIXED_CATALOG_CF32LE_SHA256 = Object.freeze({
  'gsm-900-loaded-bcch':
    '6c1b8392da569af1e7d8466f0bab0fc67a3ad486c37238e737dc3e7aaa00e468',
  'gsm-normal-burst':
    'eeb6cdcc00a228d85a2cea80a31af4250498e035cbd7fa7ef38d82316b4a465b',
  'gsm-qpsk-higher-symbol-rate-burst':
    '467dab110023dc884c8d3de95b88a640cc3beda2f15845e01aaf397dd6772114',
  'gsm-aqpsk-normal-burst':
    'cd51921ed2038c6c2f26bc8f05dd94e19a802030c471594993dac16c568b0ae2',
  'gsm-8psk-normal-burst':
    'a8d02b7c21c1040d02285cf885b02a9d0760ad7a6367aea44c1486c68d99692a',
  'gsm-16qam-higher-symbol-rate-burst':
    'd1ee47875e59ab0619770855ca47e6dc309e7af20e2cb8480152ec2aa9d3232a',
  'gsm-32qam-higher-symbol-rate-burst':
    '26b84953d9299e63a198ca04f0d42d61d89f7e00a4c6e9c512677a8f6b162203',
} as const satisfies Readonly<Record<GeranFixedBurstProfile, string>>);
