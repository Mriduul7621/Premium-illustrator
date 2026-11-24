import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuotationModel } from '../src/lib/quotationModel';
import {
  accidentalRiderBenefits, modeComparisonRows, naturalDeathCover, paymentsOverTerm,
  scepStipend, stagePayouts,
} from '../src/lib/quotationPreview';
import { quotationFixture } from './fixtures';

test('paymentsOverTerm: Single is paid once, other modes pay per period across the term', () => {
  assert.equal(paymentsOverTerm('Single', 15), 1);
  assert.equal(paymentsOverTerm('Yearly', 15), 15);
  assert.equal(paymentsOverTerm('Half-yearly', 15), 30);
  assert.equal(paymentsOverTerm('Quarterly', 15), 60);
  assert.equal(paymentsOverTerm('Monthly', 15), 180);
});

test('mode comparison: regular plan shows four modes, totals are premium x payments, maturity and death cover are the same in every mode', () => {
  const options = quotationFixture('endowment', 'Monthly', 12);
  const product = options.selectedProduct!;
  const rows = modeComparisonRows(product, 12, product.maturityValue!, options.input.sumAssured, 'Monthly');
  assert.deepEqual(rows.map(row => row.mode), ['Monthly', 'Quarterly', 'Half-yearly', 'Yearly']);
  for (const row of rows) {
    assert.equal(row.premium, product.totalPremium[row.mode]);
    assert.equal(row.totalPaid, row.premium * paymentsOverTerm(row.mode, 12));
    assert.equal(row.maturity, product.maturityValue);
    assert.equal(row.deathCover, options.input.sumAssured);
  }
  assert.equal(rows.find(row => row.selected)?.mode, 'Monthly');
});

test('mode comparison: selected-mode total matches the quotation model total paid', () => {
  for (const mode of ['Monthly', 'Quarterly', 'Half-yearly', 'Yearly'] as const) {
    const options = quotationFixture('endowment', mode, 15);
    const policy = buildQuotationModel(options).policies[0];
    const rows = modeComparisonRows(options.selectedProduct!, 15, options.selectedProduct!.maturityValue!, options.input.sumAssured, mode);
    assert.equal(rows.find(row => row.selected)!.totalPaid, policy.totalPaid);
  }
});

test('mode comparison: single-premium plans show only the Single row, paid once', () => {
  for (const product of ['sspe', 'scep_single_3']) {
    const options = quotationFixture(product, 'Single', 10);
    const rows = modeComparisonRows(options.selectedProduct!, 10, options.selectedProduct!.maturityValue!, options.input.sumAssured, 'Single');
    assert.deepEqual(rows.map(row => row.mode), ['Single']);
    assert.equal(rows[0].totalPaid, rows[0].premium);
    assert.equal(rows[0].selected, true);
  }
});

test('stage payouts: S3PP pays 25% + 25% + 50% in the right policy years and adds up to the sum assured', () => {
  const options = quotationFixture('s3pp', 'Monthly', 15);
  const stages = stagePayouts('s3pp', 15, options.input.sumAssured, 2026);
  assert.deepEqual(stages.map(stage => [stage.policyYear, stage.calendarYear, stage.percent]), [[5, 2031, 25], [10, 2036, 25], [15, 2041, 50]]);
  assert.equal(stages.reduce((sum, stage) => sum + stage.amount, 0), options.input.sumAssured);
});

test('stage payouts: S4PP pays 15% + 15% + 15% + 55% in the right policy years and adds up to the sum assured', () => {
  const options = quotationFixture('s4pp', 'Monthly', 20);
  const stages = stagePayouts('s4pp', 20, options.input.sumAssured, 2026);
  assert.deepEqual(stages.map(stage => [stage.policyYear, stage.calendarYear, stage.percent]), [[5, 2031, 15], [10, 2036, 15], [15, 2041, 15], [20, 2046, 55]]);
  assert.equal(stages.reduce((sum, stage) => sum + stage.amount, 0), options.input.sumAssured);
});

test('stage payouts: non-stage plans have no stages', () => {
  assert.deepEqual(stagePayouts('endowment', 15, 1000000, 2026), []);
  assert.deepEqual(stagePayouts('scep_3', 15, 1000000, 2026), []);
});

test('child stipend: parses 3% of the sum assured, and only for child plans', () => {
  assert.deepEqual(scepStipend('scep_3', 1440000), { percent: 0.03, monthly: 43200 });
  assert.deepEqual(scepStipend('scep_single_3', 1440000), { percent: 0.03, monthly: 43200 });
  assert.equal(scepStipend('endowment', 1440000), null);
  assert.equal(scepStipend('sspe', 1440000), null);
});

test('natural death cover: sum assured, except SSPE which pays its maturity benefit', () => {
  const endowment = quotationFixture('endowment');
  assert.equal(naturalDeathCover(endowment.selectedProduct!, endowment.input.sumAssured), endowment.input.sumAssured);
  const sspe = quotationFixture('sspe', 'Single', 10);
  assert.equal(naturalDeathCover(sspe.selectedProduct!, sspe.input.sumAssured), sspe.selectedProduct!.maturityValue);
});

test('accidental rider: rider sum assured capped at BDT 50 lakh, medical reimbursement capped at BDT 5 lakh', () => {
  assert.deepEqual(accidentalRiderBenefits(1440000), { deathCoverTotal: 2880000, disabilityEach: 1440000, medicalReimbursementMax: 216000 });
  assert.deepEqual(accidentalRiderBenefits(10000000), { deathCoverTotal: 15000000, disabilityEach: 5000000, medicalReimbursementMax: 500000 });
});
