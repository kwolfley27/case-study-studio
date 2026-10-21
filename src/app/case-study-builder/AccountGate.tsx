import { useEffect, useState } from 'react';
import { verifyEmailCode, createAccountWithEmail, loadAccount, sendPasswordLink, SET_PASSWORD_HASH, setPassword, signInWithGoogle, signInWithPassword, signOut, supabase, type Account } from './auth';
import { syncLibrary } from './cloud';
import './account.css';

/*
  The door to the editor. Published case studies, phone links and research links stay public;
  only the editor asks you to sign in.
*/
type Phase = { kind: 'checking' } | { kind: 'signin'; error?: string } | { kind: 'sent'; email: string; why: 'create' | 'password' } | { kind: 'set-password'; account: Account } | { kind: 'not-invited'; email?: string } | { kind: 'syncing'; text: string } | { kind: 'in'; account: Account };

export function AccountGate({ children }: { children: (account: Account) => React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const check = async () => {
    const err = new URLSearchParams(location.hash.replace(/^#/, '').split('?')[1] || location.search).get('error_description');
    const r = await loadAccount().catch(() => ({ account: null, invited: false } as Awaited<ReturnType<typeof loadAccount>>));
    if (r.account && location.hash === SET_PASSWORD_HASH) { setPhase({ kind: 'set-password', account: r.account }); return; }
    if (r.account) {
      // Only the quick step (bringing newer copies down) happens before opening; saving up runs in the background.
      await syncLibrary().catch(() => undefined);
      setPhase({ kind: 'in', account: r.account }); return;
    }
    if (r.email) { setPhase({ kind: 'not-invited', email: r.email }); return; }
    setPhase({ kind: 'signin', error: err || undefined });
  };
  useEffect(() => {
    void check();
    const { data } = supabase().auth.onAuthStateChange(e => { if (e === 'PASSWORD_RECOVERY' && location.hash !== SET_PASSWORD_HASH) history.replaceState(null, '', location.pathname + location.search + SET_PASSWORD_HASH); if (e === 'SIGNED_IN' || e === 'SIGNED_OUT' || e === 'PASSWORD_RECOVERY') void check(); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (phase.kind === 'in') return <>{children(phase.account)}</>;
  return <main className={`acct ${phase.kind === 'checking' ? 'is-quiet' : ''}`}>
    <div className="acct-card">
      <p className="acct-mark"><span aria-hidden="true">✳</span> Case Study Studio</p>
      {phase.kind === 'checking' && <p className="acct-quiet" role="status">One moment…</p>}
      {phase.kind === 'syncing' && <p className="acct-quiet" role="status">{phase.text}</p>}
      {phase.kind === 'signin' && <SignIn error={phase.error} onSent={(email, why) => setPhase({ kind: 'sent', email, why })} />}
      {phase.kind === 'set-password' && <SetPassword account={phase.account} onDone={() => { history.replaceState(null, '', location.pathname + location.search); void check(); }} />}
      {phase.kind === 'sent' && <CheckEmail email={phase.email} why={phase.why} onBack={() => setPhase({ kind: 'signin' })} onVerified={() => { history.replaceState(null, '', location.pathname + SET_PASSWORD_HASH); void check(); }} />}
      {phase.kind === 'not-invited' && <>
        <h1>You’re not on the list yet</h1>
        <p>Case Study Studio is invite only for now. Ask Katelyn to invite <b>{phase.email}</b>, then sign in again.</p>
        <button type="button" className="acct-secondary" onClick={() => void signOut().then(() => setPhase({ kind: 'signin' }))}>Sign out</button>
      </>}
    </div>
  </main>;
}

const GoogleButton = ({ onError }: { onError: (m: string) => void }) => <button type="button" className="acct-google" onClick={() => void signInWithGoogle().then(({ error: e }) => { if (e) onError(/provider is not enabled/i.test(e.message) ? 'Google sign-in isn’t switched on yet. Use your email instead.' : e.message); })}>
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
  Continue with Google
</button>;
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
const friendly = (m: string) => /rate limit|too many/i.test(m) ? 'Too many tries in a short time. Wait a few minutes and try again.' : m;

/* Sign in with email + password. Links are only for creating an account or setting a password. */
function SignIn({ error, onSent }: { error?: string; onSent: (email: string, why: 'create' | 'password') => void }) {
  const [mode, setMode] = useState<'signin' | 'create'>('signin');
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('csb-last-email') || ''; } catch { return ''; } });
  const [password, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(error || '');
  const remember = (e: string) => { try { localStorage.setItem('csb-last-email', e); } catch { /* ignore */ } };
  const signIn = async (ev: React.FormEvent) => {
    ev.preventDefault(); setMsg('');
    if (!validEmail(email)) { setMsg('Enter your email address.'); return; }
    if (!password) { setMsg('Enter your password.'); return; }
    setBusy(true); const { error: e } = await signInWithPassword(email.trim(), password); setBusy(false);
    if (e) setMsg(/invalid login|invalid credentials/i.test(e.message) ? 'That email and password don’t match. If you’ve only ever signed in with a link, use “Forgot password?” once to set one.' : /not confirmed/i.test(e.message) ? 'Open the link in your email first to finish creating your account.' : friendly(e.message));
    else remember(email.trim()); // AccountGate picks up the sign-in
  };
  const forgot = async () => {
    setMsg(''); if (!validEmail(email)) { setMsg('Enter your email above, then tap “Forgot password?” again.'); return; }
    setBusy(true); const { error: e } = await sendPasswordLink(email.trim()); setBusy(false);
    if (e) setMsg(friendly(e.message)); else { remember(email.trim()); onSent(email.trim(), 'password'); }
  };
  const create = async (ev: React.FormEvent) => {
    ev.preventDefault(); setMsg(''); if (!validEmail(email)) { setMsg('Enter your email address.'); return; }
    setBusy(true); const { error: e } = await createAccountWithEmail(email.trim()); setBusy(false);
    if (e) setMsg(friendly(e.message)); else { remember(email.trim()); onSent(email.trim(), 'create'); }
  };
  if (mode === 'create') return <>
    <h1>Create an account</h1>
    <p>We’ll email you a link to confirm it’s you. Then you’ll choose a password.</p>
    <GoogleButton onError={setMsg} />
    <div className="acct-or"><span>or</span></div>
    <form onSubmit={e => void create(e)} className="acct-email">
      <label htmlFor="acct-email">Email</label>
      <input id="acct-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      <button type="submit" className="acct-primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a link to get started'}</button>
    </form>
    {msg && <p className="acct-error" role="alert">{msg}</p>}
    <p className="acct-switch">Already have an account? <button type="button" className="acct-link" onClick={() => { setMode('signin'); setMsg(''); }}>Sign in</button></p>
    <p className="acct-fine">Invite only for now.</p>
  </>;
  return <>
    <h1>Sign in</h1>
    <p>Build and publish case studies. Your work is saved to your account.</p>
    <form onSubmit={e => void signIn(e)} className="acct-email">
      <label htmlFor="acct-email">Email</label>
      <input id="acct-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      <label htmlFor="acct-pw">Password</label>
      <input id="acct-pw" type="password" autoComplete="current-password" value={password} onChange={e => setPw(e.target.value)} />
      <button type="button" className="acct-link acct-forgot" onClick={() => void forgot()} disabled={busy}>Forgot password?</button>
      <button type="submit" className="acct-primary" disabled={busy}>{busy ? 'One moment…' : 'Sign in'}</button>
    </form>
    {msg && <p className="acct-error" role="alert">{msg}</p>}
    <div className="acct-or"><span>or</span></div>
    <GoogleButton onError={setMsg} />
    <p className="acct-switch">New here? <button type="button" className="acct-link" onClick={() => { setMode('create'); setMsg(''); }}>Create an account</button></p>
    <p className="acct-fine">Invite only for now.</p>
  </>;
}

/* After an email link: choose a password so next time it's just email + password. */
function SetPassword({ account, onDone }: { account: Account; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const save = async (ev: React.FormEvent) => {
    ev.preventDefault(); setMsg('');
    if (pw.length < 8) { setMsg('Use at least 8 characters.'); return; }
    if (pw !== pw2) { setMsg('Those passwords don’t match.'); return; }
    setBusy(true); const { error: e } = await setPassword(pw); setBusy(false);
    if (e) setMsg(/should be different/i.test(e.message) ? 'That’s already your password. Pick a new one, or skip.' : /weak|at least/i.test(e.message) ? 'That password is too easy to guess. Try a longer one.' : friendly(e.message)); else onDone();
  };
  return <>
    <h1>Choose a password</h1>
    <p>For <b>{account.email}</b>. Next time, just sign in with your email and this password.</p>
    <form onSubmit={e => void save(e)} className="acct-email">
      <input type="email" autoComplete="username" value={account.email} readOnly hidden />
      <label htmlFor="acct-new">New password</label>
      <input id="acct-new" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
      <label htmlFor="acct-new2">Type it again</label>
      <input id="acct-new2" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
      <button type="submit" className="acct-primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
    </form>
    {msg && <p className="acct-error" role="alert">{msg}</p>}
    <p className="acct-switch"><button type="button" className="acct-link" onClick={onDone}>Skip for now</button></p>
  </>;
}

/* After we email them: type the 6-digit code (works anywhere), or tap the link. */
function CheckEmail({ email, why, onBack, onVerified }: { email: string; why: 'create' | 'password'; onBack: () => void; onVerified: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const verify = async (ev: React.FormEvent) => {
    ev.preventDefault(); setMsg('');
    const token = code.replace(/\D/g, ''); if (token.length < 6) { setMsg('Enter the code from the email.'); return; }
    setBusy(true); const { error: e } = await verifyEmailCode(email, token, why); setBusy(false);
    if (e) setMsg(/expired|invalid/i.test(e.message) ? 'That code didn’t work or has expired. Go back and send a new one.' : e.message); else onVerified();
  };
  return <>
    <h1>Check your email</h1>
    <p>We sent a code to <b>{email}</b>{why === 'create' ? ' to create your account' : ' to set your password'}. Type it here:</p>
    <form onSubmit={e => void verify(e)} className="acct-email">
      <label htmlFor="acct-code">Code</label>
      <input id="acct-code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={e => setCode(e.target.value)} placeholder="123456" className="acct-code" />
      <button type="submit" className="acct-primary" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
    </form>
    {msg && <p className="acct-error" role="alert">{msg}</p>}
    <p className="acct-fine">You can also tap the link in the email, as long as it opens in this same browser. Not there? Check spam, or wait a minute; a few emails an hour can be sent.</p>
    <p className="acct-switch"><button type="button" className="acct-link" onClick={onBack}>Use a different email</button></p>
  </>;
}
