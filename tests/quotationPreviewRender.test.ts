import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import PlanQuotationModal from '../src/components/PlanQuotationModal';
import PremiumBreakdownModal from '../src/components/PremiumBreakdownModal';
import ModeComparisonModal from '../src/components/ModeComparisonModal';
import CriticalIllnessDialog from '../src/components/CriticalIllnessDialog';
import { calculatePremiums } from '../src/services/calculator';
import { formatCurrency } from '../src/lib/utils';
import { ciCoverageAmount, CI_MINOR_BENEFIT_SHARE, CI_MAJOR_BENEFIT_SHARE_AFTER_MINOR } from '../src/data/ciDiseases';
import { quotationFixture, comboFixture, ciQuotationFixture } from './fixtures';

/** Renders the quotation preview to static HTML with real engine data. */
const renderPreview = (options: any, extra: any = {}): string =>
  // React SSR inserts <!-- --> between text and expressions; strip them so
  // checks match the text a browser user actually sees.
  renderToString(React.createElement(PlanQuotationModal, { ...options, isOpen: true, embedded: true, showProjection: false, onClose: () => {}, onViewPremiumBreakdown: () => {}, onViewModeComparison: () => {}, ...extra })).replace(/<!-- -->/g, '');

/** Renders the premium breakdown dialog to static HTML. */
const renderBreakdown = (options: any, isOpen: boolean): string =>
  renderToString(React.createElement(PremiumBreakdownModal, { isOpen, onClose: () => {}, input: options.input, selectedProduct: options.selectedProduct })).replace(/<!-- -->/g, '');

/** Renders the mode comparison dialog to static HTML. */
const renderCompare = (options: any, isOpen: boolean): string =>
  renderToString(React.createElement(ModeComparisonModal, { isOpen, onClose: () => {}, input: options.input, selectedProduct: options.selectedProduct })).replace(/<!-- -->/g, '');

/** Renders the critical illness disease dialog to static HTML. */
const renderCiDialog = (options: any, view: 'classic' | 'standard' | null): string =>
  renderToString(React.createElement(CriticalIllnessDialog, { view, onClose: () => {}, input: options.input, onDownload: () => {} })).replace(/<!-- -->/g, '');

