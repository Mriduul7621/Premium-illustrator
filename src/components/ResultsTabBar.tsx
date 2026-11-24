import { FileText, BarChart3, ArrowLeftRight, Activity } from 'lucide-react';
import { cn } from '../lib/utils';

export type PreviewSection = 'quotation' | 'term' | 'policy' | 'liquidity';

export const PREVIEW_SECTIONS = [
  { id: 'quotation', label: 'Quotation', Icon: FileText },
  { id: 'term', label: 'Term Comparison', Icon: BarChart3 },
  { id: 'policy', label: 'Policy Comparison', Icon: ArrowLeftRight },
  { id: 'liquidity', label: 'Liquidity', Icon: Activity },
] as const;

/**
 * The results-area tab bar: Quotation | Term Comparison | Policy Comparison |
 * Liquidity. Extracted verbatim from Calculator.tsx so the four tabs survive
 * the UX redesign untouched.
 */
export default function ResultsTabBar(props: {
  section: PreviewSection;
  onSelect: (id: PreviewSection) => void;
}) {
  const { section, onSelect } = props;
  return (
    <div role="tablist" aria-label="Quotation views" className="grid grid-cols-4 gap-2 mb-5 rounded-2xl border border-[#e5e8df] bg-white p-2">
      {PREVIEW_SECTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={section === id}
          onClick={() => onSelect(id)}
          className={cn(
            'min-h-16 flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] sm:text-xs font-semibold',
            section === id ? 'bg-brand-primary text-white' : 'bg-[#f7f8ef] text-brand-text'
          )}
        >
          <Icon className="w-5 h-5" />
          <span className="text-center leading-tight">{label}</span>
        </button>
      ))}
    </div>
  );
}
