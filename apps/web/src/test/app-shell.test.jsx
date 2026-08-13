import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '../layouts/app-shell.jsx';

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      listOrganizations: vi.fn().mockResolvedValue([]),
    },
  };
});

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  it('renders brand, primary navigation and upcoming modules', () => {
    renderShell();

    expect(screen.getByText('DEVFORGE')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Repositories' })).toBeInTheDocument();
    expect(screen.getByText('Modules')).toBeInTheDocument();
  });

  it('toggles the theme and persists the choice', async () => {
    const user = userEvent.setup();
    renderShell();

    const button = screen.getByRole('button', { name: 'Light' });
    await user.click(button);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('devforge.theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
  });
});
