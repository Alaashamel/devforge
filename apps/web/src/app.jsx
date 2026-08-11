import { Routes, Route } from 'react-router-dom';
import { AppShell } from './layouts/app-shell.jsx';
import { ErrorBoundary } from './components/error-boundary.jsx';
import { Dashboard } from './pages/dashboard.jsx';
import { NotFound } from './pages/not-found.jsx';

export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
