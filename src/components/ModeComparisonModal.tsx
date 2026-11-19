import React from 'react';
import { X } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { CalculationInput, CalculationResult } from '../data/types';
import { modeComparisonRows, naturalDeathCover } from '../lib/quotationPreview';

interface ModeComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  input: CalculationInput;
  selectedProduct?: CalculationResult;
}

/**
 * Payment-mode comparison dialog. It follows the exact same system as the
 * premium breakdown dialog (and the View Diseases dialog): same overlay, same
 * card, parent-owned open state, closed by the X button. The table is the
 * "Compare Payment Modes" table the quotation preview used to show inline —
 * one row per payment mode the product offers, with the selected mode
 * highlighted. Every figure comes from the engine result via the shared
 * quotation helpers; no pricing logic lives here.
 */
export default function ModeComparisonModal({
  isOpen,
  onClose,
  input,
  selectedProduct,
}: ModeComparisonModalProps) {
  if (!isOpen) return null;

  const maturity = selectedProduct?.maturityValue || input.sumAssured;
  const deathCover = selectedProduct ? naturalDeathCover(selectedProduct, input.sumAssured) : input.sumAssured;
  const rows = selectedProduct ? modeComparisonRows(selectedProduct, input.term, maturity, deathCover, input.paymentMethod) : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Compare payment modes">
      <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="font-bold text-lg text-brand-text">Compare Payment Modes</h2>
          <button type="button" title="Close" aria-label="Close mode comparison" onClick={onClose} className="rounded-lg border p-2"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3 text-brand-text">
          <p className="text-sm text-slate-600">
            Same cover, different totals — maturity payout and death cover are the same in every mode; only what you pay changes.
          </p>
          <div className="overflow-x-auto border border-[#e5e8df] rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f0f1df] text-brand-text font-bold text-[10px] uppercase tracking-wider">
                  <th className="p-3 border-r border-[#e5e8df]">Payment mode</th>
                  <th className="p-3 border-r border-[#e5e8df] text-right">Premium per payment</th>
                  <th className="p-3 border-r border-[#e5e8df] text-right">Total paid over {input.term} years</th>
                  <th className="p-3 border-r border-[#e5e8df] text-right">Maturity payout</th>
                  <th className="p-3 text-right">Death cover</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e8df]">
                {rows.map((row) => (
                  <tr key={row.mode} className={cn('hover:bg-[#f7f8ef]', row.selected && 'bg-brand-primary/10 font-bold')}>
                    <td className="p-3 border-r border-[#e5e8df] font-bold text-brand-text">
                      {row.mode}
                      {row.selected && <span className="ml-2 bg-brand-primary text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full">Selected</span>}
                    </td>
                    <td className="p-3 border-r border-[#e5e8df] text-right font-mono">{formatCurrency(row.premium)}</td>
                    <td className="p-3 border-r border-[#e5e8df] text-right font-mono font-bold text-brand-text">{formatCurrency(row.totalPaid)}</td>
                    <td className="p-3 border-r border-[#e5e8df] text-right font-mono">{formatCurrency(row.maturity)}</td>
                    <td className="p-3 text-right font-mono">{formatCurrency(row.deathCover)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">Total paid is that mode's premium multiplied by the number of payments over the full term.</p>
        </div>
      </div>
    </div>
  );
}
