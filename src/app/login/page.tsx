'use client';

import { FormEvent, useState } from 'react';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? `Sign-in failed (HTTP ${res.status}).`);
        return;
      }
      // Only follow same-site relative paths, never an arbitrary ?next= URL.
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <link rel="preload" as="image" href="/brand/login-bg.jpg" />
      <form className="login-card" onSubmit={onSubmit} noValidate>
        <img className="brand-logo" src="/brand/logo-sm.png" alt="Lynx Plus" />
        {/* <div className="login-title">LYNX._PLUS</div> */}
        <div className="login-sub">Sign in</div>
        <div className="login-desc">Sign in to manage your news and social media accounts.</div>

        <div className="field">
          <label htmlFor="username">Username</label>
          <InputText id="username" value={username} placeholder="Enter your username" autoComplete="username" autoFocus onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="password-wrap">
            <InputText id="password" type={showPassword ? 'text' : 'password'} value={password} placeholder="Enter your password" autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              <i className={`pi ${showPassword ? 'pi-eye-slash' : 'pi-eye'}`} aria-hidden="true" />
            </button>
          </div>
          <a className="forgot-link" href="#">Forgot password?</a>
        </div>

        <Button className="signin-btn" type="submit" label="Sign in" icon="pi pi-sign-in" loading={busy} disabled={!username || !password} />
        <div className="login-error" role="alert" aria-live="polite">{error}</div>
      </form>
    </main>
  );
}
