/**
 * Display helpers for the redesigned quotation preview (PlanQuotationModal).
 *
 * These functions only re-shape values the calculation engine already produced
 * (per-mode premiums, maturity value, sum assured) into the rows the preview
 * shows. They contain no rates and no pricing logic: mode totals use the same
 * premium x payments formula as the quotation model, stage payouts use the
 * same percentages and rounded years as the quotation model and the app's
 * maturity schedule, and rider figures follow the quotation model. Nothing
 * here feeds the PDF - the PDF keeps using quotationModel unchanged.
 */
import type { CalculationResult, PlanFrequency } from '../data/types';
import { paymentsPerYear } from './quotationModel';

export interface ModeComparisonRow {
  mode: PlanFrequency;
  /** Premium for one payment in this mode (engine output). */
  premium: number;
  /** Premium for this mode multiplied by the number of payments over the term. */
  totalPaid: number;
  /** Maturity payout, the same in every mode. */
  maturity: number;
  /** Death cover, the same in every mode. */
  deathCover: number;
  selected: boolean;
}

const MODE_ORDER: PlanFrequency[] = ['Monthly', 'Quarterly', 'Half-yearly', 'Yearly', 'Single'];

/** Number of payments over the whole term for a mode (Single is paid once). */
export const paymentsOverTerm = (mode: PlanFrequency, term: number): number =>
  (mode === 'Single' ? 1 : paymentsPerYear(mode) * term);

/**
 * One row per payment mode the product actually offers. Modes whose engine
 * premium is zero - Single on regular plans - are left out, so a regular plan
 * shows four rows and a single-premium plan shows one. Maturity and death
 * cover are the same in every mode; only the premium and the total paid
 * change, because each mode has its own pricing.
 */
export function modeComparisonRows(
  product: CalculationResult,
  term: number,
  maturityValue: number,
  deathCover: number,
  selectedMode: PlanFrequency,
): ModeComparisonRow[] {
  return MODE_ORDER
    .filter((mode) => (product.totalPremium[mode] ?? 0) > 0)
    .map((mode) => {
      const premium = product.totalPremium[mode];
      return {
        mode,
        premium,
        totalPaid: premium * paymentsOverTerm(mode, term),
        maturity: maturityValue,
        deathCover,
        selected: mode === selectedMode,
      };
    });
}

export interface StagePayout {
  /** Policy year the payout falls in (1 = first policy year). */
  policyYear: number;
  /** Calendar year, from the issue year. */
  calendarYear: number;
  label: string;
  /** Share of the sum assured, as a whole number (25 means 25%). */
  percent: number;
  amount: number;
}

/**
 * Year-wise stage payouts for the 3-stage and 4-stage plans, using the same
 * percentages and rounded years as the quotation model and the app's maturity
 * schedule: S3PP 25% + 25% + 50%, S4PP 15% + 15% + 15% + 55%. The payouts add
 * up to the full sum assured; they are not additional to it. Other products
 * have no stages, so this returns an empty list.
 */
export function stagePayouts(
  productId: string,
  term: number,
  sumAssured: number,
  issueYear: number,
): StagePayout[] {
  if (productId === 's3pp') {
    return [
      { policyYear: Math.round(term / 3), calendarYear: issueYear + Math.round(term / 3), label: 'Stage 1', percent: 25, amount: sumAssured * 0.25 },
      { policyYear: Math.round((term * 2) / 3), calendarYear: issueYear + Math.round((term * 2) / 3), label: 'Stage 2', percent: 25, amount: sumAssured * 0.25 },
      { policyYear: term, calendarYear: issueYear + term, label: 'At maturity', percent: 50, amount: sumAssured * 0.5 },
    ];
  }
  if (productId === 's4pp') {
    return [1, 2, 3].map((part) => ({
      policyYear: Math.round((term * part) / 4),
      calendarYear: issueYear + Math.round((term * part) / 4),
      label: `Stage ${part}`,
      percent: 15,
      amount: sumAssured * 0.15,
    })).concat([{ policyYear: term, calendarYear: issueYear + term, label: 'At maturity', percent: 55, amount: sumAssured * 0.55 }]);
  }
  return [];
}

/**
 * Monthly education stipend for Child Education plans, parsed from the product
 * id the same way the rest of the app does (1% / 2% / 3% of the sum assured,
 * paid every month until maturity on covered parental death). Returns null for
 * products that carry no stipend.
 */
export function scepStipend(productId: string, sumAssured: number): { percent: number; monthly: number } | null {
  if (!productId.startsWith('scep')) return null;
  const percent = Number(productId.split('_').pop()) / 100;
  if (!Number.isFinite(percent) || percent <= 0) return null;
  return { percent, monthly: sumAssured * percent };
}

/**
 * Natural death cover: SSPE pays its maturity benefit (its input amount is the
 * premium, not a sum assured); every other standard plan pays the sum assured.
 * Same rule as the quotation model.
 */
export function naturalDeathCover(product: CalculationResult, sumAssured: number): number {
  return product.productId === 'sspe' ? (product.maturityValue ?? sumAssured) : sumAssured;
}

export interface AccidentalRiderBenefits {
  /** Total accidental death cover: base cover + rider sum assured. */
  deathCoverTotal: number;
  /** Accidental permanent total / partial disability, each. */
  disabilityEach: number;
  /** Accidental medical reimbursement, maximum. */
  medicalReimbursementMax: number;
}

/**
 * Accidental Protection rider benefits, as stated in the quotation model
 * (Rider Brochure): the rider pays its own sum assured - the base sum assured
 * capped at BDT 50 lakh - on top of the base cover, and medical reimbursement
 * is 15% of the main policy amount, capped at BDT 500,000.
 */
export function accidentalRiderBenefits(sumAssured: number): AccidentalRiderBenefits {
  const riderSumAssured = Math.min(sumAssured, 5_000_000);
  return {
    deathCoverTotal: sumAssured + riderSumAssured,
    disabilityEach: riderSumAssured,
    medicalReimbursementMax: Math.min(sumAssured * 0.15, 500_000),
  };
}
