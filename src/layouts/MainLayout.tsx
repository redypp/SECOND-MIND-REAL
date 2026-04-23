import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import LifePage from '@/pages/LifePage';
import ArchivePage from '@/pages/ArchivePage';
import SpaceDetail from '@/pages/SpaceDetail';
import ClockPage from '@/pages/ClockPage';
import TodoPage from '@/pages/TodoPage';
import HabitsPage from '@/pages/HabitsPage';
import JournalPage from '@/pages/JournalPage';
import { subscribeLifecycle } from '@/lib/appLifecycle';
import { useScheduledReminders } from '@/hooks/useScheduledReminders';

// Top-level routes: LIFE and ARCHIVE (the hub lives at '/', outside MainLayout)
const TOP_ROUTES = ['/life', '/archive'];

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
      window.history.replaceState(null, '', '/life');
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

    // Navigating back to LIFE root — always clear sub-page
    if (path === '/life') {
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
          window.history.replaceState(null, '', '/life');
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

    // Prevent iOS Safari back/forward swipe when at scroll edges
    let touchStartX = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
    };
    const onTouchMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - touchStartX;
      const atLeft = container.scrollLeft <= 0;
      const atRight = container.scrollLeft >= container.scrollWidth - container.clientWidth - 1;
      // Block overscroll: swiping right at left edge, or swiping left at right edge
      if ((atLeft && dx > 0) || (atRight && dx < 0)) {
        e.preventDefault();
      }
    };
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
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

  // Handle app resume: reset stale touch state, re-snap scroll, return home on long absence
  useEffect(() => {
    let rafId: number | null = null;

    const handleResume = () => {
      if (document.visibilityState !== 'visible') return;

      // Clear any in-progress swipe/touch state that got stuck when backgrounded
      swipeTouchId.current = null;
      swipeStartX.current = 0;
      swipeStartY.current = 0;
      isSwiping.current = false;
      setSwipeDx(0);
      isArchiveSwiping.current = false;
      setArchiveSwipeDx(0);

      // Re-snap scroll position after a short delay to let layout settle
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(() => {
          if (containerRef.current) {
            const targetLeft = lastIndexRef.current * window.innerWidth;
            containerRef.current.scrollLeft = targetLeft;
          }
        });
      });
    };

    const unsubscribe = subscribeLifecycle((event) => {
      if (event.type === 'foreground' && event.wasBackground && event.backgroundDuration > 10_000) {
        // Long-absence resume returns the user to the home hub.
        navigate('/', { replace: true });
      }
    });

    document.addEventListener('visibilitychange', handleResume);
    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      unsubscribe();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Visibility is derived directly from the URL so navigation is reliable
  // even if currentIndex state falls out of sync with location.pathname.
  const showArchive = useMemo(() => {
    const p = location.pathname;
    return p === '/archive' || p === '/collections' || p.startsWith('/space/');
  }, [location.pathname]);

  const handlePageSelect = useCallback((index: number) => {
    setCurrentIndex(index);
    lastIndexRef.current = index;
    if (index === 0) {
      setLifeSubPage(null);
      window.history.replaceState(null, '', '/life');
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
      {/* LIFE ↔ ARCHIVE are no longer user-swipeable — the home logo is the
          single way to move between them. Pages are absolutely stacked and
          toggled via transform driven by currentIndex. */}
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden bg-background"
        style={{ overscrollBehaviorX: 'none' }}
      >
        {/* Page 1: LIFE — display toggle (not transform) so the hidden page
            doesn't create a containing block that traps position:fixed
            children (Radix dialogs, tooltips, modals). */}
        <div
          className="absolute inset-0 overflow-hidden bg-background"
          style={{ display: showArchive ? 'none' : 'block' }}
        >
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
              // When fully visible (swipeDx===0), omit the transform entirely so that
              // position:fixed children (modals, overlays) are not trapped in a new
              // stacking context and can correctly cover the viewport.
              transform: lifeSubPage
                ? swipeDx > 0 ? `translateX(${swipeDx}px)` : undefined
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

        {/* Page 2: ARCHIVE — display toggle (see LIFE comment). */}
        <div
          className="absolute inset-0 overflow-hidden bg-background"
          style={{
            display: showArchive ? 'block' : 'none',
            overscrollBehavior: 'contain',
          }}
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
              // When fully visible (archiveSwipeDx===0), omit the transform so that
              // position:fixed children (OrganizeModal, etc.) are not trapped in a
              // new stacking context and can correctly cover the viewport.
              transform: archiveSubPage
                ? archiveSwipeDx > 0 ? `translateX(${archiveSwipeDx}px)` : undefined
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

    </div>
  );
}
