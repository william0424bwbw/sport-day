import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { timeOptions } from '@shared/time';
import { cn } from './cn';

// 表單欄位：字級 16px（手機輸入時不會被 iOS 自動放大），高度至少 44px

const inputBase =
  'w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ' +
  'disabled:bg-slate-50 disabled:text-slate-500';

export function FieldLabel({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex items-baseline justify-between gap-2 text-sm font-semibold text-slate-700">
      <span>{children}</span>
      {hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}
    </label>
  );
}

interface WithLabel {
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
}

export function TextField({ label, hint, className, ...rest }: WithLabel & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      {label && <FieldLabel htmlFor={id} hint={hint}>{label}</FieldLabel>}
      <input id={id} className={inputBase} {...rest} />
    </div>
  );
}

export function TextArea({ label, hint, className, ...rest }: WithLabel & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className={className}>
      {label && <FieldLabel htmlFor={id} hint={hint}>{label}</FieldLabel>}
      <textarea id={id} rows={3} className={cn(inputBase, 'py-2 leading-relaxed')} {...rest} />
    </div>
  );
}

export function NumberField({
  label,
  hint,
  className,
  value,
  onValueChange,
  ...rest
}: WithLabel & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | undefined;
  onValueChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className={className}>
      {label && <FieldLabel htmlFor={id} hint={hint}>{label}</FieldLabel>}
      <input
        id={id}
        type="number"
        inputMode="numeric"
        className={inputBase}
        value={value ?? ''}
        onChange={(e) => onValueChange(e.target.value === '' ? 0 : Number(e.target.value))}
        {...rest}
      />
    </div>
  );
}

export function SelectField({ label, hint, className, children, ...rest }: WithLabel & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={className}>
      {label && <FieldLabel htmlFor={id} hint={hint}>{label}</FieldLabel>}
      <select id={id} className={cn(inputBase, 'pr-8')} {...rest}>
        {children}
      </select>
    </div>
  );
}

/** 時間下拉選單（07:00–17:00，每 10 分鐘），值為分鐘數 */
export function TimeSelect({
  label,
  hint,
  className,
  value,
  onValueChange,
  step,
  disabled,
}: WithLabel & { value: number; onValueChange: (min: number) => void; step?: number; disabled?: boolean }) {
  const options = timeOptions(step);
  const hasValue = options.some((o) => o.value === value);
  return (
    <SelectField label={label} hint={hint} className={className} value={value} disabled={disabled}
      onChange={(e) => onValueChange(Number(e.target.value))}>
      {!hasValue && <option value={value}>{`${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </SelectField>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 cursor-pointer select-none">
      <span className="flex-1">
        <span className="block text-sm font-semibold text-slate-700">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className="relative h-7 w-12 rounded-full bg-slate-300 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}
