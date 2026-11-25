import {
    useCallback,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from 'react';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import FloatingPanel from './FloatingPanel';

export interface SelectOption<T extends string = string> {
    value: T;
    label: string;
    badge?: string;
    style?: CSSProperties;
}

interface CustomSelectProps<T extends string = string> {
    value: T;
    options: SelectOption<T>[];
    onChange: (value: T) => void;
    icon?: ReactNode;
    ariaLabel?: string;
    title?: string;
    size?: 'sm' | 'md';
    placement?: 'top' | 'bottom';
    className?: string;
    panelClassName?: string;
    disabled?: boolean;
}

/** Custom accessible dropdown selector with Notion-like smooth open/close
    motion — replaces all native OS <select> controls across main & tray. */
export default function CustomSelect<T extends string = string>({
    value,
    options,
    onChange,
    icon,
    ariaLabel,
    title,
    size = 'md',
    placement = 'bottom',
    className = '',
    panelClassName = '',
    disabled = false,
}: CustomSelectProps<T>) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement | null>(null);

    const selected = options.find((o) => o.value === value) ?? options[0];

    const close = useCallback(() => setOpen(false), []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const idx = options.findIndex((o) => o.value === value);
            if (idx === -1 || options.length === 0) return;
            const delta = e.key === 'ArrowDown' ? 1 : -1;
            const next =
                options[(idx + delta + options.length) % options.length];
            if (next) onChange(next.value);
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
        }
    };

    const heightCls =
        size === 'sm'
            ? 'h-7 rounded-lg px-2 text-[length:var(--dnss-fs-2xs)]'
            : 'h-9 rounded-xl px-3 text-[length:var(--dnss-fs-xs)]';

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-label={ariaLabel}
                aria-expanded={open}
                aria-haspopup="listbox"
                title={title ?? selected?.label}
                disabled={disabled}
                onClick={() => setOpen((v) => !v)}
                onKeyDown={handleKeyDown}
                className={`dnss-input inline-flex items-center justify-between gap-1.5 font-medium text-[var(--dnss-ink-1)] hover:border-[var(--dnss-border-strong)] hover:bg-[var(--dnss-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${heightCls} ${className}`}
            >
                <span className="flex min-w-0 items-center gap-1.5">
                    {icon && (
                        <span className="shrink-0 text-[var(--dnss-ink-3)]">
                            {icon}
                        </span>
                    )}
                    <span className="truncate" style={selected?.style}>
                        {selected?.label ?? ''}
                    </span>
                </span>
                <ChevronDownIcon
                    className={`size-3.5 shrink-0 text-[var(--dnss-ink-3)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        open ? 'rotate-180 text-[var(--dnss-accent)]' : ''
                    }`}
                />
            </button>

            <FloatingPanel
                anchor={triggerRef.current}
                open={open}
                onClose={close}
                placement={placement}
                matchAnchorWidth
                className={`dnss-popover max-h-56 overflow-y-auto rounded-xl p-1 ${panelClassName}`}
            >
                <div role="listbox" className="flex flex-col gap-0.5">
                    {options.map((option) => {
                        const isSelected = option.value === value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                    onChange(option.value);
                                    setOpen(false);
                                }}
                                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start transition-colors ${
                                    size === 'sm'
                                        ? 'text-[length:var(--dnss-fs-2xs)]'
                                        : 'text-[length:var(--dnss-fs-sm)]'
                                } ${
                                    isSelected
                                        ? 'bg-[var(--dnss-accent-soft)] font-semibold text-[var(--dnss-ink-1)]'
                                        : 'text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]'
                                }`}
                            >
                                <CheckIcon
                                    className={`size-3.5 shrink-0 transition-opacity ${
                                        isSelected
                                            ? 'text-[var(--dnss-accent)] opacity-100'
                                            : 'opacity-0'
                                    }`}
                                />
                                <span
                                    className="min-w-0 flex-1 truncate"
                                    style={option.style}
                                >
                                    {option.label}
                                </span>
                                {option.badge && (
                                    <span className="shrink-0 rounded-md border border-[var(--dnss-accent)]/30 bg-[var(--dnss-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--dnss-accent-text)]">
                                        {option.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </FloatingPanel>
        </>
    );
}
