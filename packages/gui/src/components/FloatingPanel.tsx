import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/** Gap between the trigger and the panel, and the minimum distance the
    panel keeps from the window edges. */
const GAP = 6;
const EDGE = 8;

interface Position {
    top: number;
    left: number;
    transformOrigin: string;
}

/** Resolve the panel's fixed position against its trigger: `placement` is
    only a preference — the panel flips to the other side when the window
    has no room, is clamped inside the window, and hugs the trigger's
    inline-end edge (the reading edge, so it mirrors under RTL). */
function computePosition(
    anchor: HTMLElement,
    panel: HTMLElement,
    placement: 'top' | 'bottom'
): Position | null {
    const a = anchor.getBoundingClientRect();
    // Layout size instead of getBoundingClientRect: the pop-in animation
    // starts at scale(0.96), and a transformed rect would place the panel
    // for a shrunken size that then grows past the trigger's edge.
    const p = { width: panel.offsetWidth, height: panel.offsetHeight };
    if (p.width === 0 || p.height === 0) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rtl = document.documentElement.dir === 'rtl';

    const fitsAbove = a.top - EDGE >= p.height;
    const fitsBelow = vh - EDGE - a.bottom >= p.height;
    let top: number;
    if (placement === 'top') {
        top = fitsAbove || !fitsBelow ? a.top - GAP - p.height : a.bottom + GAP;
    } else {
        top = fitsBelow || !fitsAbove ? a.bottom + GAP : a.top - GAP - p.height;
    }
    // Neither side fits (panel taller than the window): pin to the top edge.
    top = Math.max(EDGE, Math.min(top, vh - EDGE - p.height));

    let left = rtl ? a.left : a.right - p.width;
    left = Math.max(EDGE, Math.min(left, vw - EDGE - p.width));

    // Pop animation grows from the corner nearest the trigger.
    const originY = top >= a.top ? 'top' : 'bottom';
    const originX = rtl ? 'left' : 'right';
    return { top, left, transformOrigin: `${originY} ${originX}` };
}

interface FloatingPanelProps {
    /** Trigger element the panel anchors to. It must stay mounted while the
        panel is open (panels here only open from their own button). */
    anchor: HTMLElement | null;
    onClose: () => void;
    /** Preferred side of the trigger; flips when the window has no room. */
    placement?: 'top' | 'bottom';
    /** Size and surface classes (width, border, shadow, padding…). */
    className?: string;
    children: ReactNode;
}

/** A floating menu/confirm panel rendered in a portal, so clipping
    ancestors (accordion wrappers) can never cut it off, with viewport-aware
    placement the CSS-only dropdowns lacked. Closes on outside click and
    Escape, and follows the trigger while the page scrolls or resizes. */
export default function FloatingPanel({
    anchor,
    onClose,
    placement = 'bottom',
    className = '',
    children,
}: FloatingPanelProps) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<Position | null>(null);

    const update = useCallback(() => {
        const panel = panelRef.current;
        if (!anchor || !panel) return;
        const next = computePosition(anchor, panel, placement);
        if (!next) return;
        setPos((prev) =>
            prev &&
            prev.top === next.top &&
            prev.left === next.left &&
            prev.transformOrigin === next.transformOrigin
                ? prev
                : next
        );
    }, [anchor, placement]);

    // Measure before the first paint (a hidden element still has a rect, so
    // there is no flicker), then keep the panel glued to the trigger while
    // anything on the page scrolls or the window resizes.
    useLayoutEffect(() => {
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [update]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    if (!anchor) return null;

    return createPortal(
        <>
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <div
                ref={panelRef}
                className={`menu-pop fixed z-50 ${className}`}
                style={
                    pos
                        ? {
                              top: pos.top,
                              left: pos.left,
                              transformOrigin: pos.transformOrigin,
                          }
                        : { visibility: 'hidden' }
                }
            >
                {children}
            </div>
        </>,
        document.body
    );
}
