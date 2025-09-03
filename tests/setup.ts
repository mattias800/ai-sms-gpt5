import { configureGlobal } from 'fast-check';

const seedStr = process.env.TEST_SEED ?? '1337';
const seed = Number.isFinite(Number(seedStr)) ? Number(seedStr) : 1337;

configureGlobal({ seed, numRuns: 200 });
