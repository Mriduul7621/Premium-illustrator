import React from 'react';
import { Download, X } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { CalculationInput } from '../data/types';
import {
  CLASSIC_CI_DISEASES, MINOR_CI_DISEASES, MAJOR_CI_DISEASES,
  CI_MAJOR_BENEFIT_SHARE_AFTER_MINOR, CI_MAJOR_BENEFIT_SHARE_WITHOUT_MINOR,
  CI_MINOR_BENEFIT_SHARE, ciCoverageAmount, ciDiseaseLabel,
  CiDisease, CiRiderType,
} from '../data/ciDiseases';

interface CriticalIllnessDialogProps {
  /** Which list to show; null renders nothing (parent-owned open state). */
  view: CiRiderType | null;
  onClose: () => void;
  input: CalculationInput;
  /** Downloads the rendered list as a PDF (capture of the #ci-disease-content element). */
  onDownload: (elementId: string, filename: string) => void;
}

/** One numbered disease list in the same table format as the premium breakdown dialog. */
function DiseaseTable({ diseases }: { diseases: CiDisease[] }) {
  return (
    <div className="overflow-x-auto border border-[#e5e8df] rounded-xl">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-[#f0f1df] text-brand-text font-bold text-[10px] uppercase tracking-wider">
            <th className="p-3 border-r border-[#e5e8df] w-12 text-center">#</th>
            <th className="p-3">Covered disease</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5e8df]">
          {diseases.map((disease, index) => (
            <tr key={ciDiseaseLabel(disease)} className="hover:bg-[#f7f8ef]">
              <td className="p-3 border-r border-[#e5e8df] text-center font-mono font-bold text-slate-500">{index + 1}</td>
              <td className="p-3 font-semibold text-slate-800">{ciDiseaseLabel(disease)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Critical Illness disease-list dialog, extracted verbatim from Calculator.tsx
 * and restyled to the same pro-level format as the premium breakdown dialog:
 * the same overlay/card chrome, the same table presentation (cream header row,
 * bordered rows, hover tint). The disease data, counts, benefit shares and
 * amounts are unchanged — display only. The Download button still exports the
 * #ci-disease-content element, so that id must stay on the content wrapper.
 */
export default function CriticalIllnessDialog({
  view,
  onClose,
  input,
  onDownload,
}: CriticalIllnessDialogProps) {
  if (!view) return null;

  const coverage = ciCoverageAmount(input.sumAssured);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Critical illness diseases">
      <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="font-bold text-lg text-brand-text">Critical Illness {view === 'classic' ? 'Classic' : 'Standard'}</h2>
          <div className="flex gap-2">
            <button type="button" title="Download disease list" aria-label="Download disease list" onClick={() => onDownload('ci-disease-content', view + '-critical-illness.pdf')} className="rounded-lg border p-2"><Download className="w-5 h-5" /></button>
            <button type="button" title="Close" aria-label="Close disease list" onClick={onClose} className="rounded-lg border p-2"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div id="ci-disease-content" className="space-y-5 bg-white p-2 text-brand-text">
          <h3 className="font-bold">Critical Illness {view === 'classic' ? 'Classic' : 'Standard'}</h3>
          {view === 'classic' ? (
            <section className="space-y-3">
              <p className="rounded-lg bg-[#f0f1df] px-3 py-2 text-sm font-semibold text-brand-text">
                {CLASSIC_CI_DISEASES.length} covered diseases · Coverage: {formatCurrency(coverage)}
              </p>
              <DiseaseTable diseases={CLASSIC_CI_DISEASES} />
            </section>
          ) : (
            <>
              <section className="space-y-3">
                <div>
                  <h4 className="font-bold">Minor Critical Illness ({MINOR_CI_DISEASES.length})</h4>
                  <p className="text-sm text-slate-600">{Math.round(CI_MINOR_BENEFIT_SHARE * 100)}% of CI coverage: {formatCurrency(coverage * CI_MINOR_BENEFIT_SHARE)}</p>
                </div>
                <DiseaseTable diseases={MINOR_CI_DISEASES} />
              </section>
              <section className="space-y-3">
                <div>
                  <h4 className="font-bold">Major Critical Illness ({MAJOR_CI_DISEASES.length})</h4>
                  <p className="text-sm text-slate-600">If Minor claimed: {Math.round(CI_MAJOR_BENEFIT_SHARE_AFTER_MINOR * 100)}% — {formatCurrency(coverage * CI_MAJOR_BENEFIT_SHARE_AFTER_MINOR)}. If Minor not claimed: {Math.round(CI_MAJOR_BENEFIT_SHARE_WITHOUT_MINOR * 100)}% — {formatCurrency(coverage * CI_MAJOR_BENEFIT_SHARE_WITHOUT_MINOR)}.</p>
                </div>
                <DiseaseTable diseases={MAJOR_CI_DISEASES} />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
