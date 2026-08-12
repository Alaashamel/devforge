import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { AuthLayout, FormBanner, Field, buttonClass, inputClass } from '../components/auth-layout.jsx';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.forgotPassword({ email });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Reset password" subtitle="We will email you a reset link if an account exists">
      {sent ? (
        <>
          <FormBanner tone="info">
            If an account exists for {email}, a reset link is on its way.
          </FormBanner>
          <Link to="/login" className={buttonClass}>
            Back to sign in
          </Link>
        </>
      ) : (
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

          {error ? <FormBanner tone="error">{error}</FormBanner> : null}

          <button type="submit" disabled={submitting} className={buttonClass}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
