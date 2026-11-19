import React from 'react';
import { X } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { CalculationInput, CalculationResult } from '../data/types';
import { paymentsOverTerm } from '../lib/quotationPreview';

interface PremiumBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  input: CalculationInput;
  selectedProduct?: CalculationResult;
}

/**
 * Premium breakdown dialog. It mirrors the "View Diseases" dialog in
 * Calculator.tsx exactly: same overlay, same card, same open/close behaviour
 * (parent-owned open state, closed by the X button). The table is the same
 * "What your premium includes" breakdown the quotation preview used to show
 * inline — basic policy + each selected rider, per payment and over the term.
 * Every figure comes from the engine result; no pricing logic lives here.
 */
export default function PremiumBreakdownModal({
  isOpen,
  onClose,
  input,
  selectedProduct,
}: PremiumBreakdownModalProps) {
  if (!isOpen) return null;

  const payments = paymentsOverTerm(input.paymentMethod, input.term);
  const totalPaid = (selectedProduct?.totalPremium?.[input.paymentMethod] || 0) * payments;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Premium breakdown">
      <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="font-bold text-lg text-brand-text">Premium Breakdown</h2>
          <button type="button" title="Close" aria-label="Close premium breakdown" onClick={onClose} className="rounded-lg border p-2"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3 text-brand-text">
          <p className="text-sm text-slate-600">
            What your {input.paymentMethod} premium includes — per payment and over the full {input.term}-year term.
          </p>
          <div className="overflow-x-auto border border-[#e5e8df] rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f0f1df] text-brand-text font-bold text-[10px] uppercase tracking-wider">
                  <th className="p-3 border-r border-[#e5e8df]">What your premium includes</th>
                  <th className="p-3 border-r border-[#e5e8df] text-right">Per payment ({input.paymentMethod})</th>
                  <th className="p-3 text-right">Total over {input.term} years</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e8df]">
                <tr className="hover:bg-[#f7f8ef]">
                  <td className="p-3 border-r border-[#e5e8df] font-bold text-brand-text">Basic policy ({selectedProduct?.productName || 'Primary Plan'})</td>
                  <td className="p-3 border-r border-[#e5e8df] text-right font-mono font-bold">{formatCurrency(selectedProduct?.basePremium?.[input.paymentMethod] || 0)}</td>
                  <td className="p-3 text-right font-mono font-bold text-brand-text">{formatCurrency((selectedProduct?.basePremium?.[input.paymentMethod] || 0) * payments)}</td>
                </tr>
                {input.hasAccidentalProtection && (
                  <tr className="hover:bg-[#f7f8ef]">
                    <td className="p-3 border-r border-[#e5e8df] font-semibold text-slate-800">Accidental Protection rider</td>
                    <td className="p-3 border-r border-[#e5e8df] text-right font-mono font-bold">{formatCurrency(selectedProduct?.adbPremium?.[input.paymentMethod] || 0)}</td>
                    <td className="p-3 text-right font-mono font-bold text-brand-text">{formatCurrency((selectedProduct?.adbPremium?.[input.paymentMethod] || 0) * payments)}</td>
                  </tr>
                )}
                {input.hasCIClassic && (
                  <tr className="hover:bg-[#f7f8ef]">
                    <td className="p-3 border-r border-[#e5e8df] font-semibold text-slate-800">Critical Illness — Classic rider</td>
                    <td className="p-3 border-r border-[#e5e8df] text-right font-mono font-bold">{formatCurrency(selectedProduct?.ciClassicPremium?.[input.paymentMethod] || 0)}</td>
                    <td className="p-3 text-right font-mono font-bold text-brand-text">{formatCurrency((selectedProduct?.ciClassicPremium?.[input.paymentMethod] || 0) * payments)}</td>
                  </tr>
                )}
                {input.hasCIStandard && (
                  <tr className="hover:bg-[#f7f8ef]">
                    <td className="p-3 border-r border-[#e5e8df] font-semibold text-slate-800">Critical Illness — Standard rider</td>
                    <td className="p-3 border-r border-[#e5e8df] text-right font-mono font-bold">{formatCurrency(selectedProduct?.ciStandardPremium?.[input.paymentMethod] || 0)}</td>
                    <td className="p-3 text-right font-mono font-bold text-brand-text">{formatCurrency((selectedProduct?.ciStandardPremium?.[input.paymentMethod] || 0) * payments)}</td>
                  </tr>
                )}
                <tr className="bg-[#f0f1df] font-black text-brand-text">
                  <td className="p-3 border-r border-[#e5e8df] uppercase text-[10px] tracking-wider text-slate-700">Total payable</td>
                  <td className="p-3 border-r border-[#e5e8df] text-right font-mono">{formatCurrency(selectedProduct?.totalPremium?.[input.paymentMethod] || 0)}</td>
                  <td className="p-3 text-right font-mono text-base text-brand-primary">{formatCurrency(totalPaid)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
