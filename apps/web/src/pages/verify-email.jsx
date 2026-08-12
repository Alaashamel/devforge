import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { AuthLayout, FormBanner, buttonClass } from '../components/auth-layout.jsx';

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [phase, setPhase] = useState(token ? 'verifying' : 'prompt');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token || phase !== 'verifying') return;
    let cancelled = false;
    api
      .verifyEmail({ token })
      .then(() => {
        if (!cancelled) setPhase('success');
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setPhase('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, phase]);

  return (
    <AuthLayout title="Verify email" subtitle="Confirm your DevForge account">
      {phase === 'verifying' ? <p className="text-sm text-muted">Verifying…</p> : null}

      {phase === 'success' ? (
        <>
          <FormBanner tone="success">Email verified. Your account is active.</FormBanner>
          <Link to="/login?verified=1" className={buttonClass}>
            Sign in
          </Link>
        </>
      ) : null}

      {phase === 'error' ? (
        <>
          <FormBanner tone="error">
            {error ?? 'The verification link is invalid or has expired.'}
          </FormBanner>
          <Link to="/login" className={buttonClass}>
            Go to sign in
          </Link>
        </>
      ) : null}

      {phase === 'prompt' ? (
        <>
          <p className="text-sm text-muted">
            Open the verification link we emailed you to confirm your account.
          </p>
          <Link to="/login" className={`${buttonClass} mt-4`}>
            Back to sign in
          </Link>
        </>
      ) : null}
    </AuthLayout>
  );
}
