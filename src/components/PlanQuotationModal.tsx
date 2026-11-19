import { savePdf } from '../lib/savePdf';
import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Download, Printer, Shield, Activity, Sparkles, CheckCircle2, 
  FileText, Calendar, User, Phone, Mail, DollarSign, Clock, HelpCircle,
  AlertCircle, ChevronRight, Award, Check, Building2, Scale
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { CalculationInput, CalculationResult, SDPPResult, ProjectionRow } from '../data/types';
import { createQuotationPdf, quotationFilename } from '../lib/quotationPdf';
import { accidentalRiderBenefits, modeComparisonRows, naturalDeathCover, scepStipend, stagePayouts } from '../lib/quotationPreview';
import { CI_MAJOR_BENEFIT_SHARE_AFTER_MINOR, CI_MAJOR_BENEFIT_SHARE_WITHOUT_MINOR, CI_MINOR_BENEFIT_SHARE, ciCoverageAmount, isCiRiderEligible } from '../data/ciDiseases';

interface PlanQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  showProjection?: boolean;
  onViewDiseases?: (type: 'classic' | 'standard') => void;
  onViewPremiumBreakdown?: () => void;
  onViewModeComparison?: () => void;
  input: CalculationInput;
  selectedProduct?: CalculationResult;
  sdppData?: SDPPResult;
  isComboEnabled?: boolean;
  sdppComboData?: SDPPResult;
  comboSdppPlan?: string;
  comboSdppPaymentMethod?: string;
  comboSdppDeposit?: number;
  comboSdppCustomRate?: number;
  projectionData?: ProjectionRow[];
}

