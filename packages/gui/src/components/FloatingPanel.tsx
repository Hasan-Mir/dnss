import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { usePortalContainer } from './PortalContext';

const GAP = 6;
const EDGE = 8;
const EXIT_MS = 135;

interface Position {
    top: number;
    left: number;
    minWidth?: number;
    maxWidth: number;
    transformOrigin: string;
}

function computePosition(
    anchor: HTMLElement,
    panel: HTMLElement,
    placement: 'top' | 'bottom',
    matchAnchorWidth: boolean,
    container: HTMLElement | null
): Position | null {
    const rawAnchor = anchor.getBoundingClientRect();
    const cRect = container ? container.getBoundingClientRect() : null;
    const scaleX =
        container && container.clientWidth > 0 && cRect && cRect.width > 0
            ? cRect.width / container.clientWidth
            : 1;
    const scaleY =
        container && container.clientHeight > 0 && cRect && cRect.height > 0
            ? cRect.height / container.clientHeight
            : 1;
    const safeScaleX = scaleX > 0.05 ? scaleX : 1;
    const safeScaleY = scaleY > 0.05 ? scaleY : 1;
    const a = cRect
        ? {
              top: (rawAnchor.top - cRect.top) / safeScaleY,
              bottom: (rawAnchor.bottom - cRect.top) / safeScaleY,
              left: (rawAnchor.left - cRect.left) / safeScaleX,
              right: (rawAnchor.right - cRect.left) / safeScaleX,
              width: rawAnchor.width / safeScaleX,
          }
        : rawAnchor;
    const vw = container ? container.clientWidth : window.innerWidth;
    const vh = container ? container.clientHeight : window.innerHeight;
    const maxWidth = Math.max(0, vw - EDGE * 2);
    const rawWidth = matchAnchorWidth
        ? Math.max(a.width, panel.offsetWidth)
        : panel.offsetWidth;
    const pWidth = Math.min(rawWidth, maxWidth);
    const pHeight = panel.offsetHeight;
    if (pWidth === 0 || pHeight === 0) return null;

    const dirAttr = container?.dir || document.documentElement.dir;
    const rtl = dirAttr === 'rtl';

    const fitsAbove = a.top - EDGE >= pHeight;
    const fitsBelow = vh - EDGE - a.bottom >= pHeight;
    let top: number;
    if (placement === 'top') {
        top = fitsAbove || !fitsBelow ? a.top - GAP - pHeight : a.bottom + GAP;
    } else {
        top = fitsBelow || !fitsAbove ? a.bottom + GAP : a.top - GAP - pHeight;
    }
    top = Math.max(EDGE, Math.min(top, vh - EDGE - pHeight));

    let left: number;
    if (matchAnchorWidth) {
        left = a.left;
    } else {
        left = rtl ? a.left : a.right - pWidth;
    }
    left = Math.max(EDGE, Math.min(left, vw - EDGE - pWidth));

    const originY = top >= a.top ? 'top' : 'bottom';
    const originX = matchAnchorWidth ? 'center' : rtl ? 'left' : 'right';
    return {
        top,
        left,
        minWidth: matchAnchorWidth ? Math.min(a.width, maxWidth) : undefined,
        maxWidth,
        transformOrigin: `${originY} ${originX}`,
    };
}

interface FloatingPanelProps {
    anchor: HTMLElement | null;
    /** Controls visibility with smooth Notion-style exit transition. Defaults to true when mounted. */
    open?: boolean;
    onClose: () => void;
    placement?: 'top' | 'bottom';
    /** Match the panel's minimum width to the trigger element (ideal for CustomSelect). */
    matchAnchorWidth?: boolean;
    className?: string;
    children: ReactNode;
}

/** Portal-rendered floating panel with viewport-aware placement and smooth
    Notion-style enter & exit transitions. */
export default function FloatingPanel({
    anchor,
    open = true,
    onClose,
    placement = 'bottom',
    matchAnchorWidth = false,
    className = '',
    children,
}: FloatingPanelProps) {
    const portalContainer = usePortalContainer();
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [mounted, setMounted] = useState(open && Boolean(anchor));
    const [closing, setClosing] = useState(false);
    const [pos, setPos] = useState<Position | null>(null);
    const lastAnchorRef = useRef<HTMLElement | null>(anchor);

    if (anchor) {
        lastAnchorRef.current = anchor;
    }

    useEffect(() => {
        if (open && anchor) {
            setMounted(true);
            setClosing(false);
            return;
        }
        if (mounted) {
            setClosing(true);
            const timer = window.setTimeout(() => {
                setMounted(false);
                setClosing(false);
            }, EXIT_MS);
            return () => window.clearTimeout(timer);
        }
    }, [open, anchor, mounted]);

    const effectiveAnchor = anchor ?? lastAnchorRef.current;

    const update = useCallback(() => {
        const panel = panelRef.current;
        if (!effectiveAnchor || !panel) return;
        const next = computePosition(
            effectiveAnchor,
            panel,
            placement,
            matchAnchorWidth,
            portalContainer
        );
        if (!next) return;
        setPos((prev) =>
            prev &&
            prev.top === next.top &&
            prev.left === next.left &&
            prev.minWidth === next.minWidth &&
            prev.maxWidth === next.maxWidth &&
            prev.transformOrigin === next.transformOrigin
                ? prev
                : next
        );
    }, [effectiveAnchor, placement, matchAnchorWidth, portalContainer]);

    useLayoutEffect(() => {
        if (!mounted) return;
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [mounted, update]);

    useEffect(() => {
        if (!open || !mounted) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, mounted, onClose]);

    if (!mounted || !effectiveAnchor) return null;

    const posClass = portalContainer ? 'absolute' : 'fixed';

    return createPortal(
        <>
            <div
                className={`${posClass} inset-0 z-40 ${closing ? 'pointer-events-none' : ''}`}
                onClick={onClose}
            />
            <div
                ref={panelRef}
                className={`${closing ? 'panel-exit' : 'panel-enter'} ${posClass} z-50 ${className}`}
                style={
                    pos
                        ? {
                              top: pos.top,
                              left: pos.left,
                              minWidth: pos.minWidth,
                              maxWidth: pos.maxWidth,
                              transformOrigin: pos.transformOrigin,
                          }
                        : {
                              visibility: 'hidden',
                              maxWidth: portalContainer
                                  ? `calc(100% - ${EDGE * 2}px)`
                                  : `calc(100vw - ${EDGE * 2}px)`,
                          }
                }
            >
                {children}
            </div>
        </>,
        portalContainer ?? document.body
    );
}
