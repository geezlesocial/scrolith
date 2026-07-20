/**
 * Phase 28 — platform-wide money display.
 * Formatting only; conversion uses server-provided rates via CurrencyContext when possible.
 */
import React, { useMemo } from 'react';
import { useCurrency } from '../../context/CurrencyContext';

type MoneyDisplayProps = {
  /** Canonical amount in major units (base or source currency). */
  amount: number | string | null | undefined;
  /** Source/canonical currency of amount (defaults to platform base / USD). */
  currency?: string;
  /** Override display currency; defaults to user preferred. */
  displayCurrency?: string;
  /** When true, show secondary base line. */
  showBaseSecondary?: boolean;
  className?: string;
  /** Locked quote rate: 1 source = rate display (skips context rate). */
  lockedRate?: number | string | null;
  /** After quote lock, do not say "approximately". */
  locked?: boolean;
  compact?: boolean;
};

const coerceNumber = (input: unknown): number | null => {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const cleaned = input.replace(/[^0-9.-]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const MoneyDisplay: React.FC<MoneyDisplayProps> = ({
  amount,
  currency: sourceCurrency,
  displayCurrency,
  showBaseSecondary = false,
  className = '',
  lockedRate,
  locked = false,
  compact = false
}) => {
  const { currency, availableCurrencies, formatPrice, convertAmount, baseCurrency } = useCurrency();

  const source = String(sourceCurrency || baseCurrency || 'USD').trim().toUpperCase();
  const display = String(displayCurrency || currency?.code || source).trim().toUpperCase();
  const base = coerceNumber(amount) ?? 0;

  const { primary, secondary } = useMemo(() => {
    if (source === display) {
      return {
        primary: new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: display
        }).format(base),
        secondary: null as string | null
      };
    }

    let converted = base;
    if (lockedRate != null && Number(lockedRate) > 0) {
      converted = base * Number(lockedRate);
    } else if (typeof convertAmount === 'function') {
      converted = convertAmount(base, source, display);
    } else {
      // Fallback: formatPrice assumes amount is already base-currency major units
      return {
        primary: formatPrice(base),
        secondary: showBaseSecondary
          ? new Intl.NumberFormat(undefined, { style: 'currency', currency: source }).format(base)
          : null
      };
    }

    const primaryText = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: display
    }).format(converted);

    const secondaryText =
      showBaseSecondary && source !== display
        ? `${locked ? 'Based on' : 'Approx.'} ${new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: source
          }).format(base)}`
        : null;

    return { primary: primaryText, secondary: secondaryText };
  }, [amount, base, convertAmount, display, formatPrice, locked, lockedRate, showBaseSecondary, source]);

  return (
    <span className={className} data-testid="money-display" data-currency={display} data-source={source}>
      <span className={compact ? 'font-semibold tabular-nums' : 'font-semibold tabular-nums'}>{primary}</span>
      {secondary ? (
        <span className="ml-1.5 text-[11px] font-normal text-slate-500 tabular-nums">{secondary}</span>
      ) : null}
    </span>
  );
};

export default MoneyDisplay;
