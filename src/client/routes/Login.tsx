import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../lib/api';
import { Brand } from './Layout';

export function Login() {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/login', { password });
      await qc.invalidateQueries();
      await qc.refetchQueries({ queryKey: ['session'] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <form onSubmit={submit} className="login">
        <Brand />
        <p className="sub" style={{ margin: 0 }}>
          Your coffee log. Enter your password.
        </p>
        <div>
          <label htmlFor="password" className="lbl">
            Password
          </label>
          <input
            id="password"
            className="in"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="err" style={{ margin: 0 }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

export function SetupNeeded({ message }: { message: string }) {
  return (
    <main className="center">
      <div className="login">
        <h1>Almost there</h1>
        <p className="sub">{message}</p>
      </div>
    </main>
  );
}
