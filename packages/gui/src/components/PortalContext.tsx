import { createContext, useContext } from 'react';

/**
 * Optional portal mount target.
 * - `null` (standalone desktop app): modals and floating panels portal into
 *   `document.body` using `fixed` viewport positioning.
 * - `HTMLElement` (embedded live demo on the landing page): modals and
 *   floating panels portal into the demo container using `absolute`
 *   positioning so they stay strictly scoped inside the demo frame.
 */
export const PortalContext = createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement | null {
    return useContext(PortalContext);
}
