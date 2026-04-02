import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { SpacesProvider } from "@/contexts/SpacesContext";
import { TutorialProvider } from "@/contexts/TutorialContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AISettingsProvider } from "@/contexts/AISettingsContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorPopupProvider } from "@/contexts/ErrorPopupContext";
import { AppStartup } from "@/components/AppStartup";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import { ErrorPopup } from "@/components/ErrorPopup";
// InteractiveTutorial import removed
import { ErrorBoundary } from "@/components/ErrorBoundary";
// Unified onboarding flow — self-managing, reads phase from TutorialContext
import { OnboardingTutorial } from "@/components/OnboardingTutorial";
import MainLayoutWrapper from "./layouts/MainLayoutWrapper";
import SpaceDetail from "./pages/SpaceDetail";
import ItemDetail from "./pages/ItemDetail";
import Search from "./pages/Search";
import SettingsPage from "./pages/SettingsPage";
import ChamberPage from "./pages/ChamberPage";
import HabitsPage from "./pages/HabitsPage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import NotificationsPage from "./pages/NotificationsPage";
import AskPage from "./pages/AskPage";
import NotFound from "./pages/NotFound";
import PublicArchivePage from "./pages/PublicArchivePage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import PeoplePage from "./pages/PeoplePage";
import { PeopleProvider } from "@/contexts/PeopleContext";
import { useCallback, useEffect } from "react";
import { forceClearAllCaches } from "@/lib/localCache";
import { prefetchLifeSubheadings } from "@/hooks/useLifeSubheadings";

const queryClient = new QueryClient();

// Check for cache clear URL parameter (escape hatch for stuck devices)
function useCacheClearEscapeHatch() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('clear-cache') === 'true') {
      console.log('[App] Cache clear escape hatch triggered');
      forceClearAllCaches();
      params.delete('clear-cache');
      const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState({}, '', newUrl);
      window.location.reload();
    }
  }, []);
}

// Inner component that uses auth context
function AppContent() {
  const { initializeAuth, signOut, appReady, loadingPhase, loadingError, authReady, loading, user } = useAuth();
  const location = useLocation();

  useCacheClearEscapeHatch();

  const handleInitialize = useCallback(async () => {
    await initializeAuth();
    // Fire-and-forget: start fetching AI subheadings in the background
    // as soon as auth is done so they're ready when LifePage renders.
    prefetchLifeSubheadings().catch(() => {});
  }, [initializeAuth]);

  const handleLogout = useCallback(async () => {
    await signOut();
  }, [signOut]);

  // Auth route is always accessible — never behind AppStartup loader
  const isPublicRoute = location.pathname === '/auth' || location.pathname.startsWith('/p/');

  const routes = (
    <Routes>
      {/* Public routes */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/p/:slug" element={<PublicArchivePage />} />

      {/* Protected routes */}
      <Route path="/onboarding" element={
        <ProtectedRoute><OnboardingPage /></ProtectedRoute>
      } />

      {/* MainLayout stays mounted — detail pages render as children */}
      <Route path="/invite/:token" element={
        <ProtectedRoute><AcceptInvitePage /></ProtectedRoute>
      } />

      <Route element={<ProtectedRoute><MainLayoutWrapper /></ProtectedRoute>}>
        <Route path="/" element={null} />
        <Route path="/archive" element={null} />
        <Route path="/daily-plan" element={null} />
        <Route path="/todos" element={null} />
        <Route path="/collections" element={null} />
        <Route path="/journal" element={null} />
        <Route path="/habits" element={null} />
        <Route path="/ask" element={<AskPage />} />
        <Route path="/space/:id" element={<SpaceDetail />} />
        <Route path="/item/:id" element={<ItemDetail />} />
        <Route path="/search" element={<Search />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/chamber" element={<ChamberPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/people" element={<PeoplePage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );

  // Inner content without SpacesProvider — shared between public and protected paths
  const innerContent = (
    <TutorialProvider>
      <AISettingsProvider>
        <TooltipProvider>
          <Toaster />
          <ErrorPopup />
          {/* OnboardingTutorial is self-managing — renders based on TutorialContext phase */}
          {!isPublicRoute && <OnboardingTutorial />}
          {routes}
        </TooltipProvider>
      </AISettingsProvider>
    </TutorialProvider>
  );

  // Public routes bypass the startup loader entirely (no SpacesProvider needed)
  if (isPublicRoute) {
    return (
      <ThemeProvider>
        {innerContent}
      </ThemeProvider>
    );
  }

  // Data is ready when:
  //   1. appReady=true (auth + data both loaded successfully)
  //   2. An error state — don't block on unrecoverable failures
  //   3. Auth is complete with no user — session expired or never existed;
  //      unblock AppStartup so ProtectedRoute can redirect to /auth.
  //      Without this, the app hangs forever when a session expires because
  //      appReady is always false when user=null (by design, to prevent
  //      the loading screen from showing when the user is logged in).
  const isDataReady = appReady || loadingPhase === 'error' || !!loadingError || (authReady && !loading && !user);

  // SpacesProvider is outside AppStartup so it mounts immediately and starts loading
  // data (from cache or cloud) while the splash screen is still showing. AppStartup
  // waits for isDataReady before revealing the app, ensuring users see populated content.
  return (
    <ThemeProvider>
      <SpacesProvider>
        <PeopleProvider>
          <AppStartup onInitialize={handleInitialize} onLogout={handleLogout} isDataReady={isDataReady}>
            {innerContent}
          </AppStartup>
        </PeopleProvider>
      </SpacesProvider>
    </ThemeProvider>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ErrorPopupProvider>
            <AppContent />
          </ErrorPopupProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
