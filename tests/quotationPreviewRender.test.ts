import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import PlanQuotationModal from '../src/components/PlanQuotationModal';
import PremiumBreakdownModal from '../src/components/PremiumBreakdownModal';
import { calculatePremiums } from '../src/services/calculator';
import { formatCurrency } from '../src/lib/utils';
import { quotationFixture, comboFixture, ciQuotationFixture } from './fixtures';

/** Renders the quotation preview to static HTML with real engine data. */
const renderPreview = (options: any, extra: any = {}): string =>
  // React SSR inserts <!-- --> between text and expressions; strip them so
  // checks match the text a browser user actually sees.
  renderToString(React.createElement(PlanQuotationModal, { ...options, isOpen: true, embedded: true, showProjection: false, onClose: () => {}, onViewPremiumBreakdown: () => {}, ...extra })).replace(/<!-- -->/g, '');

/** Renders the premium breakdown dialog to static HTML. */
const renderBreakdown = (options: any, isOpen: boolean): string =>
  renderToString(React.createElement(PremiumBreakdownModal, { isOpen, onClose: () => {}, input: options.input, selectedProduct: options.selectedProduct })).replace(/<!-- -->/g, '');

test('standard preview: summary, mode comparison and core benefits in order, with engine figures', () => {
  const options = quotationFixture('endowment', 'Monthly', 15);
  const html = renderPreview(options);
  const product = options.selectedProduct!;
  const summaryAt = html.indexOf('1. Your Plan at a Glance');
  const modesAt = html.indexOf('2. Compare Payment Modes');
  const benefitsAt = html.indexOf('3. Core Benefits');
  assert.ok(summaryAt > -1 && modesAt > summaryAt && benefitsAt > modesAt, 'sections appear in the order 1 summary, 2 modes, 3 benefits');
  assert.ok(html.includes(formatCurrency(product.totalPremium.Monthly)));
  assert.ok(html.includes(formatCurrency(product.totalPremium.Monthly * 180)));
  assert.ok(html.includes(formatCurrency(1440000)));
  assert.ok(html.includes('Selected'));
  assert.ok(html.includes('If you stay alive'));
  assert.ok(html.includes('If the policyholder dies'));
  assert.ok(!html.includes('Your riders'), 'no rider section when no rider is selected');
  assert.ok(!html.includes('Premium Commitment &amp; Deposit Summary'), 'old premium table is replaced');
  assert.ok(!html.includes('Premium by Payment Frequency'), 'old frequency cards are replaced');
  assert.ok(html.includes('Download PDF'), 'PDF download button is kept');
  // Aligned app-style layout: slim heading, no document furniture.
  assert.ok(html.includes(product.productName), 'slim heading shows the product name');
  assert.ok(html.includes('15 Years'), 'slim heading shows the policy term');
  assert.ok(!html.includes('Proposal Quotation Statement'), 'dark document banner is gone');
  assert.ok(!html.includes('Client Profile Details'), 'client grid lives in the PDF only');
  assert.ok(!html.includes('Policy Parameters'), 'policy grid lives in the PDF only');
  assert.ok(!html.includes('Page 1 of 2'), 'no page numbering in the preview');
  assert.ok(!html.includes('shanta-life-logo.png'), 'no logo block in the preview');
  // The unofficial marking stays, as one subtle muted line — not the big badge.
  assert.ok(html.includes('Unofficial sample illustration'), 'unofficial note is kept');
  assert.ok(!html.includes('UNOFFICIAL SAMPLE ILLUSTRATION'), 'big unofficial badge is gone from the standard preview');
  // Premium breakdown is behind the Breakdown button now, like View Diseases.
  assert.ok(html.includes('Breakdown'), 'Breakdown button is present in the premium tile');
  assert.ok(!html.includes('What your premium includes'), 'breakdown table is hidden by default');
});

