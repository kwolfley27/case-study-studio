import { useEffect, useState } from 'react';
import { loadAccount, signInWithEmail, signInWithGoogle, signOut, supabase, type Account } from './auth';
import { syncLibrary } from './cloud';
import './account.css';

/*
  The door to the editor. Published case studies, phone links and research links stay public;
  only the editor asks you to sign in.
*/
type Phase = { kind: 'checking' } | { kind: 'signin'; error?: string } | { kind: 'sent'; email: string } | { kind: 'not-invited'; email?: string } | { kind: 'syncing'; text: string } | { kind: 'in'; account: Account };

export function AccountGate({ children }: { children: (account: Account) => React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const check = async () => {
    const err = new URLSearchParams(location.hash.replace(/^#/, '').split('?')[1] || location.search).get('error_description');
    const r = await loadAccount().catch(() => ({ account: null, invited: false } as Awaited<ReturnType<typeof loadAccount>>));
    if (r.account) {
      setPhase({ kind: 'syncing', text: 'Getting your case studies…' });
      await syncLibrary(text => setPhase({ kind: 'syncing', text })).catch(() => undefined);
      setPhase({ kind: 'in', account: r.account }); return;
    }
    if (r.email) { setPhase({ kind: 'not-invited', email: r.email }); return; }
    setPhase({ kind: 'signin', error: err || undefined });
  };
  useEffect(() => {
    void check();
    const { data } = supabase().auth.onAuthStateChange(e => { if (e === 'SIGNED_IN' || e === 'SIGNED_OUT') void check(); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (phase.kind === 'in') return <>{children(phase.account)}</>;
  return <main className="acct">
    <div className="acct-card">
      <p className="acct-mark"><span aria-hidden="true">✳</span> Case Study Studio</p>
      {phase.kind === 'checking' && <p className="acct-quiet" role="status">One moment…</p>}
      {phase.kind === 'syncing' && <p className="acct-quiet" role="status">{phase.text}</p>}
      {phase.kind === 'signin' && <SignIn error={phase.error} onSent={email => setPhase({ kind: 'sent', email })} />}
      {phase.kind === 'sent' && <>
        <h1>Check your email</h1>
        <p>We sent a sign-in link to <b>{phase.email}</b>. Open it on this device and you’ll land right back here.</p>
        <button type="button" className="acct-link" onClick={() => setPhase({ kind: 'signin' })}>Use a different email</button>
      </>}
      {phase.kind === 'not-invited' && <>
        <h1>You’re not on the list yet</h1>
        <p>Case Study Studio is invite only for now. Ask Katelyn to invite <b>{phase.email}</b>, then sign in again.</p>
        <button type="button" className="acct-secondary" onClick={() => void signOut().then(() => setPhase({ kind: 'signin' }))}>Sign out</button>
      </>}
    </div>
  </main>;
}

function SignIn({ error, onSent }: { error?: string; onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(error || '');
  const google = async () => { setMsg(''); const { error: e } = await signInWithGoogle(); if (e) setMsg(/provider is not enabled/i.test(e.message) ? 'Google sign-in isn’t switched on yet. Use the email link for now.' : e.message); };
  const send = async (ev: React.FormEvent) => {
    ev.preventDefault(); if (!/.+@.+\..+/.test(email)) { setMsg('Enter your email address.'); return; }
    setBusy(true); setMsg(''); const { error: e } = await signInWithEmail(email.trim()); setBusy(false);
    if (e) setMsg(/rate limit/i.test(e.message) ? 'Too many links sent in a short time. Try again in a few minutes.' : e.message); else onSent(email.trim());
  };
  return <>
    <h1>Sign in</h1>
    <p>Build and publish case studies. Your work is saved to your account.</p>
    <button type="button" className="acct-google" onClick={() => void google()}>
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      Continue with Google
    </button>
    <div className="acct-or"><span>or</span></div>
    <form onSubmit={e => void send(e)} className="acct-email">
      <label htmlFor="acct-email">Email</label>
      <input id="acct-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      <button type="submit" className="acct-secondary" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
    </form>
    {msg && <p className="acct-error" role="alert">{msg}</p>}
    <p className="acct-fine">Invite only for now.</p>
  </>;
}
