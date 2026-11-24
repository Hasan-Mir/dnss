import { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import appIcon from '../assets/app-icon.png';

interface TitleBarProps {
    title: string;
    minimizeLabel: string;
    maximizeLabel: string;
    restoreLabel: string;
    closeLabel: string;
}

/** Custom frameless desktop window title bar with drag region and
    Windows-style minimize, maximize/restore, and close controls. */
export default function TitleBar({
    title,
    minimizeLabel,
    maximizeLabel,
    restoreLabel,
    closeLabel,
}: TitleBarProps) {
    const [maximized, setMaximized] = useState(false);

    useEffect(() => {
        const win = getCurrentWindow();
        let disposed = false;
        let unlisten: (() => void) | null = null;

        void win
            .isMaximized()
            .then((val) => {
                if (!disposed) setMaximized(val);
            })
            .catch(() => {});

        void win
            .onResized(() => {
                void win
                    .isMaximized()
                    .then((val) => {
                        if (!disposed) setMaximized(val);
                    })
                    .catch(() => {});
            })
            .then((fn) => {
                if (disposed) fn();
                else unlisten = fn;
            })
            .catch(() => {});

        return () => {
            disposed = true;
            unlisten?.();
        };
    }, []);

    const handleMinimize = useCallback(() => {
        void getCurrentWindow()
            .minimize()
            .catch(() => {});
    }, []);

    const handleToggleMaximize = useCallback(() => {
        void getCurrentWindow()
            .toggleMaximize()
            .then(() => getCurrentWindow().isMaximized())
            .then((val) => setMaximized(val))
            .catch(() => {});
    }, []);

    const handleClose = useCallback(() => {
        // lib.rs intercepts CloseRequested on "main" and hides to system tray.
        void getCurrentWindow()
            .close()
            .catch(() => {});
    }, []);

    return (
        <header
            data-tauri-drag-region
            className="flex h-9 w-full shrink-0 select-none items-center justify-between border-b border-[var(--dnss-border)] bg-[var(--dnss-sidebar)] ps-3 pe-1.5"
        >
            {/* Left: App Icon + Window Title (draggable) */}
            <div
                data-tauri-drag-region
                className="flex min-w-0 flex-1 items-center gap-2"
            >
                <img
                    src={appIcon}
                    alt="DNSS"
                    className="pointer-events-none size-4 shrink-0 select-none"
                    draggable={false}
                />
                <span
                    data-tauri-drag-region
                    className="truncate text-[12px] font-medium text-[var(--dnss-ink-2)]"
                >
                    {title}
                </span>
            </div>

            {/* Right: Custom Window Controls (always LTR order: min, max, close) */}
            <div dir="ltr" className="flex shrink-0 items-center gap-0.5">
                <button
                    type="button"
                    aria-label={minimizeLabel}
                    title={minimizeLabel}
                    onClick={handleMinimize}
                    className="dnss-no-press grid size-7 place-items-center rounded-md text-[var(--dnss-ink-2)] transition-colors hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)] active:scale-95"
                >
                    <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            d="M1.5 5H8.5"
                            stroke="currentColor"
                            strokeWidth="1.25"
                            strokeLinecap="round"
                        />
                    </svg>
                </button>

                <button
                    type="button"
                    aria-label={maximized ? restoreLabel : maximizeLabel}
                    title={maximized ? restoreLabel : maximizeLabel}
                    onClick={handleToggleMaximize}
                    className="dnss-no-press grid size-7 place-items-center rounded-md text-[var(--dnss-ink-2)] transition-colors hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)] active:scale-95"
                >
                    {maximized ? (
                        <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                            aria-hidden="true"
                        >
                            <rect
                                x="1.5"
                                y="3"
                                width="5.5"
                                height="5.5"
                                rx="1"
                                stroke="currentColor"
                                strokeWidth="1.15"
                            />
                            <path
                                d="M3.2 3V2.2C3.2 1.81 3.51 1.5 3.9 1.5H7.8C8.19 1.5 8.5 1.81 8.5 2.2V6.1C8.5 6.49 8.19 6.8 7.8 6.8H7"
                                stroke="currentColor"
                                strokeWidth="1.15"
                                strokeLinecap="round"
                            />
                        </svg>
                    ) : (
                        <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                            aria-hidden="true"
                        >
                            <rect
                                x="1.75"
                                y="1.75"
                                width="6.5"
                                height="6.5"
                                rx="1.1"
                                stroke="currentColor"
                                strokeWidth="1.2"
                            />
                        </svg>
                    )}
                </button>

                <button
                    type="button"
                    aria-label={closeLabel}
                    title={closeLabel}
                    onClick={handleClose}
                    className="dnss-no-press grid size-7 place-items-center rounded-md text-[var(--dnss-ink-2)] transition-colors hover:bg-[var(--dnss-error)] hover:text-white active:scale-95"
                >
                    <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            d="M2 2L8 8M8 2L2 8"
                            stroke="currentColor"
                            strokeWidth="1.25"
                            strokeLinecap="round"
                        />
                    </svg>
                </button>
            </div>
        </header>
    );
}
