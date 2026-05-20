'use client';

/**
 * Chip-style input for branch (sheet tab) names. Admin types a name and hits
 * Enter (or comma) to add it; clicks the × to remove. Empty list means
 * "unrestricted" (see canAccessLeadBranch in src/lib/permissions/branches).
 */
import { useState } from 'react';

interface Props {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
}

export default function BranchSelector({
  id,
  value,
  onChange,
  disabled,
  label = 'Allowed branches',
  helperText = 'Leave empty to grant access to all branches.',
}: Props) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...value, trimmed]);
    setDraft('');
  };

  const remove = (branch: string) => {
    onChange(value.filter((b) => b !== branch));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-[#0F172A]">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white p-2 shadow-sm focus-within:border-[#0b6cbf] focus-within:ring-2 focus-within:ring-[#0b6cbf]/20">
        {value.map((b) => (
          <span
            key={b}
            className="flex items-center gap-1 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-xs font-semibold text-[#0b6cbf]"
          >
            {b}
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(b)}
                aria-label={`Remove ${b}`}
                className="ml-0.5 text-[#0b6cbf]/70 hover:text-[#0b6cbf]"
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          disabled={disabled}
          placeholder={value.length === 0 ? 'e.g. Indiranagar' : ''}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            } else if (
              e.key === 'Backspace' &&
              draft === '' &&
              value.length > 0
            ) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={commit}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm text-[#0F172A] focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      {helperText && (
        <p className="text-[11px] text-[#64748B]">{helperText}</p>
      )}
    </div>
  );
}
