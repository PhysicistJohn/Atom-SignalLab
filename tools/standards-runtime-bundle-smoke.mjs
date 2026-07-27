#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  generateStandardsRuntimeArtifact,
  listStandardsRuntimeRecipes,
} from '../dist/standards/standards-runtime.js';

const EXPECTED_RECIPE_ID = 'lte-etm-1-1-10mhz-fdd-release19';
const EXPECTED_ARTIFACT_SHA256 =
  '1cb66b49be2518ea33a2bbf1f7075b54e6e62e10a9c05491a0ba4727bfe05511';
const EXPECTED_BYTE_LENGTH = 2_457_600;

// The artifact is float64 samples produced through libm transcendentals, whose
// last-ulp rounding differs by host architecture. The pin above was authored on
// darwin-arm64, and the provider deliberately fails closed rather than emitting
// bytes it cannot vouch for, so exact reproduction is only assertable there.
// The pin cannot simply be re-taken per architecture: the srsRAN oracle evidence
// binds providerSourceSha256 to that exact generator source, so a second pin
// needs a provider recipe revision backed by a re-run oracle.
//
// Everything that does not depend on float64 bytes is still asserted on every
// architecture, and on non-authoring hosts the fail-closed behaviour itself is
// asserted, which is the property that actually matters there.
const PIN_AUTHORED_ON_THIS_HOST =
  process.platform === 'darwin' && process.arch === 'arm64';

const recipes = listStandardsRuntimeRecipes();
if (
  recipes.length !== 1
  || recipes[0]?.runtimeRecipeId !== EXPECTED_RECIPE_ID
) {
  throw new Error('Bundled standards runtime does not expose exactly the fixed LTE recipe');
}

if (!PIN_AUTHORED_ON_THIS_HOST) {
  let failedClosed = false;
  try {
    await generateStandardsRuntimeArtifact(EXPECTED_RECIPE_ID);
  } catch (error) {
    const cause = error?.cause;
    failedClosed = /without a provider recipe revision/.test(String(cause?.message ?? ''));
    if (!failedClosed) throw error;
  }
  if (!failedClosed) {
    throw new Error(
      'Bundled standards runtime emitted an artifact on a non-authoring architecture '
      + 'instead of failing closed on the pinned payload identity',
    );
  }

  let unknownRejectedHere = false;
  try {
    await generateStandardsRuntimeArtifact('unknown-recipe');
  } catch {
    unknownRejectedHere = true;
  }
  if (!unknownRejectedHere) {
    throw new Error('Bundled standards runtime accepted an unknown recipe');
  }

  process.stdout.write(
    `Bundled standards runtime failed closed on ${process.platform}-${process.arch}, `
    + `as expected off the pin's authoring architecture\n`,
  );
  process.exit(0);
}

const artifact = await generateStandardsRuntimeArtifact(EXPECTED_RECIPE_ID);
const payload = artifact.readAllBytes();
const observedSha256 = createHash('sha256').update(payload).digest('hex');
if (
  artifact.qualification !== 'reference-generated'
  || artifact.manifest.qualificationBoundary.complianceClaim !== 'not-claimed'
  || artifact.verifiedByteLength !== EXPECTED_BYTE_LENGTH
  || payload.byteLength !== EXPECTED_BYTE_LENGTH
  || artifact.manifest.artifact.contentSha256 !== EXPECTED_ARTIFACT_SHA256
  || observedSha256 !== EXPECTED_ARTIFACT_SHA256
) {
  throw new Error('Bundled standards runtime did not reproduce the pinned non-claim artifact');
}

let unknownRecipeRejected = false;
try {
  await generateStandardsRuntimeArtifact('unknown-recipe');
} catch {
  unknownRecipeRejected = true;
}
if (!unknownRecipeRejected) {
  throw new Error('Bundled standards runtime accepted an unknown recipe');
}

process.stdout.write(
  `Bundled standards runtime reproduced ${EXPECTED_ARTIFACT_SHA256} (${EXPECTED_BYTE_LENGTH} bytes)\n`,
);