test('standard preview: hero and three-part benefits in order, with engine figures', () => {
  const options = quotationFixture('endowment', 'Monthly', 15);
  const html = renderPreview(options);
  const product = options.selectedProduct!;
  const heroAt = html.indexOf('You pay');
  const benefitsAt = html.indexOf('1. Survival Benefits');
  assert.ok(heroAt > -1 && benefitsAt > heroAt, 'sections appear in the order hero, benefits');
  assert.ok(html.includes(formatCurrency(product.totalPremium.Monthly)));
  assert.ok(html.includes(formatCurrency(product.totalPremium.Monthly * 180)));
  assert.ok(html.includes(formatCurrency(1440000)));
  assert.ok(html.includes('/ month'), 'hero premium carries the period suffix');
  assert.ok(html.includes('Total payable over 15 yrs'));
  assert.ok(html.includes('You are covered for'));
  assert.ok(html.includes('Sum Assured — your family’s protection amount'));
  assert.ok(html.includes('While you are alive &amp; well'));
  assert.ok(html.includes('For your family, if you pass away.'));
  assert.ok(!html.includes('Your riders'), 'no rider section when no rider is selected');
  // Benefits use the three-part taxonomy: Survival first, Uncertainties
  // always visible (with an invite when no rider is selected), Death last.
  assert.ok(html.includes('1. Survival Benefits'));
  assert.ok(html.includes('2. Uncertainties Coverage'), 'uncertainties panel stays visible without riders');
  assert.ok(html.includes('No illness or accident cover added yet.'));
  assert.ok(html.includes('+ Add a rider to this plan →'), 'empty uncertainties state invites adding a rider');
  assert.ok(html.includes('3. Death Coverage'));
  // Tax rebate and hospital perk come with every policy.
  assert.ok(html.includes('Tax rebate (10% of yearly premium)'));
  assert.ok(html.includes(formatCurrency(8718)), 'rebate is 10% of the 87,178 yearly premium');
  assert.ok(html.includes('Income Tax Act 2023 (Finance Act 2026)'));
  assert.ok(html.includes('Lab test discount at partner hospitals'));
  assert.ok(html.includes('Up to 40%'));
  assert.ok(html.includes('View hospital list'));
  assert.ok(!html.includes('Premium Commitment &amp; Deposit Summary'), 'old premium table is replaced');
  assert.ok(!html.includes('Premium by Payment Frequency'), 'old frequency cards are replaced');
  // Edit / Share / Download live at the very end now, after all content.
  const disclaimerAt = html.indexOf('Important Disclaimer');
  const footerAt = html.indexOf('Generated via T&amp;D Team');
  const downloadAt = html.indexOf('Download PDF');
  assert.ok(downloadAt > -1, 'PDF download button is kept');
  assert.ok(downloadAt > disclaimerAt && downloadAt > footerAt, 'Download PDF sits after the disclaimer and footer notice');
  assert.ok(html.lastIndexOf('Edit inputs') > disclaimerAt, 'Edit inputs sits at the end too');
  assert.ok(html.indexOf('Share') > disclaimerAt, 'Share sits at the end too');
  assert.ok(!html.includes('Print quotation'), 'the Print button is removed — the PDF is the print path');
  assert.ok(!html.includes('PDF download includes'), 'the static download note is removed');
  // Heading: "Your illustration" + product · term · mode meta line.
  assert.ok(html.includes('Your illustration'));
  assert.ok(html.includes(product.productName), 'meta line shows the product name');
  assert.ok(html.includes('15 yrs'), 'meta line shows the policy term');
  assert.ok(html.includes('Monthly'), 'meta line shows the payment mode');
  assert.ok(!html.includes('Proposal Quotation Statement'), 'dark document banner is gone');
  assert.ok(!html.includes('Client Profile Details'), 'client grid lives in the PDF only');
  assert.ok(!html.includes('Policy Parameters'), 'policy grid lives in the PDF only');
  assert.ok(!html.includes('Page 1 of 2'), 'no page numbering in the preview');
  assert.ok(!html.includes('shanta-life-logo.png'), 'no logo block in the preview');
  // Full-width content: the narrow 800px column is gone, benefit panels pair up.
  assert.ok(!html.includes('max-w-[800px]'), 'standard content is no longer capped at 800px');
  assert.ok(html.includes('md:grid-cols-2'), 'benefit panels pair up on wider screens');
  assert.ok(html.includes('xl:grid-cols-3'), 'all three benefit panels sit side by side at desktop width');
  assert.ok(html.includes('lg:grid-cols-2'), 'good-to-know and disclaimer sit side by side on wider screens');
  // The unofficial marking stays, in the board's wording.
  assert.ok(html.includes('Unofficial — created by the Training &amp; Development Team'), 'unofficial note is kept');
  assert.ok(!html.includes('UNOFFICIAL SAMPLE ILLUSTRATION'), 'big unofficial badge is gone from the standard preview');
  // Premium breakdown and mode comparison are behind buttons now, like View Diseases.
  assert.ok(html.includes('Breakdown'), 'Breakdown button is present in the premium tile');
  assert.ok(html.includes('Compare →'), 'Compare button sits beside the Breakdown button');
  assert.ok(!html.includes('What your premium includes'), 'breakdown table is hidden by default');
  assert.ok(!html.includes('Compare Payment Modes'), 'mode comparison table is hidden by default');
});

