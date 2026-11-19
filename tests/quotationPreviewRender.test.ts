import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import PlanQuotationModal from '../src/components/PlanQuotationModal';
import { calculatePremiums } from '../src/services/calculator';
import { formatCurrency } from '../src/lib/utils';
import { quotationFixture, comboFixture, ciQuotationFixture } from './fixtures';

/** Renders the quotation preview to static HTML with real engine data. */
const renderPreview = (options: any): string =>
  // React SSR inserts <!-- --> between text and expressions; strip them so
  // checks match the text a browser user actually sees.
  renderToString(React.createElement(PlanQuotationModal, { ...options, isOpen: true, embedded: true, showProjection: false, onClose: () => {} })).replace(/<!-- -->/g, '');

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
  assert.ok(html.includes('UNOFFICIAL SAMPLE ILLUSTRATION'), 'unofficial note is kept');
  assert.ok(html.includes('Download PDF'), 'PDF download button is kept');
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
  assert.ok(html.includes(formatCurrency(product.totalPremium.Single)));
  assert.ok(html.includes(formatCurrency(product.maturityValue!)));
});

test('SDPP and combo previews keep the existing layout', () => {
  const sdppHtml = renderPreview(quotationFixture('sdpp_elite', 'Monthly', 12));
  assert.ok(sdppHtml.includes('Premium Commitment &amp; Deposit Summary'));
  assert.ok(!sdppHtml.includes('Your Plan at a Glance'));
  assert.ok(!sdppHtml.includes('Compare Payment Modes'));
  const comboHtml = renderPreview(comboFixture());
  assert.ok(comboHtml.includes('COMBINED PREMIUM / DEPOSIT'));
  assert.ok(!comboHtml.includes('Your Plan at a Glance'));
});
