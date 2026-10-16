import { useEffect, useRef, useState } from 'react';
import { addInvite, listInvites, removeInvite, signOut, type Account } from './auth';
import { onCloudState, cloudState, type CloudState } from './cloud';

/* The little account button in the header: who's signed in, save status, invites (owner) and sign out. */
export function AccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const [save, setSave] = useState<CloudState>(cloudState());
  useEffect(() => onCloudState(setSave), []);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; addEventListener('pointerdown', out); return () => removeEventListener('pointerdown', out); }, [open]);
  const initial = (account.name || account.email)[0]?.toUpperCase() || '·';
  return <div className="acct-menu" ref={box}>
    <button type="button" className="acct-avatar" aria-label={`Account: ${account.email}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
      {account.avatar ? <img src={account.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{initial}</span>}
      <i className={`acct-dot is-${save}`} aria-hidden="true" />
    </button>
    {open && <div className="acct-pop" role="dialog" aria-label="Account">
      <div className="acct-who"><b>{account.name}</b><span>{account.email}</span></div>
      <p className="acct-save">{save === 'saving' ? 'Saving to your account…' : save === 'offline' ? 'Couldn’t reach your account. Saved in this browser; I’ll try again.' : 'All changes saved to your account.'}</p>
      {account.role === 'owner' && <Invites />}
      <button type="button" className="acct-secondary" onClick={() => void signOut().then(() => location.reload())}>Sign out</button>
    </div>}
  </div>;
}

function Invites() {
  const [list, setList] = useState<Array<{ email: string; role: string }>>([]);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => void listInvites().then(setList);
  useEffect(load, []);
  const add = async (e: React.FormEvent) => { e.preventDefault(); setMsg(''); try { await addInvite(email); setEmail(''); load(); } catch (err) { setMsg(err instanceof Error ? err.message : 'Couldn’t add that.'); } };
  return <div className="acct-invites">
    <p className="acct-label">Invite people</p>
    <form onSubmit={e => void add(e)}><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="their@email.com" aria-label="Email to invite" /><button type="submit" disabled={!/.+@.+\..+/.test(email)}>Invite</button></form>
    {msg && <p className="acct-error">{msg}</p>}
    <ul>{list.map(i => <li key={i.email}><span>{i.email}</span>{i.role === 'owner' ? <small>You</small> : <button type="button" aria-label={`Remove ${i.email}`} onClick={() => void removeInvite(i.email).then(load)}>Remove</button>}</li>)}</ul>
    <p className="acct-fine">They sign in at this same address with Google or an email link. They get the editor and publishing; the AI features stay yours.</p>
  </div>;
}