test('standard preview: S3PP stage payouts as a timeline — dates and amounts, one line each', () => {
  const options = quotationFixture('s3pp', 'Yearly', 15);
  const html = renderPreview(options);
  // Compact stage line: years and amounts joined, as on the board.
  assert.ok(html.includes('Stage payouts'));
  assert.ok(html.includes('2031 · 2036 · 2041'), 'stage calendar years join with middots');
  assert.ok(html.includes(`${formatCurrency(360000)} + ${formatCurrency(360000)}<br/>+ ${formatCurrency(720000)}`), 'stage amounts break before the last amount, as on the board');
  assert.ok(html.includes('Total you receive'));
  assert.ok(html.includes('paid back in stages, by 2041'));
  assert.ok(html.includes('stages add up to the full cover'));
  // Expandable mobile timeline (in the DOM, collapsed by default).
  assert.ok(html.includes('See stage dates →'), 'timeline toggle is present');
  assert.ok(html.includes('First stage payout'));
  assert.ok(html.includes('Second stage payout'));
  assert.ok(html.includes('Final maturity'));
  assert.ok(html.includes('Year 5 · 2031'));
  assert.ok(html.includes('Year 10 · 2036'));
  assert.ok(html.includes('Year 15 · 2041'));
  // Desktop horizontal strip above the benefit parts.
  assert.ok(html.includes('Your money back while alive — stage payouts'));
  // The old stage table is gone.
  assert.ok(!html.includes('Stage 1 (25%)'), 'old stage table is replaced by the timeline');
  assert.ok(!html.includes('At maturity (50%)'));
  assert.ok(!html.includes('not additional to it'));
});

test('standard preview: Child Education stipend is highlighted and the death story shows all three parts', () => {
  const options = quotationFixture('scep_2', 'Monthly', 15);
  const html = renderPreview(options);
  assert.ok(html.includes('Monthly education stipend'));
  assert.ok(html.includes(formatCurrency(28800)));
  assert.ok(html.includes('border-[#F37021]'), 'stipend panel carries the orange highlight');
  assert.ok(html.includes('full sum assured again'));
  assert.ok(html.includes('Future premiums are waived'));
  assert.ok(html.includes('even after the stipend starts'));
  assert.ok(html.includes(options.selectedProduct!.productName), 'slim heading shows the child plan name');
});

test('standard preview: selected riders sort into Uncertainties and Death parts', () => {
  const options = ciQuotationFixture('classic');
  options.input.hasAccidentalProtection = true;
  options.selectedProduct = calculatePremiums(options.input).find(result => result.productId === 'endowment')!;
  const html = renderPreview(options);
  assert.ok(!html.includes('Your riders'), 'the old combined rider panel is gone');
  const uncAt = html.indexOf('2. Uncertainties Coverage');
  const deathAt = html.indexOf('3. Death Coverage');
  assert.ok(uncAt > -1 && deathAt > uncAt, 'Uncertainties comes before Death');
  // Critical illness lives in Uncertainties.
  assert.ok(html.includes('Critical Illness — Classic rider'));
  const ciAt = html.indexOf('Critical Illness — Classic rider');
  assert.ok(ciAt > uncAt && ciAt < deathAt, 'CI rider sits in Uncertainties');
  assert.ok(html.includes(formatCurrency(720000)), 'CI coverage is 50% of SA');
  assert.ok(html.includes('full coverage amount'));
  // Accidental disability + medical live in Uncertainties; accidental death in Death.
  const amrAt = html.indexOf(formatCurrency(216000));
  assert.ok(amrAt > uncAt && amrAt < deathAt, 'accidental medical reimbursement sits in Uncertainties');
  const adbAt = html.indexOf(formatCurrency(2880000));
  assert.ok(adbAt > deathAt, 'accidental death cover total sits in Death');
  assert.ok(html.includes('Accidental Protection rider'));
});

test('standard preview: single-premium SSPE rebate is capped at 10% of the sum assured', () => {
  const html = renderPreview(quotationFixture('sspe', 'Single', 10));
  assert.ok(html.includes(formatCurrency(14400)), 'SSPE rebate is 10% of the 1,44,000 eligible premium (10% of SA cap)');
  assert.ok(html.includes('https://shantalife.com/support#hospitals'), 'hospital list link is present');
});

