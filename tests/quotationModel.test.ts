import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuotationModel, quoteMoney, taxRebateAmount } from '../src/lib/quotationModel';
import { calculatePremiums } from '../src/services/calculator';
import { quotationFixture, comboFixture } from './fixtures';
import { quotationFilename } from '../src/lib/quotationPdf';

for (const plan of ['elite', 'signature', 'prime']) {
  for (const mode of ['Monthly', 'Quarterly', 'Half-yearly', 'Yearly'] as const) {
    test(`SDPP ${plan} / ${mode}: uses computed premiums, benefits, scenarios and projection`, () => {
      const options = quotationFixture(`sdpp_${plan}`, mode);
      const policy = buildQuotationModel(options).policies[0];
      assert.equal(policy.premium, options.sdppData!.totalModePremium);
      assert.equal(policy.totalPaid, options.sdppData!.totalPremiumPaid);
      const content = JSON.stringify(policy);
      assert.match(content, /At 7% crediting rate/);
      assert.match(content, /At 9% crediting rate/);
      assert.match(content, /7% assumed rate/);
      assert.equal(policy.schedules[0].rows.length, options.input.term);
      if (plan !== 'elite') assert.doesNotMatch(content, /Critical illness coverage|Hospital coverage/);
      if (plan === 'prime') assert.match(content, /Current account value or Paid Basic premium/);
    });
  }
}

test('25-year term counts rider payments only through the applicable rider term', () => {
  const options = quotationFixture('sdpp_elite', 'Monthly', 25);
  const policy = buildQuotationModel(options).policies[0];
  assert.equal(policy.totalPaid, options.sdppData!.totalBasicPremiumPaid + options.sdppData!.totalRiderPremiumPaid);
  assert.equal(policy.summary[0].rows[1][2], quoteMoney(options.sdppData!.ciMonthlyPremium * 12 * 15));
  assert.match(policy.summary[0].note!, /15 years/);
});

test('combination preserves separate payment modes and Prime formula, without inventing a numeric guarantee', () => {
  const options = comboFixture();
  const model = buildQuotationModel(options);
  assert.equal(model.policies.length, 2);
  assert.equal(model.policies[0].mode, 'Monthly');
  assert.equal(model.policies[1].mode, 'Quarterly');
  assert.equal(model.policies[1].totalPaid, options.sdppComboData!.totalPremiumPaid);
  assert.match(JSON.stringify(model.policies[1]), /At 10% custom rate/);
  assert.match(model.notes.join(' '), /two separate policies/);
});

for (const product of ['sspe', 'scep_single_1']) {
  test(`${product}: single premium is paid once, never multiplied by the term`, () => {
    const options = quotationFixture(product, 'Single');
    const policy = buildQuotationModel(options).policies[0];
    assert.equal(policy.premium, options.selectedProduct!.totalPremium.Single);
    assert.equal(policy.totalPaid, policy.premium);
    assert.doesNotMatch(JSON.stringify(policy), /Other payment frequencies/);
  });
}
for (const product of ['s3pp', 's4pp']) {
  test(`${product}: staged payouts reconcile to the sum assured`, () => {
    const options = quotationFixture(product);
    const policy = buildQuotationModel(options).policies[0];
    assert.equal(policy.summary[2].rows.length, product === 's3pp' ? 3 : 4);
    const total = policy.summary[2].rows.reduce((sum, row) => sum + Number(row[1].replace(/[^0-9]/g, '')), 0);
    assert.equal(total, options.input.sumAssured);
  });
}
for (const stipend of [1, 2, 3]) {
  test(`child plan ${stipend}%: uses the selected stipend percentage`, () => {
    const options = quotationFixture(`scep_${stipend}`);
    const policy = buildQuotationModel(options).policies[0];
    assert.equal(policy.summary[1].rows.find(row => row[0].startsWith('Monthly education'))![1], quoteMoney(options.input.sumAssured * stipend / 100));
  });
}

