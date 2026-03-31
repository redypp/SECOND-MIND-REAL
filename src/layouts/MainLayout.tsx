import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import LifePage from '@/pages/LifePage';
import ArchivePage from '@/pages/ArchivePage';
import SpaceDetail from '@/pages/SpaceDetail';
import ClockPage from '@/pages/ClockPage';
import TodoPage from '@/pages/TodoPage';
import HabitsPage from '@/pages/HabitsPage';
import JournalPage from '@/pages/JournalPage';
import { PageIndicators } from '@/components/PageIndicators';
import { subscribeLifecycle } from '@/lib/appLifecycle';
import { useScheduledReminders } from '@/hooks/useScheduledReminders';

// Top-level routes: LIFE and ARCHIVE
const TOP_ROUTES = ['/', '/archive'];

// Sub-pages within LIFE — still exist as full embedded pages
const LIFE_ROUTES = ['/daily-plan', '/todos', '/habits', '/journal'];

// All routes that map to the main layout
const ALL_MAIN_ROUTES = ['/', '/archive', '/daily-plan', '/todos', '/habits', '/journal', '/collections'];

const EDGE_ZONE = 40;       // px from left edge to start a swipe
const SWIPE_THRESHOLD = 90; // px of drag to trigger back

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  useScheduledReminders();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const isScrollingRef = useRef(false);
  const rafRef = useRef<number>();
  const lastIndexRef = useRef(0);

  // Active life sub-page: null = show LIFE dashboard, else show embedded sub-page
  const [lifeSubPage, setLifeSubPage] = useState<string | null>(null);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Active archive sub-page: null = show archive list, else spaceId
  const [archiveSubPage, setArchiveSubPage] = useState<string | null>(null);
  const [isAnimatingOutArchive, setIsAnimatingOutArchive] = useState(false);
  const archiveSwipeTouchId = useRef<number | null>(null);
  const archiveSwipeStartX = useRef(0);
  const archiveSwipeStartY = useRef(0);
  const [archiveSwipeDx, setArchiveSwipeDx] = useState(0);
  const isArchiveSwiping = useRef(false);

  // Edge-swipe state (life sub-pages)
  const swipeTouchId = useRef<number | null>(null);
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const [swipeDx, setSwipeDx] = useState(0);
  const isSwiping = useRef(false);

  const getTopIndex = useCallback((path: string): number => {
    if (path === '/archive' || path === '/collections') return 1;
    return 0; // LIFE (includes all sub-pages)
  }, []);

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (sessionStorage.getItem('layout_visited')) {
      return getTopIndex(location.pathname);
    }
    return 0;
  });

  // Handle navigating to a LIFE sub-section
  const handleLifeSection = useCallback((path: string) => {
    setLifeSubPage(path);
    window.history.replaceState(null, '', path);
  }, []);

  // Handle back from sub-page to LIFE dashboard
  const handleBackToLife = useCallback(() => {
    // Animate sub-page off-screen to the right
    isSwiping.current = false;
    swipeTouchId.current = null;
    setIsAnimatingOut(true);
    setSwipeDx(window.innerWidth);

    // After the CSS transition completes, clear state
    setTimeout(() => {
      setLifeSubPage(null);
      setIsAnimatingOut(false);
      setSwipeDx(0);
      window.history.replaceState(null, '', '/');
    }, 350);
  }, []);

  // Handle navigating into an archive space
  const handleNavigateToSpace = useCallback((spaceId: string) => {
    setArchiveSubPage(spaceId);
    // Do NOT call window.history.replaceState here — React Router v7 intercepts
    // replaceState and treats /space/:id as an overlay route, hiding MainLayout.
  }, []);

  // Handle back from space detail to archive list
  const handleBackToArchive = useCallback(() => {
    isArchiveSwiping.current = false;
    archiveSwipeTouchId.current = null;
    setIsAnimatingOutArchive(true);
    setArchiveSwipeDx(window.innerWidth);
    setTimeout(() => {
      setArchiveSubPage(null);
      setIsAnimatingOutArchive(false);
      setArchiveSwipeDx(0);
    }, 350);
  }, []);

  // Edge-swipe handlers for ARCHIVE sub-pages
  const onArchiveSubPageTouchStart = useCallback((e: React.TouchEvent) => {
    if (!archiveSubPage) return;
    const touch = e.changedTouches[0];
    if (touch.clientX > EDGE_ZONE) return;
    archiveSwipeTouchId.current = touch.identifier;
    archiveSwipeStartX.current = touch.clientX;
    archiveSwipeStartY.current = touch.clientY;
    isArchiveSwiping.current = false;
  }, [archiveSubPage]);

  const onArchiveSubPageTouchMove = useCallback((e: React.TouchEvent) => {
    if (archiveSwipeTouchId.current === null) return;
    const touch = Array.from(e.changedTouches).find(t => t.identifier === archiveSwipeTouchId.current);
    if (!touch) return;
    const dx = touch.clientX - archiveSwipeStartX.current;
    const dy = Math.abs(touch.clientY - archiveSwipeStartY.current);
    if (!isArchiveSwiping.current && dy > 10 && dy > dx) {
      archiveSwipeTouchId.current = null;
      setArchiveSwipeDx(0);
      return;
    }
    if (dx > 8) {
      isArchiveSwiping.current = true;
      setArchiveSwipeDx(Math.min(dx, window.innerWidth));
    }
  }, []);

  const onArchiveSubPageTouchEnd = useCallback(() => {
    if (!isArchiveSwiping.current) {
      archiveSwipeTouchId.current = null;
      return;
    }
    if (archiveSwipeDx >= SWIPE_THRESHOLD) {
      handleBackToArchive();
    } else {
      setArchiveSwipeDx(0);
      isArchiveSwiping.current = false;
      archiveSwipeTouchId.current = null;
    }
  }, [archiveSwipeDx, handleBackToArchive]);

  // Edge-swipe handlers for LIFE sub-pages
  const onSubPageTouchStart = useCallback((e: React.TouchEvent) => {
    if (!lifeSubPage) return;
    const touch = e.changedTouches[0];
    if (touch.clientX > EDGE_ZONE) return; // only from left edge
    swipeTouchId.current = touch.identifier;
    swipeStartX.current = touch.clientX;
    swipeStartY.current = touch.clientY;
    isSwiping.current = false;
  }, [lifeSubPage]);

  const onSubPageTouchMove = useCallback((e: React.TouchEvent) => {
    if (swipeTouchId.current === null) return;
    const touch = Array.from(e.changedTouches).find(t => t.identifier === swipeTouchId.current);
    if (!touch) return;

    const dx = touch.clientX - swipeStartX.current;
    const dy = Math.abs(touch.clientY - swipeStartY.current);

    // Cancel if scrolling vertically
    if (!isSwiping.current && dy > 10 && dy > dx) {
      swipeTouchId.current = null;
      setSwipeDx(0);
      return;
    }

    if (dx > 8) {
      isSwiping.current = true;
      setSwipeDx(Math.min(dx, window.innerWidth));
    }
  }, []);

  const onSubPageTouchEnd = useCallback(() => {
    if (!isSwiping.current) {
      swipeTouchId.current = null;
      return;
    }
    if (swipeDx >= SWIPE_THRESHOLD) {
      handleBackToLife();
    } else {
      setSwipeDx(0);
      isSwiping.current = false;
      swipeTouchId.current = null;
    }
  }, [swipeDx, handleBackToLife]);

  // Sync scroll position when route changes externally
  useEffect(() => {
    if (!hasInitialized.current) return;
    const path = location.pathname;

    // Coming back from a collection detail (space/:id) → snap to ARCHIVE
    if (path.startsWith('/space/') || path.startsWith('/item/')) return;

    // LIFE sub-pages
    if (LIFE_ROUTES.includes(path)) {
      setCurrentIndex(0);
      setLifeSubPage(path);
      if (containerRef.current) {
        containerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      }
      return;
    }

    // Navigating to root `/` — always clear sub-page
    if (path === '/') {
      setLifeSubPage(null);
    }

    // Navigating back to archive root — clear any stale archive sub-page state
    if (path === '/archive' || path === '/collections') {
      setArchiveSubPage(null);
      setIsAnimatingOutArchive(false);
      setArchiveSwipeDx(0);
    }

    const newIndex = getTopIndex(path);
    if (newIndex !== currentIndex && !isScrollingRef.current) {
      setCurrentIndex(newIndex);
      lastIndexRef.current = newIndex;
      if (containerRef.current) {
        containerRef.current.scrollTo({
          left: newIndex * window.innerWidth,
          behavior: 'smooth',
        });
      }
    }
    // Even if index didn't change, ensure scroll position is correct (e.g., coming back from sub-page)
    if (newIndex === currentIndex && containerRef.current) {
      const targetLeft = newIndex * window.innerWidth;
      if (Math.abs(containerRef.current.scrollLeft - targetLeft) > 2) {
        containerRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' });
      }
    }
  }, [location.pathname]);

  // Scroll handler
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    isScrollingRef.current = true;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      if (!containerRef.current) {
        isScrollingRef.current = false;
        return;
      }
      const scrollLeft = containerRef.current.scrollLeft;
      const pageWidth = window.innerWidth;
      const newIndex = Math.round(scrollLeft / pageWidth);

      if (newIndex >= 0 && newIndex < TOP_ROUTES.length && newIndex !== lastIndexRef.current) {
        lastIndexRef.current = newIndex;
        setCurrentIndex(newIndex);
        // When swiping to LIFE, clear sub-page
        if (newIndex === 0) {
          setLifeSubPage(null);
          window.history.replaceState(null, '', '/');
        } else {
          window.history.replaceState(null, '', TOP_ROUTES[newIndex]);
        }
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    });

    clearTimeout((handleScroll as any).timeout);
    (handleScroll as any).timeout = setTimeout(() => {
      isScrollingRef.current = false;
    }, 150);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout((handleScroll as any).timeout);
    };
  }, [handleScroll]);

  // Initialize
  useEffect(() => {
    hasInitialized.current = true;
    const alreadyVisited = sessionStorage.getItem('layout_visited');
    let targetIndex = 0;
    let subPage: string | null = null;

    if (alreadyVisited) {
      const path = location.pathname;
      if (LIFE_ROUTES.includes(path)) {
        subPage = path;
        targetIndex = 0;
      } else if (path === '/archive' || path === '/collections') {
        targetIndex = 1;
      }
    } else {
      sessionStorage.setItem('layout_visited', '1');
      navigate('/', { replace: true });
    }

    setLifeSubPage(subPage);
    if (containerRef.current) {
      containerRef.current.scrollLeft = targetIndex * window.innerWidth;
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollLeft = targetIndex * window.innerWidth;
        }
      });
    }
    setCurrentIndex(targetIndex);
    lastIndexRef.current = targetIndex;
  }, []);

  // Return to LIFE on foreground resume after 10s
  useEffect(() => {
    const unsubscribe = subscribeLifecycle((event) => {
      if (event.type === 'foreground' && event.wasBackground && event.backgroundDuration > 10_000) {
        setCurrentIndex(0);
        setLifeSubPage(null);
        lastIndexRef.current = 0;
        window.history.replaceState(null, '', '/');
        if (containerRef.current) containerRef.current.scrollLeft = 0;
      }
    });
    return unsubscribe;
  }, []);

  // Re-snap scroll position when returning from an external link (short absence)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // Re-snap the scroll container to the current index to fix glitched layout
      requestAnimationFrame(() => {
        if (containerRef.current) {
          const targetLeft = lastIndexRef.current * window.innerWidth;
          const currentLeft = containerRef.current.scrollLeft;
          // Only snap if noticeably off position (> 2px drift)
          if (Math.abs(currentLeft - targetLeft) > 2) {
            containerRef.current.scrollLeft = targetLeft;
          }
        }
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const handlePageSelect = useCallback((index: number) => {
    setCurrentIndex(index);
    lastIndexRef.current = index;
    if (index === 0) {
      setLifeSubPage(null);
      window.history.replaceState(null, '', '/');
    } else {
      navigate(TOP_ROUTES[index], { replace: true });
    }
    if (containerRef.current) {
      containerRef.current.scrollTo({
        left: index * window.innerWidth,
        behavior: 'smooth',
      });
    }
  }, [navigate]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-background safe-area-top-ios" style={{ overscrollBehavior: 'none' }}>
      {/* Swipeable pages container — locked when a sub-page is open to prevent Archive bleed */}
      <div
        ref={containerRef}
        className={`flex h-full overflow-y-hidden snap-x snap-mandatory scrollbar-hide bg-background ${(lifeSubPage || archiveSubPage) ? 'overflow-x-hidden' : 'overflow-x-scroll'}`}
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'none' }}
      >
        {/* Page 1: LIFE */}
        <div className="min-w-full h-full snap-start snap-always flex-shrink-0 overflow-hidden relative bg-background">
          {/* LIFE dashboard — always rendered underneath; parallax tracks swipeDx during back-swipe */}
          <div
            className="absolute inset-0"
            style={{
              transform: (() => {
                if (!lifeSubPage) return 'translateX(0)';
                if (isSwiping.current && swipeDx > 0) {
                  // Proportional parallax: LifePage slides right at 30% of swipe speed
                  const offset = -window.innerWidth * 0.3 + swipeDx * 0.3;
                  return `translateX(${offset}px)`;
                }
                if (isAnimatingOut) return 'translateX(0)';
                return 'translateX(-30%)';
              })(),
              transition: isSwiping.current ? 'none' : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: (lifeSubPage && !isAnimatingOut) ? 'none' : 'auto',
            }}
          >
            <LifePage embedded onNavigateToSection={handleLifeSection} />
          </div>

          {/* LIFE sub-page — slides in from right, swipeable back from left edge */}
          <div
            className="absolute inset-0"
            style={{
              transform: lifeSubPage
                ? `translateX(${swipeDx}px)`
                : 'translateX(100%)',
              transition: (isSwiping.current && !isAnimatingOut) ? 'none' : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: (lifeSubPage && !isAnimatingOut) ? 'auto' : 'none',
            }}
            onTouchStart={onSubPageTouchStart}
            onTouchMove={onSubPageTouchMove}
            onTouchEnd={onSubPageTouchEnd}
            onTouchCancel={onSubPageTouchEnd}
          >
            {lifeSubPage === '/daily-plan' && <ClockPage embedded onBack={handleBackToLife} />}
            {lifeSubPage === '/todos' && <TodoPage embedded onBack={handleBackToLife} />}
            {lifeSubPage === '/habits' && <HabitsPage embedded onBack={handleBackToLife} />}
            {lifeSubPage === '/journal' && <JournalPage embedded onBack={handleBackToLife} />}
          </div>
        </div>

        {/* Page 2: ARCHIVE */}
        <div className="min-w-full h-full snap-start snap-always flex-shrink-0 overflow-hidden w-full relative bg-background"
          style={{ overscrollBehavior: 'none' }}
        >
          {/* Archive list — parallax shifts left during sub-page back-swipe */}
          <div
            className="absolute inset-0"
            style={{
              transform: (() => {
                if (!archiveSubPage) return 'translateX(0)';
                if (isArchiveSwiping.current && archiveSwipeDx > 0) {
                  const offset = -window.innerWidth * 0.3 + archiveSwipeDx * 0.3;
                  return `translateX(${offset}px)`;
                }
                if (isAnimatingOutArchive) return 'translateX(0)';
                return 'translateX(-30%)';
              })(),
              transition: isArchiveSwiping.current ? 'none' : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: (archiveSubPage && !isAnimatingOutArchive) ? 'none' : 'auto',
            }}
          >
            <ArchivePage embedded onNavigateToSpace={handleNavigateToSpace} />
          </div>

          {/* Space detail — slides in from right */}
          <div
            className="absolute inset-0"
            style={{
              transform: archiveSubPage
                ? `translateX(${archiveSwipeDx}px)`
                : 'translateX(100%)',
              transition: (isArchiveSwiping.current && !isAnimatingOutArchive) ? 'none' : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: (archiveSubPage && !isAnimatingOutArchive) ? 'auto' : 'none',
            }}
            onTouchStart={onArchiveSubPageTouchStart}
            onTouchMove={onArchiveSubPageTouchMove}
            onTouchEnd={onArchiveSubPageTouchEnd}
            onTouchCancel={onArchiveSubPageTouchEnd}
          >
            {archiveSubPage && (
              <SpaceDetail embedded spaceId={archiveSubPage} onBack={handleBackToArchive} />
            )}
          </div>
        </div>
      </div>

      {/* Page indicators — hidden when inside a sub-page */}
      {!lifeSubPage && !archiveSubPage && (
        <PageIndicators
          currentIndex={currentIndex}
          totalPages={2}
          onPageSelect={handlePageSelect}
        />
      )}
    </div>
  );
}