test('standard preview: single-premium plans show no Compare button, and SSPE death cover is the maturity benefit', () => {
  const options = quotationFixture('sspe', 'Single', 10);
  const html = renderPreview(options);
  const product = options.selectedProduct!;
  assert.ok(html.includes('You pay'));
  assert.ok(html.includes('You are covered for'));
  assert.ok(!html.includes('Compare Payment Modes'), 'one mode only, so there is nothing to compare');
  assert.ok(!html.includes('Compare →'), 'no Compare button when there is only one mode');
  assert.ok(html.includes('Breakdown'), 'the Breakdown button still shows for single-premium plans');
  assert.ok(!html.includes('What you get'), 'no What-you-get header — the benefit parts follow the hero directly');
  assert.ok(html.includes('1. Survival Benefits'), 'benefits still open with Survival');
  assert.ok(html.includes(formatCurrency(product.totalPremium.Single)));
  assert.ok(html.includes(formatCurrency(product.maturityValue!)));
  // Single-premium plans have no rider step, so the empty Uncertainties
  // state says so instead of offering a rider.
  assert.ok(html.includes('2. Uncertainties Coverage'));
  assert.ok(html.includes('Riders are not available on single-payment plans'));
  assert.ok(!html.includes('+ Add a rider to this plan'), 'no add-rider invite where no rider step exists');
});

test('standard preview: projection is a flowing section with the Liquidity columns', () => {
  const options = quotationFixture('endowment', 'Monthly', 15);
  const html = renderPreview(options, { showProjection: true });
  const benefitsAt = html.indexOf('1. Survival Benefits');
  const projectionAt = html.indexOf('Policy Value Projection Trajectory');
  assert.ok(benefitsAt > -1 && projectionAt > benefitsAt, 'projection follows the benefits section');
  // Same 8 columns as the Liquidity tab, title case.
  for (const header of ['End of Year', 'Premium Paid', 'Natural Death', 'Surrender Value', 'Paid-Up Value', 'ETI Cover', 'ETI Cash Back', 'Loan (Max)']) {
    assert.ok(html.includes(header), `projection table has the ${header} column`);
  }
  assert.ok(!html.includes('ETI BENEFITS'), 'leftover ETI BENEFITS header is gone');
  assert.ok(!html.includes('BASE PREMIUM'), 'BASE PREMIUM is renamed Premium Paid');
  assert.ok(!html.includes('Active Death Coverage'), 'the redundant ETI duration display is gone');
  // Full table: header row + one row per year (15).
  assert.equal((html.match(/<tr/g) || []).length, 16, 'full projection table renders all 15 years');
  assert.ok(html.includes('Good to know before you decide'));
  assert.ok(html.includes('Important Disclaimer &amp; Notes'));
  assert.ok(!html.includes('Page 2 of 2'), 'no page-2 concept');
  assert.ok(!html.includes('shanta-life-logo.png'), 'no logo block above the projection');
});

test('standard preview: quotation tab shows a cropped projection preview, full table in Liquidity', () => {
  const options = quotationFixture('endowment', 'Monthly', 15);
  const html = renderPreview(options, { showProjection: true, projectionPreview: true });
  assert.ok(html.includes('Policy Value Projection Trajectory'));
  assert.ok(html.includes('Cropped preview — full 15-year table in the Liquidity tab'));
  // Preview: header row + years 1, 5, 10, 15 only.
  assert.equal((html.match(/<tr/g) || []).length, 5, 'cropped preview renders 4 year rows');
});

test('standard preview: Edit inputs, Share and Download PDF are the bottom-bar buttons', () => {
  const options = quotationFixture('endowment', 'Monthly', 15);
  const html = renderPreview(options);
  const editAt = html.indexOf('Edit inputs');
  const shareAt = html.indexOf('Share');
  const downloadAt = html.indexOf('Download PDF');
  assert.ok(editAt > -1 && shareAt > editAt && downloadAt > shareAt, 'bottom bar reads Edit inputs, Share, Download PDF in order');
  assert.ok(html.includes('aria-label="Edit inputs"'));
  assert.ok(html.includes('aria-label="Share illustration"'));
  assert.ok(!html.includes('Print quotation'), 'no Print button');
});