export default function PlanQuotationModal({
  isOpen,
  onClose,
  embedded = false,
  showProjection = true,
  onViewDiseases,
  onViewPremiumBreakdown,
  onViewModeComparison,
  input,
  selectedProduct,
  sdppData,
  isComboEnabled,
  sdppComboData,
  comboSdppPlan = 'Elite',
  comboSdppPaymentMethod = 'Monthly',
  comboSdppDeposit = 5000,
  comboSdppCustomRate,
  projectionData = []
}: PlanQuotationModalProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const exportInProgress = useRef(false);
  const [documentZoom, setDocumentZoom] = useState(1);
  const documentAreaRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  useEffect(() => {
    const area = documentAreaRef.current;
    if (!area) return;
    const update = () => setFitZoom(Math.max(0.3, Math.min(1.4, (area.clientWidth - (window.innerWidth < 640 ? 24 : 48)) / 800)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(area);
    return () => observer.disconnect();
  }, [embedded]);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const pinchDistance = (touches: React.TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) pinchRef.current = { distance: pinchDistance(event.touches), zoom: documentZoom };
  };
  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    if (!pinchRef.current) pinchRef.current = { distance: pinchDistance(event.touches), zoom: documentZoom };
    setDocumentZoom(Math.max(0.3, Math.min(2.5, pinchRef.current.zoom * pinchDistance(event.touches) / Math.max(1, pinchRef.current.distance))));
  };
  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinchRef.current = null;
  };

  
  const page1Ref = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Basic Calculations
  const issueDateStr = input.issueDate || new Date().toISOString().split('T')[0];
  const issueYear = new Date(issueDateStr).getFullYear();
  const isS3PP = selectedProduct?.productId === 's3pp';
  const isS4PP = selectedProduct?.productId === 's4pp';

  const isSDPP = selectedProduct?.productId === 'sdpp' || Boolean(selectedProduct?.productId.startsWith('sdpp_'));
  const isChildPlan = Boolean(selectedProduct?.productId?.startsWith('scep'));
  const childPercentageStr = isChildPlan ? (selectedProduct?.productId?.split('_').pop() || '1') : '0';
  const childPercentage = isChildPlan ? parseInt(childPercentageStr) / 100 : 0;
  const childStipend = isChildPlan ? input.sumAssured * childPercentage : 0;
  
  // Primary Policy values
  const primaryPaid = (selectedProduct?.totalPremium?.[input.paymentMethod] || 0) * 
    (input.paymentMethod === 'Yearly' ? input.term : 
     input.paymentMethod === 'Half-yearly' ? input.term * 2 : 
     input.paymentMethod === 'Quarterly' ? input.term * 4 : 
     input.paymentMethod === 'Monthly' ? input.term * 12 : 1);

  const primaryMaturity = selectedProduct?.maturityValue || input.sumAssured;

  // Redesigned standard quotation preview (single non-SDPP policy only).
  // Every value below comes from the engine result or the shared quotation
  // rules; see src/lib/quotationPreview.ts.
  const standardDeathCover = selectedProduct ? naturalDeathCover(selectedProduct, input.sumAssured) : input.sumAssured;
  const standardModeRows = selectedProduct ? modeComparisonRows(selectedProduct, input.term, primaryMaturity, standardDeathCover, input.paymentMethod) : [];
  const standardStages = selectedProduct ? stagePayouts(selectedProduct.productId, input.term, input.sumAssured, issueYear) : [];
  const standardStipend = selectedProduct ? scepStipend(selectedProduct.productId, input.sumAssured) : null;
  const standardCiCoverage = (input.hasCIClassic || input.hasCIStandard) && isCiRiderEligible(input.sumAssured)
    ? (input.ciCoverage || ciCoverageAmount(input.sumAssured))
    : 0;
  const standardAdb = input.hasAccidentalProtection ? accidentalRiderBenefits(input.sumAssured) : null;

  // The mode comparison lives behind the Compare button now, so the visible
  // sections are always numbered in order: 1 summary, 2 benefits, 3
  // projection. The Compare button itself only shows when the plan offers
  // more than one mode (single-premium plans have nothing to compare).
  const standardHasModes = standardModeRows.length > 1;
  const standardBenefitsNum = 2;
  const standardProjectionNum = 3;

  // Target Sum Assured calculation
  const calculatedSdppSa = typeof sdppData?.deathBenefit === 'number' 
    ? sdppData.deathBenefit 
    : (typeof sdppData?.sumAssured === 'number' ? sdppData.sumAssured : ((sdppData?.annualPremium || (input.targetPremium || 5000) * 12) * input.term));

  const displayTargetSumAssured = isSDPP
    ? calculatedSdppSa
    : (input.sumAssured || 0);

  // SDPP Breakdown Calculations
  const paymentModeMultiplier = input.paymentMethod === 'Yearly' ? 1 : input.paymentMethod === 'Half-yearly' ? 2 : input.paymentMethod === 'Quarterly' ? 4 : 12;
  const riderMonthsInMode = 12 / paymentModeMultiplier;

  const basicDepositPeriodic = sdppData?.annualPremium 
    ? Math.round(sdppData.annualPremium / paymentModeMultiplier) 
    : (input.targetPremium || 5000);
  const basicDepositAnnual = basicDepositPeriodic * paymentModeMultiplier;
  const basicDepositTotalTerm = basicDepositAnnual * input.term;

  const hiPeriodic = sdppData?.hiModePremium || Math.round((sdppData?.hiMonthlyPremium || 0) * riderMonthsInMode);
  const hiAnnual = (sdppData?.hiMonthlyPremium || 0) * 12;
  const hiTotalTerm = hiAnnual * input.term;

  const ciPeriodic = sdppData?.ciModePremium || Math.round((sdppData?.ciMonthlyPremium || 0) * riderMonthsInMode);
  const ciAnnual = (sdppData?.ciMonthlyPremium || 0) * 12;
  const ciTotalTerm = ciAnnual * input.term;

  // Combo calculations
  const comboMultiplier = comboSdppPaymentMethod === 'Yearly' ? 1 : comboSdppPaymentMethod === 'Half-yearly' ? 2 : comboSdppPaymentMethod === 'Quarterly' ? 4 : 12;
  const comboSdppTotalPaid = (comboSdppDeposit || 0) * comboMultiplier * input.term;
  const combinedTotalPaid = primaryPaid + comboSdppTotalPaid;

  const sdppComboMaturity = sdppComboData ? Math.round(sdppComboData.maturity7) : 0; // Lower (7%) scenario - scenarios are never averaged into a single figure.
  const sdppDeathBenefitVal = typeof sdppComboData?.deathBenefit === 'number' 
    ? sdppComboData.deathBenefit 
    : (parseFloat(String(sdppComboData?.deathBenefit || 0)) || 0);

  // Policy 1 Life Coverage & Accidental Rider
  const policy1LifeCover = input.sumAssured;
  const policy1AccidentalCover = input.hasAccidentalProtection ? input.sumAssured * 2 : input.sumAssured;
  
  // Policy 2 SDPP Life Coverage & Accidental Benefit
  const isPrimeCombo = (comboSdppPlan || '').toLowerCase().includes('prime');
  const comboSdppSa = (comboSdppDeposit || 0) * comboMultiplier * input.term;
  const sdppSaVal = typeof sdppComboData?.sumAssured === 'number' && sdppComboData.sumAssured > 0 
    ? sdppComboData.sumAssured 
    : comboSdppSa;

  const sdppAccidentalDeathCoverVal = isPrimeCombo 
    ? (2 * sdppSaVal + comboSdppTotalPaid) 
    : (3 * sdppSaVal);

  const sdppAccidentalDeathCoverDisplay = isPrimeCombo
    ? `${formatCurrency(2 * sdppSaVal)} + Paid Premium or Account Value`
    : formatCurrency(3 * sdppSaVal);

  const sdppAptdCoverVal = 2 * sdppSaVal;

  const policy2LifeCover = sdppDeathBenefitVal;
  const policy2AccidentalCover = sdppAccidentalDeathCoverVal;

  // Total Combined Life & Accidental Coverage
  const totalCombinedLifeCoverage = policy1LifeCover + policy2LifeCover;
  const totalCombinedAccidentalRider = policy1AccidentalCover + policy2AccidentalCover;

  // Cumulative Accidental Death Coverage = policy 1 coverage + SDPP accidental death coverage
  const totalCumulativeAccidentalDeathBenefit = policy1AccidentalCover + sdppAccidentalDeathCoverVal;

  // Primary Plan Critical Illness
  const hasPrimaryCI = Boolean(input.hasCIClassic || input.hasCIStandard || (input.ciCoverage && input.ciCoverage > 0));
  const primaryCiVal = hasPrimaryCI ? (input.ciCoverage || Math.min(input.sumAssured * 0.5, 1500000)) : 0;

  // SDPP Critical Illness Rule:
  // "SDPP elite e in build critical illness coverage sum assured er 50%, tobe signature and prime er kono critical illness coverage nai."
  const isComboSdppElite = (comboSdppPlan || '').toLowerCase().includes('elite');
  const sdppCiVal = isComboSdppElite ? (sdppComboData?.ciCoverage || Math.round(sdppSaVal * 0.5)) : 0;
  const totalCombinedCI = primaryCiVal + sdppCiVal;

  // No fixed tax-rebate % exists in the product documents (rebate depends on
  // income and NBR rules), so no rebate amount is calculated or promised.
  const primaryTaxRebate = 0;
  const sdppTaxRebate = 0;
  const totalTaxRebate = primaryTaxRebate + sdppTaxRebate;

  const handleDownloadPdf = async () => {
    if (exportInProgress.current) return;
    exportInProgress.current = true;
    setIsGeneratingPdf(true);
    setPdfError(null);
    try {
      const options = {
        input, selectedProduct, sdppData, isComboEnabled, sdppComboData,
        comboSdppPlan, comboSdppPaymentMethod, comboSdppDeposit, comboSdppCustomRate, projectionData,
      };
      const now = new Date();
      const pdf = await createQuotationPdf(options, now);
      await savePdf(pdf, quotationFilename(options, now));
    } catch (error) {
      console.error('Error generating quotation PDF:', error);
      setPdfError(`Unable to save the quotation. ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      exportInProgress.current = false;
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={embedded ? "w-full flex justify-center print:block" : "fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 print:p-0 print:bg-white print:fixed print:inset-0"}>
      <div className={embedded ? "w-full min-w-0 flex flex-col bg-slate-100 print:bg-white" : "bg-white rounded-2xl md:rounded-3xl shadow-2xl max-w-7xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 print:max-h-none print:shadow-none print:border-none print:rounded-none print:w-full"}>
        
        {/* Modal close only (dialog mode). Print / Download PDF live at the
            very end of the preview now, after all content — a button bar
            between the summary and the content split the page in two. */}
        {!embedded && (
          <div className="bg-slate-900 text-white p-3 md:px-8 flex items-center justify-end border-b border-slate-800 print:hidden flex-shrink-0">
            <button
              onClick={onClose}
              title="Close" aria-label="Close quotation"
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Document Scroll Area */}
        <div ref={documentAreaRef} className={cn("overflow-auto p-3 sm:p-6 space-y-8 print:p-0 print:overflow-visible text-slate-800 font-sans", embedded && "w-full", (isComboEnabled || isSDPP) ? "bg-slate-100" : "bg-[#f7f8ef]")} id={embedded ? "quotation-document-inline" : "quotation-document"} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd} style={{ touchAction: "pan-x pan-y" }}>
          
          {/* Combo & SDPP keep the existing paper-sheet layout */}
          {(isComboEnabled || isSDPP) && (
          <div 
            ref={page1Ref}
            data-quotation-content="true"
            data-page="1"
            className="bg-white space-y-6 print:border-none print:shadow-none" style={{ zoom: fitZoom * documentZoom, width: 800, minWidth: 800, minHeight: 1131, boxSizing: 'border-box', padding: '24px 28px', margin: '0 auto', borderRadius: 0, border: 'none', boxShadow: '0 8px 28px rgba(15, 23, 42, 0.10)' }}
          >
            
            {/* Header / Letterhead */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b-2 border-brand-primary/20 pb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <img src="/shanta-life-logo.png" alt="Shanta Life" className="w-36 h-auto object-contain flex-shrink-0" />
                  
                </div>
              </div>

              <div className="text-left sm:text-right space-y-1">
                <span className="inline-block bg-brand-primary/10 text-brand-primary text-[10px] font-black uppercase px-3 py-1 rounded-full border border-brand-primary/20">
                  UNOFFICIAL SAMPLE ILLUSTRATION
                </span>
                <p className="text-[11px] text-slate-500 font-medium pt-1">
                  Date: {issueDateStr} {!isComboEnabled && !isSDPP && '• Page 1 of 2'}
                </p>
              </div>
            </div>

            {/* Document Title Banner */}
            <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div>
                <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em]">
                  Proposal Quotation Statement
                </p>
                <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-white mt-0.5">
                  {isComboEnabled 
                    ? `${selectedProduct?.productName || 'Primary Plan'} + SDPP (${comboSdppPlan}) Combo Package`
                    : selectedProduct?.productName || 'Shanta Insurance Policy'}
                </h2>
              </div>
              <div className="bg-brand-primary/20 border border-brand-primary/40 px-4 py-2 rounded-lg text-right flex-shrink-0">
                <span className="text-[9px] text-slate-300 uppercase block font-bold">Policy Term</span>
                <span className="text-sm font-black font-mono text-brand-primary">{input.term} Years</span>
              </div>
            </div>

            {/* Client Profile & Policy Parameter Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Proposer Info */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-brand-primary border-b border-slate-200 pb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-brand-primary" /> Client Profile Details
                </h4>
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Applicant Name</span>
                    <strong className="text-slate-900 font-bold">{input.name || 'Valued Client'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Gender / Age</span>
                    <strong className="text-slate-900 font-bold">{input.gender}, {input.age} Years</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Date of Birth</span>
                    <strong className="text-slate-900 font-bold font-mono">{input.dob || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Phone / Contact</span>
                    <strong className="text-slate-900 font-bold">{input.phone || 'N/A'}</strong>
                  </div>
                  {input.email && (
                    <div className="col-span-2">
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Email Address</span>
                      <strong className="text-slate-900 font-bold">{input.email}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Policy Settings Info */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-brand-primary border-b border-slate-200 pb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-brand-primary" /> Policy Parameters
                </h4>
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Payment Mode</span>
                    <strong className="text-slate-900 font-bold">{input.paymentMethod}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Policy Duration</span>
                    <strong className="text-slate-900 font-bold">{input.term} Years</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Target Sum Assured</span>
                    <strong className="text-brand-primary font-black font-mono text-sm">{formatCurrency(displayTargetSumAssured)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Issue Date</span>
                    <strong className="text-slate-900 font-bold font-mono">{issueDateStr}</strong>
                  </div>
                </div>
              </div>

            </div>

            {/* Conditional Rendering: Combo Illustration Layout vs Standard Single Policy Layout */}
            {isComboEnabled ? (
              <div className="space-y-6">
                
                {/* 1. Combined Premium / Deposit Banner */}
                <div className="bg-slate-900 rounded-2xl p-5 sm:p-6 text-white space-y-4 shadow-md border border-slate-800">
                  <div className="flex justify-between items-center text-xs">
                    <span className="bg-brand-primary/20 border border-brand-primary/30 text-brand-primary text-[10px] font-black uppercase px-2.5 py-1 rounded tracking-wider">
                      COMBINED PREMIUM / DEPOSIT
                    </span>
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">
                      POLICY TERM <strong className="text-white font-mono text-sm ml-1">{input.term} Years</strong>
                    </span>
                  </div>

                  <div className="text-center py-2 space-y-1">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">
                      TOTAL PAYABLE PREMIUM ({input.paymentMethod.toUpperCase()})
                    </h3>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-primary/90 pt-1">
                      COMBINED TOTAL ({input.paymentMethod.toUpperCase()})
                    </div>
                    <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-brand-primary drop-shadow-sm">
                      {formatCurrency((selectedProduct?.totalPremium?.[input.paymentMethod] || 0) + (comboSdppDeposit || 0))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="bg-slate-800/80 border border-slate-700/80 p-3 rounded-xl flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-300 uppercase text-[10px] tracking-wide">
                          POLICY 1: {selectedProduct?.productName || 'PRIMARY PLAN'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">{input.paymentMethod} Premium</div>
                      </div>
                      <div className="font-mono font-black text-sm text-white">
                        {formatCurrency(selectedProduct?.totalPremium?.[input.paymentMethod] || 0)}
                      </div>
                    </div>

                    <div className="bg-slate-800/80 border border-slate-700/80 p-3 rounded-xl flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-300 uppercase text-[10px] tracking-wide">
                          POLICY 2: SHANTA SDPP - {comboSdppPlan.toUpperCase()}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">{comboSdppPaymentMethod} Deposit</div>
                      </div>
                      <div className="font-mono font-black text-sm text-white">
                        {formatCurrency(comboSdppDeposit || 0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Accumulated Combo Valuation */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                  <div className="flex justify-between items-center border-b border-slate-200/80 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-brand-primary" /> COMBO PACKAGE ACTIVE
                      </span>
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                        ACCUMULATED COMBO VALUATION
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold uppercase text-slate-500">
                      POLICY TERM <strong className="font-mono text-slate-900">{input.term} Years</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Policy 1 Card */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase text-slate-400">POLICY 1</span>
                        <span className="bg-slate-100 text-slate-700 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded">Primary</span>
                      </div>
                      <div className="text-[11px] leading-tight font-black uppercase text-slate-900">
                        {selectedProduct?.productName || 'Primary Plan'}
                      </div>
                      <div className="border-t border-slate-100 pt-2 space-y-2 text-xs">
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-slate-500 font-medium">Total Premium Paid:</div>
                          <div className="font-mono font-bold text-slate-900 text-right">{formatCurrency(primaryPaid)}</div>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-slate-500 font-medium">Maturity Benefit:</div>
                          <div className="font-mono font-bold text-slate-900 text-right">{formatCurrency(primaryMaturity)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Policy 2 Card */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase text-slate-400">POLICY 2</span>
                        <span className="bg-brand-primary/10 text-brand-primary text-[9px] font-extrabold uppercase px-2 py-0.5 rounded">SDPP</span>
                      </div>
                      <div className="text-[11px] leading-tight font-black uppercase text-slate-900">
                        SHANTA SDPP - {comboSdppPlan.toUpperCase()}
                      </div>
                      <div className="border-t border-slate-100 pt-2 space-y-2 text-xs">
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-slate-500 font-medium">Total Deposit Paid:</div>
                          <div className="font-mono font-bold text-slate-900 text-right">{formatCurrency(comboSdppTotalPaid)}</div>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-slate-500 font-medium">Maturity (at 7% scenario):</div>
                          <div className="font-mono font-bold text-slate-900 text-right">
                            {formatCurrency(sdppComboMaturity)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Accumulated Result Card */}
                    <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase text-slate-400">ACCUMULATED RESULT</span>
                        <span className="bg-brand-primary/20 text-brand-primary text-[9px] font-black uppercase px-2 py-0.5 rounded">TOTAL</span>
                      </div>
                      <div className="text-[11px] leading-tight font-black uppercase text-white">
                        TOTAL COMBO BENEFIT
                      </div>
                      <div className="border-t border-slate-800 pt-2 space-y-2 text-xs">
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-slate-400 font-medium">Total Paid ({input.term} yrs):</div>
                          <div className="font-mono font-bold text-slate-200 text-right">{formatCurrency(combinedTotalPaid)}</div>
                        </div>
                        <div className="space-y-0.5 pt-1 border-t border-slate-800">
                          <div className="text-[10px] font-black uppercase text-brand-primary">ACCUMULATED MATURITY:</div>
                          <div className="font-mono font-black text-brand-primary text-right text-base">
                            {formatCurrency(primaryMaturity + sdppComboMaturity)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Accumulated Combo Benefits */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                  <div className="border-b border-slate-200 pb-3">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-brand-primary" /> ACCUMULATED COMBO BENEFITS
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium pt-0.5">
                      Combined coverage and benefits across both Policy 1 and SDPP Package
                    </p>
                  </div>

                  <div className="space-y-3.5">
                    
                    {/* 1. Accumulated Maturity Benefit */}
                    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div>
                        <div className="text-xs font-black uppercase text-slate-900">ACCUMULATED MATURITY BENEFIT (8% AVG)</div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          Policy 1 ({formatCurrency(primaryMaturity)}) + SDPP ({formatCurrency(sdppComboMaturity)})
                        </div>
                      </div>
                      <div className="font-mono font-black text-lg text-brand-primary text-right">
                        {formatCurrency(primaryMaturity + sdppComboMaturity)}
                      </div>
                    </div>

                    {/* 2. Total Combined Life Coverage */}
                    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200/80 pb-2">
                        <div>
                          <div className="text-xs font-black uppercase text-slate-900">TOTAL COMBINED LIFE COVERAGE (DEATH BENEFIT)</div>
                          <div className="text-[11px] text-slate-500 font-medium">
                            Policy 1 SA ({formatCurrency(input.sumAssured)}) + Policy 2 SDPP Cover ({formatCurrency(sdppDeathBenefitVal)}) {isChildPlan ? '+ Monthly Stipend' : ''}
                          </div>
                        </div>
                        <div className="font-mono font-black text-lg text-slate-900 text-right">
                          {formatCurrency(totalCombinedLifeCoverage)}
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-900 pb-1 border-b border-slate-100">
                          {selectedProduct?.productName?.toUpperCase() || 'PRIMARY PLAN'} & SDPP DEATH BENEFITS BREAKDOWN
                        </div>
                        <div className="flex justify-between items-center text-slate-700">
                          <span>Policy 1 ({selectedProduct?.productName || 'Primary Plan'} Sum Assured at Maturity):</span>
                          <span className="font-mono font-bold text-slate-900">{formatCurrency(input.sumAssured)}</span>
                        </div>
                        {isChildPlan && (
                          <div className="flex justify-between items-center text-slate-700">
                            <span>Policy 1 (Monthly Education Stipend):</span>
                            <span className="font-mono font-bold text-slate-900">{formatCurrency(input.sumAssured * 0.02)} / Month</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-slate-700">
                          <span>Policy 2 (Shanta SDPP - {comboSdppPlan} Life Cover):</span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatCurrency(sdppDeathBenefitVal)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-slate-900 font-bold pt-1 border-t border-slate-100">
                          <span>Total Cumulative Death Benefit (Policy 1 SA + Policy 2 SDPP SA):</span>
                          <span className="font-mono text-brand-primary">
                            {formatCurrency(totalCombinedLifeCoverage)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 3. Combined Accidental Coverage */}
                    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200/80 pb-2">
                        <div>
                          <div className="text-xs font-black uppercase text-slate-900">COMBINED ACCIDENTAL COVERAGE (POLICY 1 & POLICY 2)</div>
                          <div className="text-[11px] text-slate-500 font-medium">
                            Detailed accidental coverage breakdowns for Primary Policy and SDPP
                          </div>
                        </div>
                        <div className="font-mono font-black text-lg text-slate-900 text-right">
                          {formatCurrency(totalCumulativeAccidentalDeathBenefit)}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                          <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                            <span className="text-[10px] font-black uppercase text-slate-900">POLICY 1: PRIMARY POLICY COVERAGE</span>
                            <span className={cn(
                              "text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded",
                              input.hasAccidentalProtection ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                            )}>
                              {input.hasAccidentalProtection ? 'Accidental Rider (2x SA)' : 'Natural Death Cover (1x SA)'}
                            </span>
                          </div>
                          {input.hasAccidentalProtection ? (
                            <div className="space-y-1 text-[11px] text-slate-700">
                              <div className="flex justify-between">
                                <span>Accidental Death Benefit (2x SA):</span>
                                <span className="font-mono font-bold text-slate-900">{formatCurrency(input.sumAssured * 2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Permanent Total Disability (PTD - 100% SA):</span>
                                <span className="font-mono font-bold text-slate-900">{formatCurrency(input.sumAssured)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Accidental Permanent Partial Disability (PPD - 100% SA):</span>
                                <span className="font-mono font-bold text-slate-900">{formatCurrency(input.sumAssured)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Accidental Medical Reimbursement (AMR - 15% SA):</span>
                                <span className="font-mono font-bold text-slate-900">{formatCurrency(input.sumAssured * 0.15)}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1 text-[11px] text-slate-700">
                              <div className="flex justify-between">
                                <span>Policy 1 Natural Death Coverage:</span>
                                <span className="font-mono font-bold text-slate-900">{formatCurrency(input.sumAssured)}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-100">
                                Accidental Rider Not Opted (Natural Death Cover applies)
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                          <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                            <span className="text-[10px] font-black uppercase text-slate-900">POLICY 2: SHANTA SDPP ACCIDENTAL PROTECTION</span>
                            <span className="bg-brand-primary/10 text-brand-primary text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded">{comboSdppPlan} Plan</span>
                          </div>
                          <div className="space-y-1.5 text-[11px] text-slate-700">
                            <div className="flex justify-between items-center">
                              <span>SDPP Accidental Death Coverage:</span>
                              <span className="font-mono font-bold text-slate-900">
                                {sdppAccidentalDeathCoverDisplay}
                              </span>
                            </div>
                            <div className="text-[9px] text-slate-500 text-right">
                              {isPrimeCombo ? '2x SDPP SA + Paid Premium or Account Value' : '3x SDPP Sum Assured'}
                            </div>
                            <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
                              <span>SDPP Permanent Total Disability (APTD):</span>
                              <span className="font-mono font-bold text-slate-900">
                                {formatCurrency(sdppAptdCoverVal)}
                              </span>
                            </div>
                            <div className="text-[9px] text-slate-500 text-right">
                              2x SDPP Sum Assured (200% SA)
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Cumulative Accidental Death Benefit breakdown card */}
                      <div className="bg-emerald-50/60 p-3 rounded-lg border border-emerald-200 space-y-2 text-xs">
                        <div className="text-[10px] font-black uppercase tracking-wider text-emerald-950 border-b border-emerald-200/80 pb-1 flex justify-between items-center">
                          <span>CUMULATIVE ACCIDENTAL DEATH COVERAGE BREAKDOWN</span>
                          <span className="bg-emerald-200/80 text-emerald-900 text-[9px] px-2 py-0.5 rounded font-bold">Policy 1 + Policy 2</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-700">
                          <div className="flex justify-between">
                            <span>Policy 1 Coverage ({input.hasAccidentalProtection ? '2x SA Accidental' : '1x SA Natural'}):</span>
                            <span className="font-mono font-bold text-slate-900">{formatCurrency(policy1AccidentalCover)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Policy 2 (SDPP) Accidental Death Coverage:</span>
                            <span className="font-mono font-bold text-slate-900">{sdppAccidentalDeathCoverDisplay}</span>
                          </div>
                        </div>
                        <div className="pt-1.5 border-t border-emerald-200/80 flex justify-between items-center font-bold text-slate-900">
                          <span className="text-[11px] text-emerald-950 font-black uppercase">Total Cumulative Accidental Death Benefit:</span>
                          <span className="font-mono font-black text-brand-primary text-base">
                            {formatCurrency(totalCumulativeAccidentalDeathBenefit)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 4. Total Combined Critical Illness Coverage */}
                    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200/80 pb-2">
                        <div>
                          <div className="text-xs font-black uppercase text-slate-900">TOTAL COMBINED CRITICAL ILLNESS COVERAGE</div>
                          <div className="text-[11px] text-slate-500 font-medium">
                            Policy 1 ({formatCurrency(primaryCiVal)}) + Policy 2 SDPP ({formatCurrency(sdppCiVal)})
                          </div>
                        </div>
                        <div className="font-mono font-black text-lg text-slate-900 text-right">
                          {formatCurrency(totalCombinedCI)}
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-900 pb-1 border-b border-slate-100">
                          CRITICAL ILLNESS COVERAGE BREAKDOWN
                        </div>
                        <div className="flex justify-between items-center text-slate-700">
                          <span>Policy 1 ({selectedProduct?.productName || 'Primary Plan'} Rider):</span>
                          <span className="font-mono font-bold text-slate-900">
                            {hasPrimaryCI ? formatCurrency(primaryCiVal) : 'Not Selected (৳ 0)'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-slate-700">
                          <span>Policy 2 (Shanta SDPP - {comboSdppPlan} Plan):</span>
                          <span className="font-mono font-bold text-slate-900">
                            {isComboSdppElite ? `${formatCurrency(sdppCiVal)} (In-built 50% SA)` : 'No Coverage (৳ 0)'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-slate-900 font-bold pt-1 border-t border-slate-100">
                          <span>Total Cumulative Critical Illness Coverage:</span>
                          <span className="font-mono text-brand-primary">
                            {formatCurrency(totalCombinedCI)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 5. Estimated Total Tax Rebate (10%) - PLACED AT THE VERY END */}
                    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div>
                        <div className="text-xs font-black uppercase text-slate-900">ESTIMATED TOTAL TAX REBATE (10%)</div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          Primary Rebate ({formatCurrency(primaryTaxRebate)}) + SDPP Rebate ({formatCurrency(sdppTaxRebate)})
                        </div>
                      </div>
                      <div className="font-mono font-black text-lg text-brand-primary text-right">
                        {formatCurrency(totalTaxRebate)}
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            ) : (
              <>
                {/* Standard Single Policy Layout — SDPP keeps the existing layout */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b-2 border-slate-200 pb-2 flex items-center justify-between">
                    <span>1. Premium Commitment & Deposit Summary</span>
                    <span className="text-[10px] font-mono text-slate-500">Currency: BDT (৳)</span>
                  </h3>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider">
                          <th className="p-3 border-r border-slate-800">Plan Description</th>
                          <th className="p-3 border-r border-slate-800 text-center">Payment Frequency</th>
                          <th className="p-3 border-r border-slate-800 text-right">Periodic Deposit</th>
                          <th className="p-3 border-r border-slate-800 text-right">Annual Commitment</th>
                          <th className="p-3 text-right">Total Term Pay ({input.term} Yrs)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {isSDPP ? (
                          <>
                            {/* Deposit Premium Row */}
                            <tr className="hover:bg-slate-50">
                              <td className="p-3 border-r border-slate-200 font-bold text-slate-900">
                                Deposit Amount (Basic Plan - {input.sdppPlan || 'Elite'})
                              </td>
                              <td className="p-3 border-r border-slate-200 text-center font-medium">{input.paymentMethod}</td>
                              <td className="p-3 border-r border-slate-200 text-right font-mono font-bold">
                                {formatCurrency(basicDepositPeriodic)}
                              </td>
                              <td className="p-3 border-r border-slate-200 text-right font-mono">
                                {formatCurrency(basicDepositAnnual)}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-900">
                                {formatCurrency(basicDepositTotalTerm)}
                              </td>
                            </tr>

                            {/* Hospital Coverage Premium (if > 0) */}
                            {hiPeriodic > 0 && (
                              <tr className="hover:bg-slate-50 text-slate-800">
                                <td className="p-3 border-r border-slate-200 font-semibold text-blue-900">
                                  Hospital Coverage Premium (HI Rider)
                                </td>
                                <td className="p-3 border-r border-slate-200 text-center font-medium">{input.paymentMethod}</td>
                                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-blue-900">
                                  {formatCurrency(hiPeriodic)}
                                </td>
                                <td className="p-3 border-r border-slate-200 text-right font-mono text-blue-900">
                                  {formatCurrency(hiAnnual)}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-blue-900">
                                  {formatCurrency(hiTotalTerm)}
                                </td>
                              </tr>
                            )}

                            {/* Critical Illness Premium (if > 0) */}
                            {ciPeriodic > 0 && (
                              <tr className="hover:bg-slate-50 text-slate-800">
                                <td className="p-3 border-r border-slate-200 font-semibold text-purple-900">
                                  Critical Illness Premium (CI Rider)
                                </td>
                                <td className="p-3 border-r border-slate-200 text-center font-medium">{input.paymentMethod}</td>
                                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-purple-900">
                                  {formatCurrency(ciPeriodic)}
                                </td>
                                <td className="p-3 border-r border-slate-200 text-right font-mono text-purple-900">
                                  {formatCurrency(ciAnnual)}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-purple-900">
                                  {formatCurrency(ciTotalTerm)}
                                </td>
                              </tr>
                            )}

                            {/* Total Accumulated Financial Commitment Row */}
                            <tr className="bg-slate-100 font-black text-slate-900">
                              <td colSpan={2} className="p-3 border-r border-slate-200 uppercase text-[10px] tracking-wider text-slate-700">
                                Total Combined Financial Commitment
                              </td>
                              <td className="p-3 border-r border-slate-200 text-right font-mono text-slate-900">
                                {formatCurrency(selectedProduct?.totalPremium?.[input.paymentMethod] || (basicDepositPeriodic + hiPeriodic + ciPeriodic))}
                              </td>
                              <td className="p-3 border-r border-slate-200 text-right font-mono text-slate-900">
                                {formatCurrency(selectedProduct?.totalPremium?.['Yearly'] || (basicDepositAnnual + hiAnnual + ciAnnual))}
                              </td>
                              <td className="p-3 text-right font-mono text-base text-brand-primary">
                                {formatCurrency(primaryPaid)}
                              </td>
                            </tr>
                          </>
                        ) : (
                          <>
                            {/* Basic Policy Premium */}
                            <tr className="hover:bg-slate-50">
                              <td className="p-3 border-r border-slate-200 font-bold text-slate-900">
                                Basic Policy ({selectedProduct?.productName || 'Primary Plan'})
                              </td>
                              <td className="p-3 border-r border-slate-200 text-center font-medium">{input.paymentMethod}</td>
                              <td className="p-3 border-r border-slate-200 text-right font-mono font-bold">
                                {formatCurrency(selectedProduct?.basePremium?.[input.paymentMethod] || 0)}
                              </td>
                              <td className="p-3 border-r border-slate-200 text-right font-mono">
                                {formatCurrency(selectedProduct?.basePremium?.['Yearly'] || 0)}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-900">
                                {formatCurrency((selectedProduct?.basePremium?.[input.paymentMethod] || 0) * paymentModeMultiplier * input.term)}
                              </td>
                            </tr>

                            {/* Accidental Rider (if opted) */}
                            {input.hasAccidentalProtection && (
                              <tr className="hover:bg-slate-50 text-slate-800">
                                <td className="p-3 border-r border-slate-200 font-semibold text-emerald-900">
                                  Accidental Rider Protection (ADB/AMR/APTD/APPD)
                                </td>
                                <td className="p-3 border-r border-slate-200 text-center font-medium">{input.paymentMethod}</td>
                                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-emerald-900">
                                  {formatCurrency(selectedProduct?.adbPremium?.[input.paymentMethod] || 0)}
                                </td>
                                <td className="p-3 border-r border-slate-200 text-right font-mono text-emerald-900">
                                  {formatCurrency(selectedProduct?.adbPremium?.['Yearly'] || 0)}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-900">
                                  {formatCurrency((selectedProduct?.adbPremium?.[input.paymentMethod] || 0) * paymentModeMultiplier * input.term)}
                                </td>
                              </tr>
                            )}

                            {/* CI Classic (if opted) */}
                            {input.hasCIClassic && (
                              <tr className="hover:bg-slate-50 text-slate-800">
                                <td className="p-3 border-r border-slate-200 font-semibold text-purple-900">
                                  Critical Illness Classic Protection
                                </td>
                                <td className="p-3 border-r border-slate-200 text-center font-medium">{input.paymentMethod}</td>
                                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-purple-900">
                                  {formatCurrency(selectedProduct?.ciClassicPremium?.[input.paymentMethod] || 0)}
                                </td>
                                <td className="p-3 border-r border-slate-200 text-right font-mono text-purple-900">
                                  {formatCurrency(selectedProduct?.ciClassicPremium?.['Yearly'] || 0)}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-purple-900">
                                  {formatCurrency((selectedProduct?.ciClassicPremium?.[input.paymentMethod] || 0) * paymentModeMultiplier * input.term)}
                                </td>
                              </tr>
                            )}

                            {/* CI Standard (if opted) */}
                            {input.hasCIStandard && (
                              <tr className="hover:bg-slate-50 text-slate-800">
                                <td className="p-3 border-r border-slate-200 font-semibold text-purple-900">
                                  Standard Critical Illness Protection
                                </td>
                                <td className="p-3 border-r border-slate-200 text-center font-medium">{input.paymentMethod}</td>
                                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-purple-900">
                                  {formatCurrency(selectedProduct?.ciStandardPremium?.[input.paymentMethod] || 0)}
                                </td>
                                <td className="p-3 border-r border-slate-200 text-right font-mono text-purple-900">
                                  {formatCurrency(selectedProduct?.ciStandardPremium?.['Yearly'] || 0)}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-purple-900">
                                  {formatCurrency((selectedProduct?.ciStandardPremium?.[input.paymentMethod] || 0) * paymentModeMultiplier * input.term)}
                                </td>
                              </tr>
                            )}

                            {/* Total Financial Commitment */}
                            <tr className="bg-slate-100 font-black text-slate-900">
                              <td colSpan={2} className="p-3 border-r border-slate-200 uppercase text-[10px] tracking-wider text-slate-700">
                                Total Financial Commitment ({input.paymentMethod})
                              </td>
                              <td className="p-3 border-r border-slate-200 text-right font-mono text-slate-900">
                                {formatCurrency(selectedProduct?.totalPremium?.[input.paymentMethod] || 0)}
                              </td>
                              <td className="p-3 border-r border-slate-200 text-right font-mono text-slate-900">
                                {formatCurrency(selectedProduct?.totalPremium?.['Yearly'] || 0)}
                              </td>
                              <td className="p-3 text-right font-mono text-base text-brand-primary">
                                {formatCurrency(primaryPaid)}
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Compare all calculated payment modes; preserve the selected mode emphasis. */}
                {!isSDPP && selectedProduct?.totalPremium && (
                  <div className="space-y-2 print:break-inside-avoid">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Premium by Payment Frequency</h3>
                      <span className="text-[10px] text-slate-500">Selected mode highlighted</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['Monthly', 'Quarterly', 'Half-yearly', 'Yearly'] as const).map(mode => (
                        <div key={mode} className={cn('rounded-lg border p-2.5 text-center', input.paymentMethod === mode ? 'border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary' : 'border-slate-200 bg-white')}>
                          <div className={cn('text-[10px] uppercase tracking-wide', input.paymentMethod === mode ? 'font-black text-brand-primary' : 'font-semibold text-slate-500')}>{mode}{input.paymentMethod === mode ? ' • Selected' : ''}</div>
                          <div className={cn('mt-1 font-mono text-sm', input.paymentMethod === mode ? 'font-black text-brand-primary' : 'font-semibold text-slate-800')}>{formatCurrency(selectedProduct.totalPremium[mode] ?? 0)}</div>
                        </div>
                      ))}
                    </div>
                    {input.paymentMethod === 'Single' && <div className="rounded-lg border border-brand-primary bg-brand-primary/10 p-2.5 text-center font-black text-brand-primary">Single Premium (Selected): {formatCurrency(selectedProduct.totalPremium.Single ?? 0)}</div>}
                  </div>
                )}

                {/* Coverage & Benefit Highlights */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b-2 border-slate-200 pb-2">
                    2. Comprehensive Coverage & Benefits
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Maturity & Living Benefits */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                        <Sparkles className="w-4 h-4 text-brand-primary" />
                        <h4 className="text-xs font-black uppercase text-slate-900">Survival, Living Benefits & Maturity</h4>
                      </div>
                      <div className="space-y-2.5 text-xs">
                        <div className="space-y-0.5 pb-1">
                          <div className="text-[11px] font-semibold text-slate-700">Policy Maturity Benefit</div>
                          <div className="text-right text-sm font-black font-mono text-slate-900">
                            {isSDPP ? (
                              input.customInterestRate && Number(input.customInterestRate) > 0
                                ? formatCurrency(sdppData?.customMaturity || 0)
                                : `${formatCurrency(sdppData?.maturity7 || primaryMaturity)} - ${formatCurrency(sdppData?.maturity9 || primaryMaturity)}`
                            ) : (
                              formatCurrency(primaryMaturity)
                            )}
                          </div>
                        </div>

                        {/* Living Benefit - Critical Illness */}
                        {(isSDPP ? Boolean(sdppData?.ciCoverage) : Boolean(input.hasCIClassic || input.hasCIStandard || input.ciCoverage)) && (
                          <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-wider text-purple-800">
                              Living Benefit - Critical Illness (CI)
                            </div>
                            <div className="bg-purple-50/50 p-2.5 rounded-lg border border-purple-100 space-y-0.5">
                              <div className="text-[11px] font-semibold text-purple-900">{input.hasCIClassic ? 'Critical Illness Classic' : input.hasCIStandard ? 'Critical Illness Standard' : 'Critical Illness Coverage'}</div>{(input.hasCIClassic || input.hasCIStandard) && onViewDiseases && <button type="button" onClick={()=>onViewDiseases(input.hasCIClassic ? 'classic' : 'standard')} className="text-[11px] font-extrabold text-brand-primary underline underline-offset-2 print:hidden">View Diseases →</button>}
                              <div className="text-right text-sm font-black font-mono text-purple-700">
                                Up to {formatCurrency(isSDPP ? (sdppData?.ciCoverage || 0) : (input.ciCoverage || Math.min(input.sumAssured * 0.5, 1500000)))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Living Benefit - Tax Rebate */}
                        <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                          <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                            Living Benefit - Tax Rebate
                          </div>
                          <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 flex justify-between items-center">
                            <div>
                              <div className="text-[11px] font-semibold text-emerald-900">Tax Rebate Benefit (10% Est.)</div>
                              <div className="text-[9px] text-emerald-700">Annual Income Tax Savings</div>
                            </div>
                            <div className="text-right text-sm font-black font-mono text-emerald-700">
                              {formatCurrency(primaryTaxRebate)}
                            </div>
                          </div>
                        </div>

                        {/* Living Benefit - Partner Hospital Discount */}
                        <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                          <div className="text-[10px] font-black uppercase tracking-wider text-blue-800">
                            Living Benefit - Healthcare Perks
                          </div>
                          <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 flex justify-between items-center">
                            <div>
                              <div className="text-[11px] font-semibold text-blue-900">Partner Hospital Discount</div>
                              <div className="text-[9px] text-blue-700">At partner hospitals & diagnostic centers</div>
                            </div>
                            <div className="text-right text-sm font-black font-mono text-blue-700">
                              Up to 40%
                            </div>
                          </div>
                        </div>

                        {/* Staged Maturity Breakdown for S3PP & S4PP */}
                        {isS3PP && (
                          <div className="pt-3 border-t border-slate-200 space-y-2">
                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-700">Maturity Summary</div>
                            <div className="space-y-2 bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60 text-xs">
                              <div className="border-b border-amber-200/40 pb-1.5">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-amber-900">
                                  <span>1/3 of the Policy Term (25%)</span>
                                  <span className="font-mono text-slate-600">{issueYear + Math.round(input.term / 3)}</span>
                                </div>
                                <div className="text-sm font-black font-mono text-slate-900 pt-0.5">
                                  {formatCurrency(input.sumAssured * 0.25)}
                                </div>
                              </div>

                              <div className="border-b border-amber-200/40 pb-1.5">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-amber-900">
                                  <span>2/3 of the Policy Term (25%)</span>
                                  <span className="font-mono text-slate-600">{issueYear + Math.round((input.term * 2) / 3)}</span>
                                </div>
                                <div className="text-sm font-black font-mono text-slate-900 pt-0.5">
                                  {formatCurrency(input.sumAssured * 0.25)}
                                </div>
                              </div>

                              <div>
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-amber-900">
                                  <span>Remaining Sum Assured (50%)</span>
                                  <span className="font-mono text-slate-600">{issueYear + input.term}</span>
                                </div>
                                <div className="text-sm font-black font-mono text-brand-primary pt-0.5">
                                  {formatCurrency(input.sumAssured * 0.50)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {isS4PP && (
                          <div className="pt-3 border-t border-slate-200 space-y-2">
                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-700">Maturity Summary</div>
                            <div className="space-y-2 bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60 text-xs">
                              <div className="border-b border-amber-200/40 pb-1.5">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-amber-900">
                                  <span>1/4 of the Policy Term (15%)</span>
                                  <span className="font-mono text-slate-600">{issueYear + Math.round(input.term / 4)}</span>
                                </div>
                                <div className="text-sm font-black font-mono text-slate-900 pt-0.5">
                                  {formatCurrency(input.sumAssured * 0.15)}
                                </div>
                              </div>

                              <div className="border-b border-amber-200/40 pb-1.5">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-amber-900">
                                  <span>2/4 of the Policy Term (15%)</span>
                                  <span className="font-mono text-slate-600">{issueYear + Math.round((input.term * 2) / 4)}</span>
                                </div>
                                <div className="text-sm font-black font-mono text-slate-900 pt-0.5">
                                  {formatCurrency(input.sumAssured * 0.15)}
                                </div>
                              </div>

                              <div className="border-b border-amber-200/40 pb-1.5">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-amber-900">
                                  <span>3/4 of the Policy Term (15%)</span>
                                  <span className="font-mono text-slate-600">{issueYear + Math.round((input.term * 3) / 4)}</span>
                                </div>
                                <div className="text-sm font-black font-mono text-slate-900 pt-0.5">
                                  {formatCurrency(input.sumAssured * 0.15)}
                                </div>
                              </div>

                              <div>
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-amber-900">
                                  <span>Remaining Sum Assured (55%)</span>
                                  <span className="font-mono text-slate-600">{issueYear + input.term}</span>
                                </div>
                                <div className="text-sm font-black font-mono text-brand-primary pt-0.5">
                                  {formatCurrency(input.sumAssured * 0.55)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>


                    {/* Life Cover & Death Benefit */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                        <Shield className="w-4 h-4 text-brand-primary" />
                        <h4 className="text-xs font-black uppercase text-slate-900">Life Protection & Death Cover</h4>
                      </div>
                      <div className="space-y-2.5 text-xs">
                        <div className="space-y-0.5 pb-1">
                          <div className="text-[11px] font-semibold text-slate-700">Natural Death Cover (Life Cover)</div>
                          <div className="text-right text-sm font-black font-mono text-slate-900">
                            {isSDPP ? (
                              input.sdppPlan === 'Prime' ? (
                                'Account Value or Paid Basic Deposit'
                              ) : (
                                `${formatCurrency(typeof sdppData?.deathBenefit === 'number' ? sdppData.deathBenefit : (input.targetPremium || 5000) * 12 * input.term)} or Account Value`
                              )
                            ) : (
                              formatCurrency(input.sumAssured)
                            )}
                          </div>
                        </div>

                        {/* Child Education Monthly Stipend & Waiver of Premium */}
                        {isChildPlan && (
                          <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                              Child Education Stipend ({childPercentageStr}% of SA)
                            </div>
                            <div className="bg-amber-50/60 p-2.5 rounded-lg border border-amber-200/80 space-y-1">
                              <div className="flex justify-between items-center">
                                <div className="text-[11px] font-bold text-amber-950">Monthly Education Stipend</div>
                                <div className="text-right text-sm font-black font-mono text-amber-800">
                                  {formatCurrency(childStipend)} / mo
                                </div>
                              </div>
                              <div className="text-[9px] text-amber-900 leading-snug">
                                Guaranteed monthly stipend paid upon death of the policyholder until maturity. All future premiums are waived in full.
                              </div>
                            </div>
                          </div>
                        )}

                        {/* SDPP Accidental Coverage or Standard Accidental Rider */}
                        {isSDPP ? (
                          <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                              Accidental Coverage
                            </div>
                            <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 space-y-2">
                              {/* 1. Accidental Death Benefit */}
                              <div className="border-b border-emerald-200/50 pb-1.5 flex justify-between items-center">
                                <div>
                                  <div className="text-[11px] font-semibold text-emerald-900">Accidental Death Benefit</div>
                                  <div className="text-[9px] text-emerald-700">
                                    {input.sdppPlan === 'Prime' ? 'Accidental Cover + Natural Death Cover' : 'Double Sum Assured + Main Life Cover'}
                                  </div>
                                </div>
                                <div className="text-right text-sm font-black font-mono text-emerald-700">
                                  {input.sdppPlan === 'Prime' ? (
                                    `${formatCurrency(sdppData?.accidentalBenefit || 0)} + Death Benefit`
                                  ) : (
                                    formatCurrency((sdppData?.accidentalBenefit || 0) + (typeof sdppData?.deathBenefit === 'number' ? sdppData.deathBenefit : 0))
                                  )}
                                </div>
                              </div>

                              {/* 2. Accidental Permanent Total Disability (APTD) */}
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="text-[11px] font-semibold text-emerald-900">Accidental Permanent Total Disability (APTD)</div>
                                  <div className="text-[9px] text-emerald-700">
                                    Double Sum Assured (200% SA)
                                  </div>
                                </div>
                                <div className="text-right text-sm font-black font-mono text-emerald-700">
                                  {formatCurrency(sdppData?.accidentalBenefit || 0)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          input.hasAccidentalProtection && (
                            <div className="pt-2 border-t border-slate-200/80 space-y-2">
                              <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                                Accidental Rider Protection (4 Coverages)
                              </div>
                              <div className="space-y-2 bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100">
                                <div className="border-b border-emerald-200/50 pb-1.5 space-y-0.5">
                                  <div className="text-[11px] font-semibold text-emerald-900">1. Accidental Death Benefit (200%)</div>
                                  <div className="text-right text-sm font-black font-mono text-emerald-700">
                                    {formatCurrency(input.sumAssured * 2)}
                                  </div>
                                </div>

                                <div className="border-b border-emerald-200/50 pb-1.5 space-y-0.5">
                                  <div className="text-[11px] font-semibold text-emerald-900">2. Accidental Medical Reimbursement (AMR)</div>
                                  <div className="text-right text-sm font-black font-mono text-emerald-700">
                                    Up to {formatCurrency(input.sumAssured * 0.15)} <span className="text-[10px] font-bold text-emerald-800">(15%)</span>
                                  </div>
                                </div>

                                <div className="border-b border-emerald-200/50 pb-1.5 space-y-0.5">
                                  <div className="text-[11px] font-semibold text-emerald-900">3. Accidental Permanent Total Disability (APTD)</div>
                                  <div className="text-right text-sm font-black font-mono text-emerald-700">
                                    {formatCurrency(input.sumAssured)} <span className="text-[10px] font-bold text-emerald-800">(100%)</span>
                                  </div>
                                </div>

                                <div className="space-y-0.5">
                                  <div className="text-[11px] font-semibold text-emerald-900">4. Accidental Permanent Partial Disability (APPD)</div>
                                  <div className="text-right text-sm font-black font-mono text-emerald-700">
                                    Up to {formatCurrency(input.sumAssured)} <span className="text-[10px] font-bold text-emerald-800">(100%)</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Disclaimer & Footer on Page 1 for Combo & SDPP Illustration */}
            {(isComboEnabled || isSDPP) && (
              <>
                {/* Good to know before you decide */}
                <div className="bg-[#f7f8ef] border border-brand-primary/30 rounded-xl p-4 space-y-2 text-[10px] text-slate-700 leading-relaxed mt-6">
                  <h4 className="font-bold uppercase tracking-wider text-slate-900 text-[11px]">Good to know before you decide</h4>
                  <ul className="list-disc list-inside space-y-1.5 font-medium">
                    <li>You get <strong>31 days of grace</strong> to pay a due premium. If premiums stop after at least 2 years, most plans let you keep a reduced <strong>paid-up</strong> cover instead of surrendering.</li>
                    <li>If you <strong>surrender early</strong>, the amount you receive (see the year-by-year values) is in the early years <strong>less than the premiums you have paid</strong>. For stage-paying plans the value also falls just after a stage payment, because that money has already been paid to you.</li>
                    <li>Where the plan allows, you may take a <strong>policy loan of up to 80% of the surrender value</strong> from the 4th policy year; interest applies as set by the company from time to time.</li>
                    <li><strong>ETI</strong> (where available) uses part of your surrender value to keep the <strong>full death cover until the original maturity date</strong> and returns the rest in cash. It is protection only - if you survive to maturity, nothing further is payable under ETI.</li>
                    <li>Any <strong>income-tax rebate</strong> depends on your income, the approved investment limit and the NBR rules in force, which can change. No tax saving is guaranteed by this illustration.</li>
                    <li>Keep your <strong>nominee</strong> information updated - benefits on death are paid to your nominee. Questions? Call the Shanta Life hotline <strong>16758</strong>.</li>
                  </ul>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-[10px] text-slate-600 leading-relaxed mt-6">
                  <h4 className="font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5 text-[11px]">
                    <Scale className="w-3.5 h-3.5 text-slate-700" /> Important Disclaimer & Notes
                  </h4>
                  <ul className="list-disc list-inside space-y-1 font-medium">
                    <li><strong>Unofficial Sample Document:</strong> This illustration is not an official document. It is prepared solely for educational, training, and sales pitching purposes for better understanding.</li>
                    <li><strong>Indicative Calculations:</strong> Premium amounts, maturity values, surrender values, and benefit figures are calculated from the current actuarial certificate tables. If any figure differs from your issued policy document, the policy document will prevail.</li>
                    <li><strong>Official Verification:</strong> Final policy issuance, actual premium rates, and coverage terms will strictly be determined according to the official Shanta Life Insurance website calculator and company underwriting policies.</li>
                    <li><strong>Tax Rebates:</strong> Tax benefits and rebates are subject to the Income Tax Act of Bangladesh and applicable National Board of Revenue (NBR) rules.</li>
                  </ul>
                </div>

                <div className="text-center text-[9px] text-slate-400 font-mono pt-2 border-t border-slate-100">
                  Generated via T&D Team PremiumPulse Engine • Sample Proposal Document
                </div>
              </>
            )}

          </div>
          )}

          {/* Standard single-policy quotation — one continuous app-style page.
              No paper sheet, no letterhead: the logo, client details and
              policy grid live in the downloaded PDF illustration only. */}
          {!isComboEnabled && !isSDPP && (
            <div
              data-quotation-content="true"
              data-page="1"
              className="w-full space-y-4 sm:space-y-6"
            >
              {/* Slim heading — product + term only */}
              <div className="rounded-2xl border border-[#e5e8df] bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-brand-text">{selectedProduct?.productName || 'Shanta Insurance Policy'}</h2>
                  <span className="rounded-full bg-[#f0f1df] px-3 py-1 text-xs font-bold text-brand-text">{input.term} Years</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Unofficial sample illustration</p>
              </div>
              {/* Redesigned standard quotation — single non-SDPP policy.
                  Order: 1. selected plan summary (Breakdown and Compare open
                  their dialogs from the premium tile), 2. core benefits
                  (survival, death, riders). Combo and SDPP keep the existing
                  layouts above. */}
              <div className="space-y-4 sm:space-y-6">
                {/* 1. Your plan at a glance — selected product + selected mode */}
                <div className="rounded-2xl border border-[#e5e8df] bg-white p-4 sm:p-5 space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-brand-text border-b-2 border-brand-primary/40 pb-2 flex items-center justify-between">
                    <span>1. Your Plan at a Glance</span>
                    <span className="text-[10px] font-mono text-slate-500">All amounts in BDT (৳)</span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-xl border border-[#e5e8df] bg-white p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{input.paymentMethod} premium</div>
                      <div className="mt-1 font-mono text-base font-black text-brand-text">{formatCurrency(selectedProduct?.totalPremium?.[input.paymentMethod] || 0)}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">per payment</div>
                      {(onViewPremiumBreakdown || (onViewModeComparison && standardHasModes)) && (
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          {onViewPremiumBreakdown && (
                            <button type="button" onClick={onViewPremiumBreakdown} className="text-[11px] font-extrabold text-brand-primary underline underline-offset-2 print:hidden">Breakdown →</button>
                          )}
                          {onViewModeComparison && standardHasModes && (
                            <button type="button" onClick={onViewModeComparison} className="text-[11px] font-extrabold text-brand-primary underline underline-offset-2 print:hidden">Compare →</button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-[#e5e8df] bg-white p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total premium paid</div>
                      <div className="mt-1 font-mono text-base font-black text-brand-text">{formatCurrency(primaryPaid)}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">over {input.term} years</div>
                    </div>
                    <div className="rounded-xl border border-brand-primary/40 bg-[#F9FAF3] p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Maturity payout</div>
                      <div className="mt-1 font-mono text-base font-black text-brand-primary">{formatCurrency(primaryMaturity)}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{standardStages.length > 0 ? `in ${standardStages.length} stage payouts` : `at year ${input.term} (${issueYear + input.term})`}</div>
                    </div>
                    <div className="rounded-xl border border-brand-primary/40 bg-[#F9FAF3] p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Death cover</div>
                      <div className="mt-1 font-mono text-base font-black text-brand-primary">{formatCurrency(standardDeathCover)}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">paid to your nominee</div>
                    </div>
                  </div>
                </div>

                {/* 2. Core benefits */}
                <div className="rounded-2xl border border-[#e5e8df] bg-white p-4 sm:p-5 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-brand-text border-b-2 border-brand-primary/40 pb-2">
                    {standardBenefitsNum}. Core Benefits
                  </h3>

                  {/* Survival and death panels sit side by side on wider screens
                      (they stack on mobile) so the full-width layout reads well. */}
                  <div className="grid gap-4 md:grid-cols-2">
                  {/* Survival benefits — what you receive while alive */}
                  <div className="bg-[#f7f8ef] border border-[#e5e8df] rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-black uppercase text-brand-text flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-brand-primary" /> If you stay alive — survival benefits
                    </h4>
                    {standardStages.length > 0 ? (
                      <div className="space-y-2">
                        <div className="overflow-x-auto border border-[#e5e8df] rounded-lg bg-white">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-[#f0f1df] font-bold text-[10px] uppercase tracking-wider text-slate-700">
                                <th className="p-2.5 border-r border-[#e5e8df]">Payout</th>
                                <th className="p-2.5 border-r border-[#e5e8df] text-center">Policy year</th>
                                <th className="p-2.5 border-r border-[#e5e8df] text-center">Calendar year</th>
                                <th className="p-2.5 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e5e8df]">
                              {standardStages.map((stage) => (
                                <tr key={stage.label} className="hover:bg-[#f7f8ef]">
                                  <td className="p-2.5 border-r border-[#e5e8df] font-bold text-brand-text">{stage.label} ({stage.percent}%)</td>
                                  <td className="p-2.5 border-r border-[#e5e8df] text-center font-mono">Year {stage.policyYear}</td>
                                  <td className="p-2.5 border-r border-[#e5e8df] text-center font-mono">{stage.calendarYear}</td>
                                  <td className="p-2.5 text-right font-mono font-bold text-brand-text">{formatCurrency(stage.amount)}</td>
                                </tr>
                              ))}
                              <tr className="bg-[#f0f1df] font-black text-brand-text">
                                <td colSpan={3} className="p-2.5 border-r border-[#e5e8df] uppercase text-[10px] tracking-wider">Total you will receive</td>
                                <td className="p-2.5 text-right font-mono text-brand-primary">{formatCurrency(input.sumAssured)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[11px] text-slate-500">Stage payouts are part of the full sum assured — not additional to it.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                          <div className="text-xs font-bold text-brand-text">Maturity payout — Year {input.term} ({issueYear + input.term})</div>
                          {isChildPlan && <div className="text-[11px] text-slate-500">Paid at maturity even after the stipend starts.</div>}
                        </div>
                        <div className="font-mono font-black text-base text-brand-primary text-right">{formatCurrency(primaryMaturity)}</div>
                      </div>
                    )}
                  </div>

                  {/* Death benefits — including the Child Education stipend story */}
                  <div className="bg-[#f7f8ef] border border-[#e5e8df] rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-black uppercase text-brand-text flex items-center gap-2">
                      <Shield className="w-4 h-4 text-brand-primary" /> If the policyholder dies
                    </h4>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="text-xs font-bold text-brand-text">Death cover — paid to your nominee</div>
                      <div className="font-mono font-black text-base text-brand-text text-right">{formatCurrency(standardDeathCover)}</div>
                    </div>
                    {isChildPlan && standardStipend && (
                      <div className="space-y-2 pt-2 border-t border-[#e5e8df]">
                        <div className="rounded-lg border-2 border-[#F37021] bg-[#FFF4ED] p-3 space-y-1">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <div>
                              <div className="text-xs font-black uppercase text-brand-text">Monthly education stipend — {Math.round(standardStipend.percent * 100)}% of sum assured</div>
                              <div className="text-[11px] text-slate-600">Paid every month until maturity, so your child's education continues.</div>
                            </div>
                            <div className="font-mono font-black text-base text-brand-text text-right whitespace-nowrap">{formatCurrency(standardStipend.monthly)} <span className="text-xs font-bold">/ month</span></div>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                          <div className="font-bold text-brand-text">At maturity — full sum assured again</div>
                          <div className="font-mono font-black text-brand-text text-right">{formatCurrency(input.sumAssured)}</div>
                        </div>
                        <p className="text-[11px] text-slate-500">Future premiums are waived — subject to covered event and policy terms.</p>
                      </div>
                    )}
                  </div>
                  </div>

                  {/* Rider benefits — only the riders actually selected */}
                  {(standardAdb || standardCiCoverage > 0) && (
                    <div className="bg-[#f7f8ef] border border-[#e5e8df] rounded-xl p-4 space-y-4">
                      <h4 className="text-xs font-black uppercase text-brand-text flex items-center gap-2">
                        <Activity className="w-4 h-4 text-brand-primary" /> Your riders
                      </h4>
                      {standardAdb && (
                        <div className="space-y-2">
                          <div className="text-[11px] font-black uppercase tracking-wider text-slate-700">Accidental Protection rider</div>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-slate-700">Accidental death cover (total, including base cover)</span>
                              <span className="font-mono font-bold text-brand-text text-right">{formatCurrency(standardAdb.deathCoverTotal)}</span>
                            </div>
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-slate-700">Permanent total / partial disability — each</span>
                              <span className="font-mono font-bold text-brand-text text-right">{formatCurrency(standardAdb.disabilityEach)}</span>
                            </div>
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-slate-700">Accidental medical reimbursement — up to</span>
                              <span className="font-mono font-bold text-brand-text text-right">{formatCurrency(standardAdb.medicalReimbursementMax)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      {standardCiCoverage > 0 && (
                        <div className="space-y-2 pt-3 border-t border-[#e5e8df]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[11px] font-black uppercase tracking-wider text-slate-700">Critical Illness — {input.hasCIClassic ? 'Classic' : 'Standard'} rider</div>
                            {(input.hasCIClassic || input.hasCIStandard) && onViewDiseases && <button type="button" onClick={() => onViewDiseases(input.hasCIClassic ? 'classic' : 'standard')} className="text-[11px] font-extrabold text-brand-primary underline underline-offset-2 print:hidden">View Diseases →</button>}
                          </div>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-slate-700">Critical illness coverage</span>
                              <span className="font-mono font-bold text-brand-text text-right">{formatCurrency(standardCiCoverage)}</span>
                            </div>
                            {input.hasCIClassic ? (
                              <p className="text-[11px] text-slate-500">Every covered condition pays the full coverage amount.</p>
                            ) : (
                              <>
                                <div className="flex justify-between items-center gap-2">
                                  <span className="text-slate-700">Minor condition — {Math.round(CI_MINOR_BENEFIT_SHARE * 100)}% of coverage</span>
                                  <span className="font-mono font-bold text-brand-text text-right">{formatCurrency(standardCiCoverage * CI_MINOR_BENEFIT_SHARE)}</span>
                                </div>
                                <div className="flex justify-between items-center gap-2">
                                  <span className="text-slate-700">Major condition — {Math.round(CI_MAJOR_BENEFIT_SHARE_WITHOUT_MINOR * 100)}% if no minor claimed, {Math.round(CI_MAJOR_BENEFIT_SHARE_AFTER_MINOR * 100)}% if minor claimed</span>
                                  <span className="font-mono font-bold text-brand-text text-right">{formatCurrency(standardCiCoverage * CI_MAJOR_BENEFIT_SHARE_WITHOUT_MINOR)} / {formatCurrency(standardCiCoverage * CI_MAJOR_BENEFIT_SHARE_AFTER_MINOR)}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Projection Schedule Table - Matching Liquidity View Columns & Data */}
              {showProjection && projectionData && projectionData.length > 0 && (
                <div className="rounded-2xl border border-[#e5e8df] bg-white p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between border-b-2 border-brand-primary/40 pb-2">
                    <h3 className="text-xs font-black uppercase tracking-wider text-brand-text">
                      {standardProjectionNum}. Policy Value Projection Trajectory
                    </h3>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Illustrative schedule over {input.term} years
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-[#e5e8df] rounded-xl">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-[#f0f1df] text-brand-text font-bold text-[9px] uppercase tracking-wider">
                          <th className="p-2.5 border-r border-[#e5e8df] text-center">END OF YEAR</th>
                          <th className="p-2.5 border-r border-[#e5e8df] text-right">BASE PREMIUM</th>
                          <th className="p-2.5 border-r border-[#e5e8df] text-right">NATURAL DEATH</th>
                          <th className="p-2.5 border-r border-[#e5e8df] text-right">SURRENDER VALUE</th>
                          <th className="p-2.5 border-r border-[#e5e8df] text-right">PAID UP VALUE</th>
                          <th className="p-2.5 text-center">ETI BENEFITS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e5e8df]">
                        {projectionData.map((row) => (
                          <tr key={row.year} className="hover:bg-[#f7f8ef]">
                            <td className="p-2 border-r border-[#e5e8df] text-center font-bold text-slate-700">
                              {row.year}
                            </td>
                            <td className="p-2 border-r border-[#e5e8df] text-right font-mono font-medium text-brand-text">
                              {row.premium > 0 ? formatCurrency(row.premium) : '—'}
                            </td>
                            <td className="p-2 border-r border-[#e5e8df] text-right font-mono font-bold text-brand-text">
                              {formatCurrency(row.deathBenefit || input.sumAssured)}
                            </td>
                            <td className="p-2 border-r border-[#e5e8df] text-right font-mono text-brand-primary font-bold">
                              {row.surrenderValue > 0 ? formatCurrency(row.surrenderValue) : '—'}
                            </td>
                            <td className="p-2 border-r border-[#e5e8df] text-right font-mono text-slate-700 font-medium">
                              {row.paidUpValue > 0 ? formatCurrency(row.paidUpValue) : '—'}
                            </td>
                            <td className="p-2 text-center font-mono text-[10px]">
                              {row.etiDurationStr && row.etiDurationStr !== '—' ? (
                                <div className="flex flex-col items-center">
                                  <span className={cn(
                                    "font-bold",
                                    row.etiDurationStr.startsWith('-') ? "text-rose-600" : "text-emerald-600"
                                  )}>
                                    {row.etiDurationStr}
                                  </span>
                                  <span className="text-[8px] text-slate-500 uppercase font-medium">
                                    Active Death Coverage: {formatCurrency(row.etiCoverage || input.sumAssured)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* Good to know + disclaimer sit side by side on wider screens. */}
              <div className="grid gap-4 lg:grid-cols-2">
              {/* Good to know before you decide */}
              <div className="bg-[#f7f8ef] border border-brand-primary/30 rounded-xl p-4 space-y-2 text-[10px] text-slate-700 leading-relaxed">
                <h4 className="font-bold uppercase tracking-wider text-brand-text text-[11px]">Good to know before you decide</h4>
                <ul className="list-disc list-inside space-y-1.5 font-medium">
                  <li>You get <strong>31 days of grace</strong> to pay a due premium. If premiums stop after at least 2 years, most plans let you keep a reduced <strong>paid-up</strong> cover instead of surrendering.</li>
                  <li>If you <strong>surrender early</strong>, the amount you receive (see the year-by-year values) is in the early years <strong>less than the premiums you have paid</strong>. For stage-paying plans the value also falls just after a stage payment, because that money has already been paid to you.</li>
                  <li>Where the plan allows, you may take a <strong>policy loan of up to 80% of the surrender value</strong> from the 4th policy year; interest applies as set by the company from time to time.</li>
                  <li><strong>ETI</strong> (where available) uses part of your surrender value to keep the <strong>full death cover until the original maturity date</strong> and returns the rest in cash. It is protection only - if you survive to maturity, nothing further is payable under ETI.</li>
                  <li>Any <strong>income-tax rebate</strong> depends on your income, the approved investment limit and the NBR rules in force, which can change. No tax saving is guaranteed by this illustration.</li>
                  <li>Keep your <strong>nominee</strong> information updated - benefits on death are paid to your nominee. Questions? Call the Shanta Life hotline <strong>16758</strong>.</li>
                </ul>
              </div>

              {/* Terms & Conditions / Regulatory Disclaimers */}
              <div className="bg-white border border-[#e5e8df] rounded-xl p-4 space-y-2 text-[10px] text-slate-600 leading-relaxed">
                <h4 className="font-bold uppercase tracking-wider text-brand-text flex items-center gap-1.5 text-[11px]">
                  <Scale className="w-3.5 h-3.5 text-slate-700" /> Important Disclaimer & Notes
                </h4>
                <ul className="list-disc list-inside space-y-1.5 font-medium">
                  <li><strong>Unofficial Sample Document:</strong> This illustration is not an official document. It is prepared solely for educational, training, and sales pitching purposes for better understanding.</li>
                  <li><strong>Indicative Calculations:</strong> Premium amounts, maturity values, surrender values, and benefit figures are calculated from the current actuarial certificate tables. If any figure differs from your issued policy document, the policy document will prevail.</li>
                  <li><strong>Official Verification:</strong> Final policy issuance, actual premium rates, and coverage terms will strictly be determined according to the official Shanta Life Insurance website calculator and company underwriting policies.</li>
                  <li><strong>Tax Rebates:</strong> Tax benefits and rebates are subject to the Income Tax Act of Bangladesh and applicable National Board of Revenue (NBR) rules.</li>
                </ul>
              </div>
              </div>

              {/* Footer Notice */}
              <div className="text-center text-[9px] text-slate-400 font-mono pt-4 border-t border-[#e5e8df]">
                Generated via T&D Team PremiumPulse Engine • Sample Proposal Document
              </div>

            </div>
          )}

          {/* Print / download actions — at the very end of the preview, after
              all content (every layout: standard, SDPP, combo). Buttons and
              behaviour are unchanged, only the position moved. */}
          <div className={cn("print:hidden mx-auto w-full", (isComboEnabled || isSDPP) ? "max-w-[800px]" : "")}>
            <div className="rounded-2xl border border-[#e5e8df] bg-white p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-600" role="status" aria-live="polite">
                  {isGeneratingPdf ? 'Preparing your personalized A4 quotation…' : 'PDF download includes a clean, print-ready summary, benefit details and available policy projections.'}
                </p>
                {pdfError && <p role="alert" className="mt-2 text-sm text-red-700">{pdfError} You can retry using Download PDF.</p>}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                <button
                  title="Print quotation" aria-label="Print quotation"
                  onClick={handlePrint}
                  className="px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-300" />
                  <span className="hidden sm:inline">Print</span>
                </button>
                <button
                  title="Download PDF" aria-label={isGeneratingPdf ? "Generating quotation PDF" : "Download PDF"} aria-busy={isGeneratingPdf}
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                  className="px-4 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-brand-primary/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isGeneratingPdf ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span className="hidden sm:inline">Generating...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span className="hidden sm:inline">Download PDF</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
