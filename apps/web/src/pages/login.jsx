import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.js';
import { AuthLayout, FormBanner, Field, buttonClass, inputClass } from '../components/auth-layout.jsx';

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const verified = searchParams.get('verified') === '1';
  const registered = searchParams.get('registered') === '1';

  async function onSubmit(event) {
    event.preventDefault();
    try {
      await login({ email, password });
      navigate('/', { replace: true });
    } catch {
      // error surfaced from the store
    }
  }

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthLayout title="Sign in" subtitle="Access your DevForge workspace">
      {verified ? (
        <FormBanner tone="success">Email verified — you can now sign in.</FormBanner>
      ) : null}
      {registered ? (
        <FormBanner tone="info">
          Account created — check your email to verify, then sign in.
        </FormBanner>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={inputClass}
            required
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className={inputClass}
            required
          />
        </Field>

        {error ? <FormBanner tone="error">{error}</FormBanner> : null}

        <button type="submit" disabled={status === 'loading'} className={buttonClass}>
          {status === 'loading' ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <Link to="/register" className="text-accent hover:underline">
          Create account
        </Link>
        <Link to="/forgot-password" className="text-accent hover:underline">
          Forgot password?
        </Link>
      </div>
    </AuthLayout>
  );
}
