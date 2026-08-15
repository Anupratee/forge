import { useEffect } from 'react';
import { useAuth } from './useAuth';

/**
 * The CSS custom properties a cosmetic overrides.
 *
 * These are declared in `index.css` under `@theme`, which is why a cosmetic can repaint the app without
 * a release: the palette is data, and this only writes it onto `:root`.
 */
const THEME_VARIABLES = {
  primary: '--color-forge-600',
  accent: '--color-forge-400',
  surface: '--color-forge-700',
} as const;

/**
 * Applies the equipped cosmetic's palette, or restores the default when nothing is worn.
 *
 * The theme travels with the session — `PublicUser.equippedTheme` is resolved server-side — so it is
 * applied on the first paint rather than after a second request, and there is no flash of the default
 * palette in between.
 *
 * Mounted once, at the layout. Every override is removed before the new one is written, so unequipping
 * genuinely restores the stylesheet's values rather than leaving the last cosmetic's colours behind.
 */
export function useTheme(): void {
  const { user } = useAuth();
  const theme = user?.equippedTheme ?? null;

  useEffect(() => {
    const root = document.documentElement;

    for (const variable of Object.values(THEME_VARIABLES)) {
      root.style.removeProperty(variable);
    }

    if (theme === null) return;

    for (const [slot, variable] of Object.entries(THEME_VARIABLES)) {
      root.style.setProperty(variable, theme[slot as keyof typeof THEME_VARIABLES]);
    }

    // Cleanup matters on sign-out: the layout unmounts, and without this the previous account's
    // cosmetic would still be painted on the login screen.
    return () => {
      for (const variable of Object.values(THEME_VARIABLES)) {
        root.style.removeProperty(variable);
      }
    };
  }, [theme]);
}
