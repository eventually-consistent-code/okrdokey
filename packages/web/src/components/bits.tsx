/**
 * Purpose: Small shared UI atoms — RAG dot, status stamp, score numeral,
 *          buttons, form field. The ledger look lives here so pages stay
 *          plain.
 * Author(s): John Reed
 */

import type { Confidence, ObjectiveStatus } from '@okrdokey/shared';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

const RAG_COLOR: Record<Confidence, string> = {
  red: 'bg-rag-red',
  yellow: 'bg-rag-yellow',
  green: 'bg-rag-green',
};

export function RagDot({ confidence }: { confidence: Confidence | null }): ReactNode {
  if (!confidence) return <span className="inline-block size-2.5 rounded-full border border-line bg-paper" title="no check-ins yet" />;
  return <span className={`inline-block size-2.5 rounded-full ${RAG_COLOR[confidence]}`} title={confidence} />;
}

const STATUS_STYLE: Record<ObjectiveStatus, string> = {
  'on-track': 'text-rag-green border-rag-green/40',
  'at-risk': 'text-rag-yellow border-rag-yellow/50',
  behind: 'text-rag-red border-rag-red/40',
};

// status as a little inked stamp
export function StatusStamp({ status }: { status: ObjectiveStatus }): ReactNode {
  return (
    <span
      className={`ledger-num inline-block -rotate-2 border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

export function Score({ value, size = 'md' }: { value: number; size?: 'md' | 'lg' }): ReactNode {
  return (
    <span className={`ledger-num font-semibold ${size === 'lg' ? 'text-4xl' : 'text-lg'}`}>
      {value.toFixed(2)}
    </span>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }): ReactNode {
  const styles = {
    primary: 'bg-ember text-paper-raised hover:bg-ember-deep',
    ghost: 'border border-line bg-paper-raised hover:border-ink-soft',
    danger: 'border border-rag-red/50 text-rag-red bg-paper-raised hover:bg-rag-red/10',
  }[variant];
  return (
    <button
      className={`cursor-pointer px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${styles} ${className}`}
      {...rest}
    />
  );
}

export function Field({
  label,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }): ReactNode {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      <input
        className="w-full border border-line bg-paper-raised px-3 py-2 text-sm outline-none focus:border-ember"
        {...rest}
      />
      {error ? <span className="mt-1 block text-xs text-rag-red">{error}</span> : null}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }): ReactNode {
  return (
    <div className={`border border-line bg-paper-raised p-4 shadow-card ${className}`}>{children}</div>
  );
}