test('SDPP and combo previews keep the existing layout', () => {
  const sdppHtml = renderPreview(quotationFixture('sdpp_elite', 'Monthly', 12));
  assert.ok(sdppHtml.includes('Premium Commitment &amp; Deposit Summary'));
  assert.ok(!sdppHtml.includes('Your Plan at a Glance'));
  assert.ok(!sdppHtml.includes('Compare Payment Modes'));
  assert.ok(sdppHtml.includes('UNOFFICIAL SAMPLE ILLUSTRATION'), 'SDPP keeps the document header');
  assert.ok(sdppHtml.includes('Client Profile Details'), 'SDPP keeps the client grid');
  assert.ok(sdppHtml.includes('Download PDF'), 'SDPP keeps the download button');
  assert.ok(sdppHtml.indexOf('Download PDF') > sdppHtml.indexOf('Premium Commitment &amp; Deposit Summary'), 'buttons sit at the end for SDPP too');
  assert.ok(sdppHtml.includes('Edit inputs'), 'SDPP keeps the Edit inputs button');
  assert.ok(sdppHtml.includes('Share'), 'SDPP keeps the Share button');
  // SDPP uses the same three-part benefit taxonomy in its paper layout.
  assert.ok(sdppHtml.includes('1. Survival Benefits'));
  assert.ok(sdppHtml.includes('2. Uncertainties Coverage'));
  assert.ok(sdppHtml.includes('3. Death Coverage'));
  assert.ok(sdppHtml.includes('View hospital list'), 'SDPP shows the hospital perk too');
  assert.ok(sdppHtml.includes('Tax rebate (10% of yearly deposit)'), 'SDPP shows the rebate on the yearly deposit');
  assert.ok(sdppHtml.includes(`Up to ${formatCurrency(12000)} / yr`), 'SDPP rebate is 10% of the 1,20,000 yearly deposit');
  const comboHtml = renderPreview(comboFixture());
  assert.ok(comboHtml.includes('COMBINED PREMIUM / DEPOSIT'));
  assert.ok(!comboHtml.includes('Your Plan at a Glance'));
  assert.ok(comboHtml.includes('Proposal Quotation Statement'), 'combo keeps the document banner');
  assert.ok(comboHtml.includes('Download PDF'), 'combo keeps the download button');
  assert.ok(comboHtml.indexOf('Download PDF') > comboHtml.indexOf('COMBINED PREMIUM / DEPOSIT'), 'buttons sit at the end for combo too');
  assert.ok(comboHtml.includes('Edit inputs'), 'combo keeps the Edit inputs button');
  assert.ok(comboHtml.includes('Share'), 'combo keeps the Share button');
  assert.ok(comboHtml.includes('PARTNER HOSPITAL LAB TEST DISCOUNT'), 'combo shows the hospital perk too');
  assert.ok(comboHtml.includes('Income Tax Act 2023 (Finance Act 2026)'), 'combo rebate cites the law');
  assert.ok(comboHtml.includes(`Primary Rebate (${formatCurrency(11569)})`), 'combo primary rebate is 10% of the 1,15,690 yearly premium');
  assert.ok(comboHtml.includes(`SDPP Rebate (${formatCurrency(12000)})`), 'combo SDPP rebate is 10% of the 1,20,000 yearly deposit');
  assert.ok(comboHtml.includes(`Up to ${formatCurrency(23569)}`), 'combo total rebate adds both parts');
});

test('premium breakdown and compare buttons only render when the parent provides the callbacks', () => {
  const options = quotationFixture('endowment', 'Monthly', 15);
  const html = renderToString(React.createElement(PlanQuotationModal, { ...options, isOpen: true, embedded: true, showProjection: false, onClose: () => {} })).replace(/<!-- -->/g, '');
  assert.ok(!html.includes('Breakdown'), 'no Breakdown button without the callback, mirroring View Diseases');
  assert.ok(!html.includes('Compare →'), 'no Compare button without the callback');
});

test('premium breakdown dialog: hidden when closed, table with engine figures when open', () => {
  const options = quotationFixture('endowment', 'Monthly', 15);
  assert.equal(renderBreakdown(options, false), '', 'closed dialog renders nothing');
  const html = renderBreakdown(options, true);
  const product = options.selectedProduct!;
  assert.ok(html.includes('Premium Breakdown'));
  assert.ok(html.includes('What your premium includes'));
  assert.ok(html.includes('Basic policy'));
  assert.ok(html.includes(formatCurrency(product.basePremium.Monthly)));
  assert.ok(html.includes(formatCurrency(product.basePremium.Monthly * 180)));
  assert.ok(html.includes('Total payable'));
  assert.ok(html.includes(formatCurrency(product.totalPremium.Monthly * 180)));
  assert.ok(html.includes('Close premium breakdown'), 'dialog has a close button');
  assert.ok(html.includes('role="dialog"'), 'dialog uses the same dialog pattern as View Diseases');
});

