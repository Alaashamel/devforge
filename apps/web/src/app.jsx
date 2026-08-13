import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppShell } from './layouts/app-shell.jsx';
import { ErrorBoundary } from './components/error-boundary.jsx';
import { AuthGuard } from './components/auth-guard.jsx';
import { Dashboard } from './pages/dashboard.jsx';
import { NotFound } from './pages/not-found.jsx';
import { Login } from './pages/login.jsx';
import { Register } from './pages/register.jsx';
import { VerifyEmail } from './pages/verify-email.jsx';
import { ForgotPassword } from './pages/forgot-password.jsx';
import { ResetPassword } from './pages/reset-password.jsx';
import { Projects } from './pages/projects.jsx';
import { ProjectDetail } from './pages/project-detail.jsx';
import { TaskDetail } from './pages/task-detail.jsx';
import { Repositories } from './pages/repositories.jsx';
import { RepositoryDetail } from './pages/repository-detail.jsx';
import { Chat } from './pages/chat.jsx';

const Analytics = lazy(() => import('./pages/analytics.jsx'));

function LazyFallback() {
  return <p className="text-sm text-muted">Loading…</p>;
}

export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:projectId" element={<ProjectDetail />} />
          <Route path="projects/:projectId/tasks/:taskId" element={<TaskDetail />} />
          <Route path="repositories" element={<Repositories />} />
          <Route path="repositories/:repoId" element={<RepositoryDetail />} />
          <Route path="chat" element={<Chat />} />
          <Route
            path="analytics"
            element={
              <Suspense fallback={<LazyFallback />}>
                <Analytics />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
