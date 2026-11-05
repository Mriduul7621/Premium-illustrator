import { 
  MODAL_FACTORS, 
  SCEP_1_ANNUAL_RATES,
  SCEP_2_ANNUAL_RATES,
  SCEP_3_ANNUAL_RATES,
  ENDOWMENT_ANNUAL_RATES,
  SPE_MATURITY_TABLE,
  SCEP_1_SINGLE_RATES,
  SCEP_2_SINGLE_RATES,
  SCEP_3_SINGLE_RATES
} from '../data/rates';
import { CalculationInput, CalculationResult, PlanFrequency, ProjectionRow } from '../data/types';
import { runSDPPCalculations } from './sdpCalculator';
import { SCEP_CSV, ENDOWMENT_CSV, SSPE_CSV, SCEP_SINGLE_CSV } from '../data/csv_rates';
import { ETI_RATES } from '../data/eti_rates';
import { S4PP_ANNUAL_RATES, S4PP_CSV, S4PP_ETI_RATES } from '../data/s4pp_rates';
import { S3PP_ANNUAL_RATES, S3PP_CSV, S3PP_ETI_RATES } from '../data/s3pp_rates';

import { ciCoverageAmount, isCiRiderEligible } from '../data/ciDiseases';
import { getCIRate } from '../lib/rateLookup';

// Accidental rider (Rider Brochure): per BDT 1,000 of rider coverage,
// age 18-55 -> Tk 5.57; age 56-60 -> Tk 6.69; rider SA max BDT 50 lakh.
const ACCIDENTAL_RATE_YOUNG = 5.57;
const ACCIDENTAL_RATE_OLDER = 6.69;
const ACCIDENTAL_MAX_SA = 5000000;
export const accidentalRateForAge = (age: number): number => {
  if (age >= 18 && age <= 55) return ACCIDENTAL_RATE_YOUNG;
  if (age >= 56 && age <= 60) return ACCIDENTAL_RATE_OLDER;
  return 0;
};