test('standard preview: S3PP stage payouts show policy year, calendar year and amount', () => {
  const options = quotationFixture('s3pp', 'Yearly', 15);
  const html = renderPreview(options);
  assert.ok(html.includes('Stage 1 (25%)'));
  assert.ok(html.includes('Year 5'));
  assert.ok(html.includes('Year 10'));
  assert.ok(html.includes('At maturity (50%)'));
  assert.ok(html.includes(formatCurrency(360000)));
  assert.ok(html.includes(formatCurrency(720000)));
  assert.ok(html.includes('Total you will receive'));
  assert.ok(html.includes('not additional to it'));
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

test('standard preview: selected riders show their benefits with amounts', () => {
  const options = ciQuotationFixture('classic');
  options.input.hasAccidentalProtection = true;
  options.selectedProduct = calculatePremiums(options.input).find(result => result.productId === 'endowment')!;
  const html = renderPreview(options);
  assert.ok(html.includes('Your riders'));
  assert.ok(html.includes(formatCurrency(2880000)), 'accidental death cover total');
  assert.ok(html.includes(formatCurrency(216000)), 'accidental medical reimbursement');
  assert.ok(html.includes('Critical Illness — Classic rider'));
  assert.ok(html.includes(formatCurrency(720000)), 'CI coverage is 50% of SA');
  assert.ok(html.includes('full coverage amount'));
  assert.ok(html.includes('Accidental Protection rider'));
});

test('standard preview: single-premium plans show no mode comparison, and SSPE death cover is the maturity benefit', () => {
  const options = quotationFixture('sspe', 'Single', 10);
  const html = renderPreview(options);
  const product = options.selectedProduct!;
  assert.ok(html.includes('1. Your Plan at a Glance'));
  assert.ok(!html.includes('2. Compare Payment Modes'), 'one mode only, so there is nothing to compare');
  assert.ok(html.includes('2. Core Benefits'), 'section numbers run in order when the mode section is hidden');
  assert.ok(html.includes(formatCurrency(product.totalPremium.Single)));
  assert.ok(html.includes(formatCurrency(product.maturityValue!)));
});

test('standard preview: projection is a flowing section with no page-2 paper concept', () => {
  const options = quotationFixture('endowment', 'Monthly', 15);
  const html = renderPreview(options, { showProjection: true });
  const benefitsAt = html.indexOf('3. Core Benefits');
  const projectionAt = html.indexOf('4. Policy Value Projection Trajectory');
  assert.ok(benefitsAt > -1 && projectionAt > benefitsAt, 'projection follows the benefits section as section 4');
  assert.ok(html.includes('END OF YEAR'), 'projection table renders');
  assert.ok(html.includes('Good to know before you decide'));
  assert.ok(html.includes('Important Disclaimer &amp; Notes'));
  assert.ok(!html.includes('Page 2 of 2'), 'no page-2 concept');
  assert.ok(!html.includes('shanta-life-logo.png'), 'no logo block above the projection');
});

test('SDPP and combo previews keep the existing layout', () => {
  const sdppHtml = renderPreview(quotationFixture('sdpp_elite', 'Monthly', 12));
  assert.ok(sdppHtml.includes('Premium Commitment &amp; Deposit Summary'));
  assert.ok(!sdppHtml.includes('Your Plan at a Glance'));
  assert.ok(!sdppHtml.includes('Compare Payment Modes'));
  assert.ok(sdppHtml.includes('UNOFFICIAL SAMPLE ILLUSTRATION'), 'SDPP keeps the document header');
  assert.ok(sdppHtml.includes('Client Profile Details'), 'SDPP keeps the client grid');
  const comboHtml = renderPreview(comboFixture());
  assert.ok(comboHtml.includes('COMBINED PREMIUM / DEPOSIT'));
  assert.ok(!comboHtml.includes('Your Plan at a Glance'));
  assert.ok(comboHtml.includes('Proposal Quotation Statement'), 'combo keeps the document banner');
});

test('premium breakdown button only renders when the parent provides the callback', () => {
  const options = quotationFixture('endowment', 'Monthly', 15);
  const html = renderToString(React.createElement(PlanQuotationModal, { ...options, isOpen: true, embedded: true, showProjection: false, onClose: () => {} })).replace(/<!-- -->/g, '');
  assert.ok(!html.includes('Breakdown'), 'no button without the callback, mirroring View Diseases');
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
