import { Outlet, useLocation } from 'react-router-dom';
import MainLayout from './MainLayout';
import { BackToHome } from '@/components/BackToHome';

/**
 * Keeps MainLayout always mounted so Home state is preserved
 * when navigating to detail pages (space, item, search, etc.).
 * Detail pages render on top via Outlet.
 */
export default function MainLayoutWrapper() {
  const location = useLocation();

  // Detail pages that render on top of MainLayout
  const isOverlay = location.pathname === '/' ||
    location.pathname.startsWith('/space/') ||
    location.pathname.startsWith('/item/') ||
    location.pathname === '/search' ||
    location.pathname === '/settings' ||
    location.pathname === '/chamber' ||
    location.pathname === '/notifications' ||
    location.pathname === '/ask' ||
    location.pathname === '/people' ||
    location.pathname === '/self';

  return (
    <>
      {/* MainLayout always mounted — hidden behind overlays */}
      <div style={{ display: isOverlay ? 'none' : undefined }}>
        <MainLayout />
      </div>
      {/* Detail pages render here */}
      {isOverlay && <Outlet />}
      {/* Small fixed top-left arrow that returns to "/". Self-hides on routes
          that already render their own back button. */}
      <BackToHome />
    </>
  );
}
