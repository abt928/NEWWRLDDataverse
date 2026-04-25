'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { signIn as passkeySignIn } from 'next-auth/webauthn';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError('Invalid email or password');
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  };

  const handlePasskeySignIn = async () => {
    setError('');
    setPasskeyLoading(true);
    try {
      await passkeySignIn('passkey', { callbackUrl: '/' });
    } catch (err) {
      setError('Passkey sign-in failed. Try another method.');
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <h1><span className="brand-shimmer">NEWWRLD</span></h1>
          <span className="auth-brand-sub">DATAVERSE</span>
        </div>
        <p className="auth-tagline">Streaming intelligence for artist acquisition</p>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          className="auth-passkey-btn"
          onClick={handlePasskeySignIn}
          disabled={passkeyLoading}
        >
          <span className="passkey-icon" aria-hidden="true">⚿</span>
          {passkeyLoading ? 'Authenticating…' : 'Sign in with Passkey'}
        </button>

        <p className="auth-switch">
          Don&apos;t have an account? <a href="/signup">Create one</a>
        </p>
      </div>
    </div>
  );
}