test('missing / ineligible / invalid calculation fails instead of exporting a misleading quote', () => {
  const options = quotationFixture();
  assert.throws(() => buildQuotationModel({ ...options, selectedProduct: undefined }), /eligible plan/);
  assert.throws(() => buildQuotationModel({ ...options, sdppData: undefined }), /missing/);
  assert.throws(() => buildQuotationModel({ ...options, input: { ...options.input, term: 0 } }), /valid term/);
  assert.throws(() => quoteMoney(NaN), /invalid/);
});

test('filenames include plan and precise time, use safe characters', () => {
  const options = comboFixture();
  const filename = quotationFilename(options, new Date('2026-10-15T13:24:12Z'));
  assert.match(filename, /Combo_Quotation_20261015T132412\.pdf$/);
  assert.doesNotMatch(filename, /[\\/:*?"<>|]/);
});


for (const type of ['classic', 'standard', 'none'] as const) {
  test(`CI ${type}: appendix matches the selected and priced rider only`, async () => {
    const { ciQuotationFixture } = await import('./fixtures');
    const options = ciQuotationFixture(type);
    const policy = buildQuotationModel(options).policies[0];
    if (type === 'none') assert.equal(policy.criticalIllness, undefined);
    else {
      assert.equal(policy.criticalIllness?.type, type);
      assert.equal(policy.criticalIllness?.coverage, 720000);
    }
  });
}

test('no Classic/Standard appendix is invented for built-in SDPP CI or ineligible CI', async () => {
  assert.equal(buildQuotationModel(quotationFixture()).policies[0].criticalIllness, undefined);
  const { ciQuotationFixture } = await import('./fixtures');
  const options = ciQuotationFixture('classic');
  options.input.sumAssured = 100000;
  assert.equal(buildQuotationModel(options).policies[0].criticalIllness, undefined);
  options.input.hasCIStandard = true;
  assert.throws(() => buildQuotationModel(options), /only one Critical Illness rider/);
});

test('tax rebate: 10% of yearly premium up to 10% of sum assured, capped at BDT 750,000', () => {
  assert.equal(taxRebateAmount(87178, { isDeposit: false, sumAssured: 1440000 }), 8718);
  // Single premium above the 10%-of-SA eligibility cap: only 10% of SA counts.
  assert.equal(taxRebateAmount(1440000, { isDeposit: false, sumAssured: 1440000 }), 14400);
  assert.equal(taxRebateAmount(9000000, { isDeposit: false, sumAssured: 100000000 }), 750000);
  // SDPP deposits count in full — the 10%-of-SA cap is a life-premium rule.
  assert.equal(taxRebateAmount(120000, { isDeposit: true }), 12000);
  assert.equal(taxRebateAmount(120000, { isDeposit: true, sumAssured: 100000 }), 12000);
  assert.equal(taxRebateAmount(9000000, { isDeposit: true }), 750000);
});

test('benefits: no-rider endowment has survival + death only, with rebate and hospital perk', () => {
  const options = quotationFixture('endowment', 'Monthly', 15);
  const policy = buildQuotationModel(options).policies[0];
  assert.equal(policy.coverage, 1440000);
  assert.equal(policy.isSDPP, false);
  assert.deepEqual(policy.benefits.survival.rows[0][1], quoteMoney(1440000));
  assert.deepEqual(policy.benefits.survival.rows[1], ['Tax rebate (10% of yearly premium)', `Up to ${quoteMoney(8718)} / year`]);
  assert.deepEqual(policy.benefits.survival.rows[2][1], 'Up to 40% off');
  assert.match(policy.benefits.survival.note!, /Income Tax Act 2023 \(Finance Act 2026\)/);
  assert.deepEqual(policy.benefits.uncertainties, undefined);
  assert.deepEqual(policy.benefits.death.rows.length, 1);
  assert.deepEqual(policy.benefits.death.rows[0][1], quoteMoney(1440000));
});

test('benefits: CI + accidental rider sort into Uncertainties and Death parts', async () => {
  const { ciQuotationFixture } = await import('./fixtures');
  const options = ciQuotationFixture('classic');
  options.input.hasAccidentalProtection = true;
  options.selectedProduct = calculatePremiums(options.input).find(result => result.productId === 'endowment')!;
  const policy = buildQuotationModel(options).policies[0];
  const uncertainties = policy.benefits.uncertainties!;
  assert.deepEqual(uncertainties.rows.length, 4);
  assert.deepEqual(uncertainties.rows[0], ['Critical illness — Classic', `Up to ${quoteMoney(720000)}`]);
  assert.deepEqual(uncertainties.rows[1], ['Accidental medical reimbursement', `Up to ${quoteMoney(216000)}`]);
  assert.deepEqual(uncertainties.rows[2][0], 'Accidental permanent total disability (APTD)');
  assert.deepEqual(uncertainties.rows[3][0], 'Accidental permanent partial disability (APPD)');
  assert.deepEqual(policy.benefits.death.rows[1], ['Accidental death cover (total)', quoteMoney(2880000)]);
  assert.deepEqual(policy.benefits.survival.rows[1], ['Tax rebate (10% of yearly premium)', `Up to ${quoteMoney(12776)} / year`]);
});

test('benefits: SCEP stipend and waiver sit in Death Coverage', () => {
  const options = quotationFixture('scep_2', 'Monthly', 15);
  const policy = buildQuotationModel(options).policies[0];
  assert.deepEqual(policy.benefits.death.rows[1], ['Monthly education stipend on covered parental death', `${quoteMoney(28800)} / month`]);
  assert.deepEqual(policy.benefits.death.rows[2][0], 'Waiver of premium');
});

test('benefits: SSPE rebate is capped by 10% of sum assured, death cover is the maturity value', () => {
  const options = quotationFixture('sspe', 'Single');
  const policy = buildQuotationModel(options).policies[0];
  assert.deepEqual(policy.benefits.survival.rows[1], ['Tax rebate (10% of yearly premium)', `Up to ${quoteMoney(14400)} / year`]);
  assert.deepEqual(policy.benefits.death.rows[0][1], quoteMoney(2505600));
});

test('benefits: SDPP Elite has CI + hospital + APTD uncertainties and a deposit-based rebate', () => {
  const options = quotationFixture('sdpp_elite', 'Monthly', 12);
  const policy = buildQuotationModel(options).policies[0];
  assert.equal(policy.coverage, 1440000);
  assert.equal(policy.isSDPP, true);
  assert.deepEqual(policy.benefits.survival.rows[2], ['Tax rebate (10% of yearly deposit)', `Up to ${quoteMoney(12000)} / year`]);
  assert.deepEqual(policy.benefits.survival.rows[3][1], 'Up to 40% off');
  const uncertainties = policy.benefits.uncertainties!;
  assert.deepEqual(uncertainties.rows.length, 3);
  assert.deepEqual(uncertainties.rows[0], ['Critical illness coverage', `Up to ${quoteMoney(720000)}`]);
  assert.deepEqual(uncertainties.rows[1], ['Hospital coverage (25 days / year)', quoteMoney(250000)]);
  assert.deepEqual(uncertainties.rows[2], ['Accidental permanent total disability (APTD)', quoteMoney(2880000)]);
  assert.deepEqual(policy.benefits.death.rows[1], ['Accidental death benefit', quoteMoney(4320000)]);
});

test('benefits: SDPP Prime coverage falls back to the deposit-derived cover', () => {
  const options = quotationFixture('sdpp_prime', 'Monthly', 12);
  const policy = buildQuotationModel(options).policies[0];
  assert.equal(policy.coverage, 120000 * 12);
  assert.deepEqual(policy.benefits.death.rows[0][1], 'Current account value or Paid Basic premium, whichever is higher');
  assert.deepEqual(policy.benefits.death.rows[1], ['Accidental death benefit', `${quoteMoney(2880000)} + death benefit`]);
  assert.deepEqual(policy.benefits.uncertainties!.rows.length, 1);
});

test('benefits: combo shows a real rebate on each policy', () => {
  const model = buildQuotationModel(comboFixture());
  assert.deepEqual(model.policies[0].benefits.survival.rows[1], ['Tax rebate (10% of yearly premium)', `Up to ${quoteMoney(11569)} / year`]);
  assert.deepEqual(model.policies[1].benefits.survival.rows[3], ['Tax rebate (10% of yearly deposit)', `Up to ${quoteMoney(12000)} / year`]);
});
