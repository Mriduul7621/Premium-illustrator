import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  // Indian digit grouping (en-IN): 10,00,000 — the board's format, chosen by
  // Mahadi 2026-11-24. The space between symbol and amount is stripped to
  // match the board (৳10,00,000, not ৳ 10,00,000).
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(amount).replace('BDT', '৳').replace(/\s/g, '');
}
