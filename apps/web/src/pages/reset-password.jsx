import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { AuthLayout, FormBanner, Field, buttonClass, inputClass } from '../components/auth-layout.jsx';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a strong password for your account">
      {!token ? (
        <FormBanner tone="error">This reset link is missing its token.</FormBanner>
      ) : done ? (
        <>
          <FormBanner tone="success">Password updated. You can now sign in.</FormBanner>
          <Link to="/login" className={buttonClass}>
            Sign in
          </Link>
        </>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="New password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
              required
            />
          </Field>
          <Field label="Confirm password">
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
              required
            />
          </Field>

          {error ? <FormBanner tone="error">{error}</FormBanner> : null}

          <button type="submit" disabled={submitting} className={buttonClass}>
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
