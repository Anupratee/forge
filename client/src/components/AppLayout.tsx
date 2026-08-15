import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';

/**
 * The frame every signed-in screen renders inside.
 *
 * A layout route rather than a wrapper each page imports, so pages stay purely about their own content
 * and none of them can forget the navigation.
 */
export function AppLayout() {
  return (
    <div className="min-h-dvh">
      <Navbar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
