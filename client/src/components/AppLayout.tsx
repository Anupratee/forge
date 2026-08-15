import { Outlet } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { Navbar } from './Navbar';

/**
 * The frame every signed-in screen renders inside.
 *
 * A layout route rather than a wrapper each page imports, so pages stay purely about their own content
 * and none of them can forget the navigation.
 *
 * Mounting `useTheme` here is what makes an equipped cosmetic repaint the whole application: the
 * palette is written onto `:root`, and every component already reads its colours through those
 * variables rather than hard-coding them.
 */
export function AppLayout() {
  useTheme();

  return (
    <div className="min-h-dvh">
      <Navbar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
