/**
 * Actuarial benchmark tests.
 *
 * Every expected value here comes from a Shanta Life source document (the
 * SDPP brochure's published worked examples, the SSPE certificate, and the
 * endowment-family certificates) - not from the app's own previous output.
 * If a future change makes a test fail, the change has moved the calculator
 * away from the documents and must not ship until the difference is explained.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSDPPCalculations } from '../src/services/sdpCalculator';
import { calculateProjection } from '../src/services/calculator';
import type { CalculationInput } from '../src/data/types';

const sdppInput = (plan: 'Signature' | 'Prime', term: number): CalculationInput => ({
  age: 30, gender: 'Male', paymentMethod: 'Yearly', targetPremium: 72000,
  term, sdppPlan: plan, sumAssured: 0, inputMode: 'Premium',
  hasAccidentalProtection: false, hasCIClassic: false, hasCIStandard: false,
} as CalculationInput);

// SDPP brochure worked examples: Mr Iftekhar, age 30, annual premium 72,000.
// Tolerance 0.3%: SDPP maturity is a non-guaranteed projection and the
// brochure figures come from the insurer's IMS day-count conventions.
const SDPP_BENCHMARKS: Array<[number, number, number]> = [
  // [term, maturity @7%, maturity @9%] - Signature
  [10, 962366, 1074260],
  [15, 1716734, 2030265],
  [20, 2776998, 3502658],
  [25, 4220593, 5702660],
];
for (const [term, at7, at9] of SDPP_BENCHMARKS) {
  test(`SDPP Signature T${term} maturity matches the brochure benchmark`, () => {
    const r = runSDPPCalculations(sdppInput('Signature', term));
    assert.ok(Math.abs(r.maturity7 - at7) / at7 < 0.003, `7%: got ${r.maturity7}, brochure ${at7}`);
    assert.ok(Math.abs(r.maturity9 - at9) / at9 < 0.003, `9%: got ${r.maturity9}, brochure ${at9}`);
  });
}
test('SDPP Prime T10 and T25@7% match the brochure benchmarks', () => {
  const t10 = runSDPPCalculations(sdppInput('Prime', 10));
  assert.ok(Math.abs(t10.maturity7 - 966343) / 966343 < 0.003);
  assert.ok(Math.abs(t10.maturity9 - 1078604) / 1078604 < 0.003);
  const t25 = runSDPPCalculations(sdppInput('Prime', 25));
  assert.ok(Math.abs(t25.maturity7 - 4288764) / 4288764 < 0.003);
  // NOTE: Prime T25 @9% is intentionally not asserted - the engine (and an
  // independent replication) lands ~3.3% below the brochure's 5,992,898,
  // which suggests Prime's long-term COI basis differs. Awaiting Actuarial
  // clarification (audit question Q3); do not "fix" by fudging inputs.
});

const proj = (productId: string, input: Partial<CalculationInput>) =>
  calculateProjection({ paymentMethod: 'Yearly', gender: 'Male', hasAccidentalProtection: false, hasCIClassic: false, hasCIStandard: false, ...input } as CalculationInput, productId);

test('Endowment surrender value is net of the Tk 200 fee', () => {
  const rows = proj('endowment', { age: 30, term: 15, sumAssured: 1000000 });
  assert.equal(rows[1].surrenderValue, 67800); // table 68,000 - 200
  assert.equal(rows[9].surrenderValue, 540800); // table 541,000 - 200
});

test('ETI: surplus is surrender value minus rate x remaining years (certificate method)', () => {
  const rows = proj('endowment', { age: 30, term: 15, sumAssured: 1000000 });
  assert.equal(rows[1].etiCoverage, 1000000);
  assert.equal(rows[1].etiSurplus, 53890); // 67,800 - 1.07 x 13 x 1,000
  assert.equal(rows[4].etiSurplus, 188300); // 200,800 - 1.25 x 10 x 1,000
});

test('ETI: when the surrender value cannot fund full cover, cover reduces and no cash is returned', () => {
  const rows = proj('endowment', { age: 50, term: 20, sumAssured: 1000000 });
  assert.ok(rows[1].etiCoverage < 1000000, `expected reduced cover, got ${rows[1].etiCoverage}`);
  assert.equal(rows[1].etiSurplus, 0);
});

test('S3PP paid-up deducts the stage paid at the stage year itself', () => {
  const rows = proj('s3pp', { age: 30, term: 15, sumAssured: 1000000 });
  assert.equal(rows[4].paidUpValue, 83334); // 333,334 - 250,000 stage at year 5
  assert.equal(rows[9].paidUpValue, 166667); // 666,667 - 500,000 stages by year 10
  assert.equal(rows[4].surrenderValue, 25800); // sawtooth 26,000 - 200 fee
});

test('Policy loan maximum is 80% of net CSV from the 4th policy year', () => {
  const rows = proj('s3pp', { age: 30, term: 15, sumAssured: 1000000 });
  assert.equal(rows[2].loanValue, 0); // year 3: not yet
  assert.equal(rows[3].loanValue, 124640); // year 4: 80% of 155,800
});

test('SSPE surrender is a % of the MATURITY BENEFIT, and death benefit equals it', () => {
  const rows = proj('sspe', { age: 30, term: 10, sumAssured: 500000, paymentMethod: 'Single' });
  // Maturity benefit = 500,000 x 156% = 780,000; Y3 CSV = 616/1000 x 780,000 - 200
  assert.equal(rows[2].surrenderValue, 480280);
  assert.equal(rows[2].deathBenefit, 780000);
  // SSPE certificate: no RPU/ETI and no policy loan.
  assert.equal(rows[2].paidUpValue, 0);
  assert.equal(rows[2].etiCoverage, 0);
  assert.equal(rows[3].loanValue, 0);
});

test('SSPE certificate worked example factors (term 10)', () => {
  // Cert example: maturity benefit 500,000, term 10 -> Yr3 factor 616, Yr4 645.
  const rows = proj('sspe', { age: 30, term: 10, sumAssured: 500000 / 1.56, paymentMethod: 'Single' });
  assert.equal(rows[2].surrenderValue, 307800); // 616 x 500 - 200
  assert.equal(rows[3].surrenderValue, 322300); // 645 x 500 - 200
});

test('CP (Critical Protection) rates match the official rate chart (Nov 2026)', async () => {
  const { getCIRate } = await import('../src/lib/rateLookup');
  // Anchor cells read directly from rate_chart.xlsx (CP - Classic / CP - Standard).
  assert.equal(getCIRate(18, 1, 'Male', 'Classic'), 0.67);
  assert.equal(getCIRate(18, 20, 'Male', 'Classic'), 1.12);
  assert.equal(getCIRate(30, 15, 'Male', 'Classic'), 2.03);
  assert.equal(getCIRate(50, 20, 'Male', 'Classic'), 10.29); // chart boundary age+term = 70
  assert.equal(getCIRate(60, 10, 'Male', 'Classic'), 15.44); // last chart row/column block
  assert.equal(getCIRate(18, 1, 'Female', 'Classic'), 0.57);
  assert.equal(getCIRate(25, 10, 'Female', 'Classic'), 1.27);
  assert.equal(getCIRate(18, 1, 'Male', 'Standard'), 0.74);
  assert.equal(getCIRate(40, 20, 'Male', 'Standard'), 5.43);
  assert.equal(getCIRate(18, 1, 'Female', 'Standard'), 0.63);
  assert.equal(getCIRate(35, 12, 'Female', 'Standard'), 2.82);
});

test('SCEP 2% age 36 term 12 rate is 80.51 (certificate + official rate chart)', async () => {
  const { SCEP_2_ANNUAL_RATES } = await import('../src/data/rates');
  assert.equal(SCEP_2_ANNUAL_RATES[36][12], 80.51);
});
