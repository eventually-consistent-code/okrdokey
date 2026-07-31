/**
 * Purpose: App entry — router tree, query client, the guarded app shell.
 *          401 anywhere routes to /login; everything else is the ledger.
 * Author(s): John Reed
 */

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  RouterProvider,
} from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { apiFetch, UnauthorizedError } from './api.js';
import { Button } from './components/bits.js';
import { LoginPage, SignupPage } from './pages/auth.js';
import { CyclesPage } from './pages/cycles.js';
import { DashboardPage } from './pages/dashboard.js';
import { ObjectivePage } from './pages/objective.js';
import { SharePage } from './pages/share.js';
import { TeamPage, TeamsPage } from './pages/teams.js';
import './styles.css';

import { userResponseSchema } from '@okrdokey/shared';
import { z } from 'zod';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => {
      if (err instanceof UnauthorizedError && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    },
  }),
});

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const signupRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signup', component: SignupPage });
const shareRoute = createRoute({ getParentRoute: () => rootRoute, path: '/share/$token', component: SharePage });

// guarded shell — bounce to /login when there's no session
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async () => {
    try {
      await queryClient.fetchQuery({
        queryKey: ['me'],
        queryFn: () => apiFetch('/auth/me', userResponseSchema),
        staleTime: 60_000,
      });
    } catch {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack redirect() is control flow, not an error
      throw redirect({ to: '/login' });
    }
  },
  component: AppShell,
});

function AppShell(): React.ReactNode {
  const logout = async (): Promise<void> => {
    await apiFetch('/auth/logout', z.null(), { method: 'POST' });
    queryClient.clear();
    window.location.href = '/login';
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <header className="mb-8 flex items-center justify-between border-b-2 border-ink py-4">
        <Link to="/" className="font-display text-2xl font-bold tracking-tight">
          OKRdokey<span className="text-ember">.</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-semibold">
          <Link to="/" activeProps={{ className: 'text-ember' }}>
            dashboard
          </Link>
          <Link to="/my/teams" activeProps={{ className: 'text-ember' }}>
            teams
          </Link>
          <Link to="/my/cycles" activeProps={{ className: 'text-ember' }}>
            cycles
          </Link>
          <Button variant="ghost" onClick={() => void logout()}>
            log out
          </Button>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

const dashboardRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: DashboardPage });
const objectiveRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/o/$objectiveId',
  component: ObjectivePage,
});
const teamsRoute = createRoute({ getParentRoute: () => appRoute, path: '/my/teams', component: TeamsPage });
const teamRoute = createRoute({ getParentRoute: () => appRoute, path: '/my/teams/$teamId', component: TeamPage });
const cyclesRoute = createRoute({ getParentRoute: () => appRoute, path: '/my/cycles', component: CyclesPage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  signupRoute,
  shareRoute,
  appRoute.addChildren([dashboardRoute, objectiveRoute, teamsRoute, teamRoute, cyclesRoute]),
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
