#!/usr/bin/env node
/**
 * Thin wrapper over the bundled tx-stream CLI. Run `npm run build:tx-stream`
 * first (npm run check does it). Samples go to the sink; logs to stderr.
 */
import { main } from '../dist/tx-stream/tx-stream-cli.js';

await main();
