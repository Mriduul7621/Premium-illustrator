import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ResultsTabBar, { PREVIEW_SECTIONS, type PreviewSection } from '../src/components/ResultsTabBar';

/** Renders the results tab bar to static HTML. */
const renderTabs = (section: PreviewSection): string =>
  renderToString(React.createElement(ResultsTabBar, { section, onSelect: () => {} })).replace(/<!-- -->/g, '');

test('results tab bar: all four tabs render', () => {
  const html = renderTabs('quotation');
  for (const { label } of PREVIEW_SECTIONS) {
    assert.ok(html.includes(label), `tab bar shows the ${label} tab`);
  }
  assert.ok(html.includes('role="tablist"'), 'tab bar uses the tablist pattern');
  assert.equal((html.match(/role="tab"/g) || []).length, 4, 'exactly four tabs render');
});

test('results tab bar: the active tab is highlighted and selected', () => {
  for (const active of ['quotation', 'term', 'policy', 'liquidity'] as const) {
    const html = renderTabs(active);
    // Exactly one tab is selected, and it carries the active styling.
    assert.equal((html.match(/aria-selected="true"/g) || []).length, 1, `one selected tab when ${active} is active`);
    assert.equal((html.match(/aria-selected="false"/g) || []).length, 3, 'the other three tabs are unselected');
    assert.ok(html.includes('bg-brand-primary'), 'the active tab is highlighted');
    const activeLabel = PREVIEW_SECTIONS.find(s => s.id === active)!.label;
    const selectedAt = html.indexOf('aria-selected="true"');
    const buttonEndAt = html.indexOf('</button>', selectedAt);
    const labelAt = html.indexOf(activeLabel, selectedAt);
    assert.ok(selectedAt > -1 && labelAt > -1 && labelAt < buttonEndAt, `the selected tab is ${activeLabel}`);
  }
});
