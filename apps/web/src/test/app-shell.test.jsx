import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../layouts/app-shell.jsx';

describe('AppShell', () => {
  it('renders brand, primary navigation and upcoming modules', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByText('DEVFORGE')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Modules')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Repositories')).toBeInTheDocument();
  });

  it('toggles the theme and persists the choice', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Light' });
    await user.click(button);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('devforge.theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
  });
});