/** Age Nearest Birthday (ANB) - the pricing age basis in the certificates. */
export function ageNearestBirthday(birth: Date, reference: Date): number {
  let years = reference.getFullYear() - birth.getFullYear();
  let months = reference.getMonth() - birth.getMonth();
  if (reference.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  return years + (months >= 6 ? 1 : 0);
}

export function calculateSAFromPremium(input: CalculationInput, selectedProductId: string): number {
  const { age, term, targetPremium, paymentMethod } = input;
  if (!targetPremium || targetPremium <= 0) return input.sumAssured;

  // We need to find the rate for the selected product
  const products = [
    { id: 'endowment', name: 'Shanta Endowment Plan', rates: ENDOWMENT_ANNUAL_RATES },
    { id: 's3pp', name: 'Shanta 3 Stage Plan', rates: S3PP_ANNUAL_RATES },
    { id: 's4pp', name: 'Shanta 4 Stage Plan', rates: S4PP_ANNUAL_RATES },
    { id: 'sspe', name: 'Shanta Single Premium Endowment', rates: SPE_MATURITY_TABLE }, 
    { id: 'scep_1', name: 'Shanta Child Education Plan (1%)', rates: SCEP_1_ANNUAL_RATES },
    { id: 'scep_2', name: 'Shanta Child Education Plan (2%)', rates: SCEP_2_ANNUAL_RATES },
    { id: 'scep_3', name: 'Shanta Child Education Plan (3%)', rates: SCEP_3_ANNUAL_RATES },
    { id: 'scep_single_1', name: 'Shanta Child Education (Single) 1%', rates: SCEP_1_SINGLE_RATES },
    { id: 'scep_single_2', name: 'Shanta Child Education (Single) 2%', rates: SCEP_2_SINGLE_RATES },
    { id: 'scep_single_3', name: 'Shanta Child Education (Single) 3%', rates: SCEP_3_SINGLE_RATES },
  ];

  const product = products.find(p => p.id === selectedProductId) || products[0];
  const isSSPE = product.id === 'sspe';
  
  if (isSSPE) {
    // For SSPE, Premium = Sum Assured
    return targetPremium;
  }

  // Exact age x term lookup only. A missing cell means the combination is
  // not priced - never substitute a neighbouring age or term silently.
  const baseRate = product.rates[age]?.[term] ?? 0;

  if (baseRate === 0) return input.sumAssured;

  const modalFactor = MODAL_FACTORS[paymentMethod] || 1;
  const isSinglePremiumPlan = product.id.startsWith('scep_single_');

  // Target Premium fixes the BASIC policy premium and determines its Sum Assured.
  // Optional rider charges are calculated afterwards from that resulting SA;
  // they must not reduce SA or be deducted from the target base premium.
  const effectiveModalFactor = isSinglePremiumPlan ? 1 : modalFactor;
  const sa = (targetPremium * 1000) / (effectiveModalFactor * baseRate);
  return Math.ceil(sa / 1000) * 1000; // Round up to nearest 1000

}

export function calculateProjection(input: CalculationInput, selectedProductId: string): ProjectionRow[] {
  const { term, sumAssured, age } = input;
  const projection: ProjectionRow[] = [];
  
  // Find the appropriate CSV table
  let csvTable: Record<number, Record<number, number>> | null = null;
  if (selectedProductId === 'endowment') csvTable = ENDOWMENT_CSV;
  else if (selectedProductId === 's3pp') csvTable = S3PP_CSV;
  else if (selectedProductId === 's4pp') csvTable = S4PP_CSV;
  else if (selectedProductId === 'sspe') csvTable = SSPE_CSV;
  else if (selectedProductId.startsWith('scep_single')) csvTable = SCEP_SINGLE_CSV;
  else if (selectedProductId.startsWith('scep')) csvTable = SCEP_CSV;

  // Get base premium for the selected product
  const results = calculatePremiums(input);
  const selectedProduct = results.find(r => r.productId === selectedProductId);
  const modalPremium = selectedProduct ? selectedProduct.basePremium[input.paymentMethod] : 0;
  const isSinglePremium = input.paymentMethod === 'Single';

  const installmentsPerYear = {
    'Monthly': 12,
    'Quarterly': 4,
    'Half-yearly': 2,
    'Yearly': 1,
    'Single': 1
  }[input.paymentMethod] || 1;

  const yearlyTotal = isSinglePremium ? modalPremium : (modalPremium * installmentsPerYear);

  const isSSPEProduct = selectedProductId === 'sspe';
  const isScepSingle = selectedProductId.startsWith('scep_single');
  // SSPE and SCEP-Single certificates: RPU/ETI are NOT available.
  const nonForfeitureAvailable = !isSSPEProduct && !isScepSingle;
  // SSPE has NO policy loan; all other illustrated products allow up to
  // 80% of CSV from the 4th policy year.
  const loanAvailable = !isSSPEProduct;
  const sspeMaturityBenefit = isSSPEProduct ? (selectedProduct?.maturityValue || sumAssured) : sumAssured;

  let cumulativePremium = 0;
  for (let t = 1; t <= term; t++) {
    const csvRate = (csvTable && csvTable[term]) ? csvTable[term][t] || 0 : 0;
    // CSV basis: SSPE's table is per BDT 1,000 of MATURITY BENEFIT (not of
    // premium); every other product's table is per 1,000 of sum assured.
    // The certificates deduct a BDT 200 processing fee from the table value.
    const csvBase = isSSPEProduct ? sspeMaturityBenefit : sumAssured;
    const csvGross = Math.ceil((csvBase / 1000) * csvRate);
    const surrenderValue = csvGross > 0 ? Math.max(0, csvGross - 200) : 0;

    // Calculate yearly premium paid (WITHOUT RIDERS as requested)
    const yearlyPremiumIncr = (isSinglePremium ? (t === 1 ? yearlyTotal : 0) : yearlyTotal);
    cumulativePremium += yearlyPremiumIncr;

    // RPU Calculation
    // Months paid / Months originally payable
    // Year t, months paid = t * 12 (if not single premium)
    const monthsPaid = isSinglePremium ? term * 12 : t * 12;
    const totalMonths = term * 12;
    const rpuFactor = Math.min(monthsPaid / totalMonths, 1);

    // Stage payments are made AT the stage year-end, so a stage due in year t
    // is already paid when valuing the end of year t (certificate wording:
    // deduct stages already paid).
    let partialMaturitiesPaid = 0;
    if (selectedProductId === 's3pp') {
      if (t * 3 >= term) partialMaturitiesPaid += sumAssured * 0.25;
      if (t * 3 >= term * 2) partialMaturitiesPaid += sumAssured * 0.25;
    } else if (selectedProductId === 's4pp') {
      if (t * 4 >= term) partialMaturitiesPaid += sumAssured * 0.15;
      if (t * 4 >= term * 2) partialMaturitiesPaid += sumAssured * 0.15;
      if (t * 4 >= term * 3) partialMaturitiesPaid += sumAssured * 0.15;
    }

    const paidUpValue = nonForfeitureAvailable && t >= 2 ? Math.max(0, Math.ceil((sumAssured * rpuFactor) - partialMaturitiesPaid)) : 0;

    // ETI (Extended Term Insurance), certificate method: the ETI rate is an
    // ANNUAL rate per BDT 1,000, so keeping the full cover to the original
    // maturity date costs rate x remaining years x SA/1,000, paid out of the
    // net surrender value. Any balance is returned in cash; if the surrender
    // value cannot fund the full cover, the ETI cover reduces instead and
    // there is no cash back.
    const remTerm = term - t;
    let etiCoverage = 0;
    let etiDurationStr = '—';
    let etiSurplus = 0;

    if (nonForfeitureAvailable && surrenderValue > 0 && remTerm > 0) {
      const activeEtiTable = selectedProductId === 's4pp' ? S4PP_ETI_RATES : (selectedProductId === 's3pp' ? S3PP_ETI_RATES : ETI_RATES);
      const rateFull = activeEtiTable[age + t]?.[remTerm];
      if (rateFull) {
        const costFull = (sumAssured / 1000) * rateFull * remTerm;
        if (surrenderValue >= costFull) {
          etiCoverage = sumAssured;
          etiSurplus = Math.floor(surrenderValue - costFull);
        } else {
          etiCoverage = Math.floor(surrenderValue / (rateFull * remTerm)) * 1000;
          etiSurplus = 0;
        }
        etiDurationStr = "+" + etiSurplus.toLocaleString();
      }
    }

    const loanValue = loanAvailable && t >= 4 ? Math.floor(surrenderValue * 0.8) : 0;

    projection.push({
      year: t,
      premium: cumulativePremium,
      deathBenefit: isSSPEProduct ? sspeMaturityBenefit : sumAssured,
      surrenderValue: surrenderValue,
      maturityValue: t === term ? (selectedProduct?.maturityValue || sumAssured) : 0,
      paidUpValue: paidUpValue,
      etiCoverage: etiCoverage,
      etiSurplus: etiSurplus,
      etiDurationStr: etiDurationStr,
      loanValue: loanValue
    });
  }

  return projection;
}

export function calculatePremiums(input: CalculationInput): (CalculationResult | any)[] {
  const { age, term, sumAssured, gender, hasAccidentalProtection, hasCIClassic, hasCIStandard } = input;
  
  const products = [
    { id: 'endowment', name: 'Shanta Endowment Plan', rates: ENDOWMENT_ANNUAL_RATES }, 
    { id: 's3pp', name: 'Shanta 3 Stage Plan', rates: S3PP_ANNUAL_RATES },
    { id: 's4pp', name: 'Shanta 4 Stage Plan', rates: S4PP_ANNUAL_RATES },
    { id: 'sspe', name: 'Shanta Single Premium Endowment', rates: SPE_MATURITY_TABLE }, 
    { id: 'scep_1', name: 'Shanta Child Education Plan (1%)', rates: SCEP_1_ANNUAL_RATES },
    { id: 'scep_2', name: 'Shanta Child Education Plan (2%)', rates: SCEP_2_ANNUAL_RATES },
    { id: 'scep_3', name: 'Shanta Child Education Plan (3%)', rates: SCEP_3_ANNUAL_RATES },
    { id: 'scep_single_1', name: 'Shanta Child Education (Single) 1%', rates: SCEP_1_SINGLE_RATES },
    { id: 'scep_single_2', name: 'Shanta Child Education (Single) 2%', rates: SCEP_2_SINGLE_RATES },
    { id: 'scep_single_3', name: 'Shanta Child Education (Single) 3%', rates: SCEP_3_SINGLE_RATES },
  ];

  const standardResults = products.map(product => {
    // Exact age x term lookup only (certificate tables). A missing cell means
    // this age/term combination is not priced for the product - report it as
    // not applicable instead of silently substituting a neighbouring cell.
    const baseRate = product.rates[age]?.[term] ?? null;
    
    if (!baseRate) {
      return {
        productId: product.id,
        productName: product.name,
        pricePer1000: 0,
        basePremium: Object.fromEntries(Object.keys(MODAL_FACTORS).map(f => [f, 0])) as any,
        riderPremium: Object.fromEntries(Object.keys(MODAL_FACTORS).map(f => [f, 0])) as any,
        totalPremium: Object.fromEntries(Object.keys(MODAL_FACTORS).map(f => [f, 0])) as any,
        isApplicable: false,
        message: `Not applicable for Age ${age} & Term ${term}`
      };
    }

    const isSSPE = product.id === 'sspe';
    const isSinglePremiumSCEP = product.id.startsWith('scep_single_');
    const isSinglePremiumPlan = isSSPE || isSinglePremiumSCEP;

    // For SSPE, sumAssured is the premium, and baseRate is the maturity factor
    // For others, baseRate is rate per 1000 SA
    const basePremiumYearly = isSSPE ? sumAssured : (baseRate * sumAssured) / 1000;
    const maturityValue = isSSPE ? Math.ceil(sumAssured * baseRate) : sumAssured;
    
    // Calculate individual riders. SSPE has NO riders (certificate) - its
    // accidental add-on is embedded and capped separately.
    let adbYearly = 0;
    let ciClassicYearly = 0;
    let ciStandardYearly = 0;

    if (hasAccidentalProtection && !isSSPE) {
      const riderSA = Math.min(sumAssured, ACCIDENTAL_MAX_SA);
      adbYearly = (accidentalRateForAge(age) * riderSA) / 1000;
    }

    // CI Eligibility - Coverage is 50% of Sum Assured, max 15 Lakh (1,500,000)
    // per the Rider Brochure. Shared rider rules live in data/ciDiseases so
    // pricing, the app and the report agree.
    const isCIEligible = !isSSPE && isCiRiderEligible(sumAssured);
    const ciCoverage = ciCoverageAmount(sumAssured);
    if (hasCIClassic && isCIEligible) {
      ciClassicYearly = (getCIRate(age, term, gender, 'Classic') * ciCoverage) / 1000;
    }
    if (hasCIStandard && isCIEligible) {
      ciStandardYearly = (getCIRate(age, term, gender, 'Standard') * ciCoverage) / 1000;
    }

    const riderPremiumYearly = adbYearly + ciClassicYearly + ciStandardYearly;
    const finalTotalPremiumYearly = basePremiumYearly + riderPremiumYearly;

    const basePremium: any = {};
    const riderPremium: any = {};
    const totalPremium: any = {};
    const adbPremium: any = {};
    const ciClassicPremium: any = {};
    const ciStandardPremium: any = {};

    (Object.keys(MODAL_FACTORS) as PlanFrequency[]).forEach(freq => {
      if (isSinglePremiumPlan) {
        const bp = freq === 'Single' ? Math.ceil(basePremiumYearly) : 0;
        const adb = freq === 'Single' ? Math.ceil(adbYearly) : 0;
        const cic = freq === 'Single' ? Math.ceil(ciClassicYearly) : 0;
        const cis = freq === 'Single' ? Math.ceil(ciStandardYearly) : 0;

        basePremium[freq] = bp;
        adbPremium[freq] = adb;
        ciClassicPremium[freq] = cic;
        ciStandardPremium[freq] = cis;
        riderPremium[freq] = adb + cic + cis;
        totalPremium[freq] = bp + riderPremium[freq];
      } else {
        if (freq === 'Single') {
          basePremium[freq] = 0;
          riderPremium[freq] = 0;
          totalPremium[freq] = 0;
          adbPremium[freq] = 0;
          ciClassicPremium[freq] = 0;
          ciStandardPremium[freq] = 0;
        } else {
          const bp = Math.ceil(basePremiumYearly * MODAL_FACTORS[freq]);
          const adb = Math.ceil(adbYearly * MODAL_FACTORS[freq]);
          const cic = Math.ceil(ciClassicYearly * MODAL_FACTORS[freq]);
          const cis = Math.ceil(ciStandardYearly * MODAL_FACTORS[freq]);
          
          basePremium[freq] = bp;
          adbPremium[freq] = adb;
          ciClassicPremium[freq] = cic;
          ciStandardPremium[freq] = cis;
          riderPremium[freq] = adb + cic + cis;
          totalPremium[freq] = bp + riderPremium[freq];
        }
      }
    });

    return {
      productId: product.id,
      productName: product.name,
      pricePer1000: baseRate,
      basePremium,
      riderPremium,
      totalPremium,
      adbPremium,
      ciClassicPremium,
      ciStandardPremium,
      isApplicable: true,
      hasCIBenefit: isCIEligible && (hasCIClassic || hasCIStandard),
      maturityValue, // Include maturity value for reference
      isSinglePremiumEndowment: isSSPE
    };
  });

  return standardResults;
}


export function calculateSDPPResult(input: CalculationInput) {
  const plans: {id: string; name: string; plan: string}[] = [
    { id: 'sdpp_signature', name: "Shanta Depositor's Protection Plan - Signature", plan: 'Signature' },
    { id: 'sdpp_elite', name: "Shanta Depositor's Protection Plan - Elite", plan: 'Elite' },
    { id: 'sdpp_prime', name: "Shanta Depositor's Protection Plan - Prime", plan: 'Prime' },
  ];

  return plans.map(p => {
    const res = runSDPPCalculations({
      ...input,
      sdppPlan: p.plan as any,
      targetPremium: input.targetPremium ?? 0
    });

    // Calculate rider total for modes
    const riderMonthlyTotal = res.ciMonthlyPremium + res.hiMonthlyPremium;

    return {
      productId: p.id,
      productName: p.name,
      isApplicable: res.errors.length === 0,
      message: res.errors[0],
      totalPremium: {
        Monthly: (res.annualPremium / 12) + riderMonthlyTotal,
        Quarterly: (res.annualPremium / 4) + (riderMonthlyTotal * 3),
        'Half-yearly': (res.annualPremium / 2) + (riderMonthlyTotal * 6),
        Yearly: res.annualPremium + (riderMonthlyTotal * 12)
      },
      sumAssured: typeof res.sumAssured === 'number' ? res.sumAssured : (res.annualPremium * (input.term || 10)),
      maturityValue: res.customMaturity || res.maturity7 || 0,
      sdppData: res
    };
  });
}