test('premium breakdown dialog: rider rows appear only for selected riders', () => {
  const options = ciQuotationFixture('classic');
  options.input.hasAccidentalProtection = true;
  options.selectedProduct = calculatePremiums(options.input).find(result => result.productId === 'endowment')!;
  const html = renderBreakdown(options, true);
  assert.ok(html.includes('Accidental Protection rider'));
  assert.ok(html.includes('Critical Illness — Classic rider'));
  assert.ok(!html.includes('Critical Illness — Standard rider'));
});

test('mode comparison dialog: hidden when closed, table with engine figures and Selected marker when open', () => {
  const options = quotationFixture('endowment', 'Monthly', 15);
  assert.equal(renderCompare(options, false), '', 'closed dialog renders nothing');
  const html = renderCompare(options, true);
  const product = options.selectedProduct!;
  assert.ok(html.includes('Compare Payment Modes'));
  assert.ok(html.includes('Monthly'));
  assert.ok(html.includes('Quarterly'));
  assert.ok(html.includes('Half-yearly'));
  assert.ok(html.includes('Yearly'));
  assert.ok(!html.includes('Single'), 'Single is not offered on regular plans');
  assert.ok(html.includes('Selected'), 'the selected mode is marked');
  assert.ok(html.includes(formatCurrency(product.totalPremium.Monthly)));
  assert.ok(html.includes(formatCurrency(product.totalPremium.Monthly * 180)));
  assert.ok(html.includes(formatCurrency(product.maturityValue!)));
  assert.ok(html.includes('Close mode comparison'), 'dialog has a close button');
  assert.ok(html.includes('role="dialog"'), 'dialog uses the same dialog pattern as the breakdown dialog');
});

test('critical illness dialog: hidden when closed, restyled disease table with the same data when open', () => {
  const options = ciQuotationFixture('classic');
  assert.equal(renderCiDialog(options, null), '', 'closed dialog renders nothing');
  const html = renderCiDialog(options, 'classic');
  const coverage = ciCoverageAmount(options.input.sumAssured);
  assert.ok(html.includes('Critical Illness Classic'));
  assert.ok(html.includes(formatCurrency(coverage)), 'coverage amount is unchanged');
  assert.ok(html.includes('Cancer (ক্যান্সার)'), 'disease names are unchanged');
  assert.ok(html.includes('Covered disease'), 'diseases render in the breakdown-style table');
  assert.ok(!html.includes('<ol'), 'the plain numbered list is replaced by the table');
  assert.ok(html.includes('Download disease list'), 'the Download button is kept');
  assert.ok(html.includes('Close disease list'), 'dialog has a close button');
  assert.ok(html.includes('role="dialog"'), 'dialog pattern is unchanged');
  assert.ok(html.includes('ci-disease-content'), 'the download target id is kept');
});

test('critical illness dialog: Standard shows minor and major sections with the same benefit split', () => {
  const options = ciQuotationFixture('standard');
  const html = renderCiDialog(options, 'standard');
  const coverage = ciCoverageAmount(options.input.sumAssured);
  assert.ok(html.includes('Critical Illness Standard'));
  assert.ok(html.includes('Minor Critical Illness'));
  assert.ok(html.includes('Major Critical Illness'));
  assert.ok(html.includes('Cerebral Shunt Insertion (সেরিব্রাল শান্ট ইনসার্শন)'), 'minor disease names are unchanged');
  assert.ok(html.includes('Kidney Failure (কিডনি ফেইলর)'), 'major disease names are unchanged');
  assert.ok(html.includes(formatCurrency(coverage * CI_MINOR_BENEFIT_SHARE)), 'minor benefit is 30% of coverage');
  assert.ok(html.includes(formatCurrency(coverage * CI_MAJOR_BENEFIT_SHARE_AFTER_MINOR)), 'major benefit after a minor claim is 70% of coverage');
  assert.ok(!html.includes('<ol'), 'the plain numbered lists are replaced by tables');
});
