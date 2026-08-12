import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.js';
import { AuthLayout, FormBanner, Field, buttonClass, inputClass } from '../components/auth-layout.jsx';

export function Register() {
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const register = useAuthStore((s) => s.register);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    try {
      await register({ name, email, password });
      setCreated(true);
    } catch {
      // error surfaced from the store
    }
  }

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthLayout title="Create account" subtitle="Set up your DevForge workspace">
      {created ? (
        <FormBanner tone="success">
          Account created. Check your email for a verification link, then sign in.
        </FormBanner>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
              className={inputClass}
              required
            />
          </Field>
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
              autoComplete="new-password"
              className={inputClass}
              required
            />
          </Field>

          {error ? <FormBanner tone="error">{error}</FormBanner> : null}

          <button type="submit" disabled={status === 'loading'} className={buttonClass}>
            {status === 'loading' ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      )}

      <div className="mt-4 text-center text-xs text-muted">
        Already have an account?{' '}
        <Link to="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
