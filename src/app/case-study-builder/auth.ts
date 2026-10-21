import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

/*
  Accounts for Case Study Studio.
  - Sign in with Google, or with email + password.
  - Email links are only for creating an account and for setting or resetting a password;
    both land on the "Set a password" screen (#set-password).
  - Invite only: an email must be in studio_invites (Katelyn adds people from the account menu).
  - "owner" (Katelyn) also gets the AI features; everyone else gets the editor without them.
  Each person's case studies are saved to their own account (table "studies", private by row-level security).
*/

const OWNERS = ['katelyndayley1@gmail.com', 'katelynwolfley@gmail.com'];
let client: SupabaseClient | null = null;
export const supabase = () => {
  if (!client) client = createClient(`https://${projectId}.supabase.co`, publicAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'csb-auth' } });
  return client;
};

export type Role = 'owner' | 'member';
export type Account = { session: Session; email: string; name: string; avatar?: string; role: Role };

let token = '';            // the signed-in person's access token, sent to the Studio functions instead of a passcode
let current: Account | null = null;
export const account = () => current;
export const isOwner = () => current?.role === 'owner';
export const setAccount = (a: Account | null) => { current = a; token = a?.session.access_token ?? ''; };
supabase().auth.onAuthStateChange((_e, s) => { if (s) token = s.access_token; else { token = ''; current = null; } });

/** Headers for calls to the Studio's functions: the signed-in person, or the public key when signed out. */
export const authHeaders = () => ({ Authorization: `Bearer ${token || publicAnonKey}`, apikey: publicAnonKey });

const home = () => `${location.origin}${location.pathname}`;
export const signInWithGoogle = () => supabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: home() } });
export const SET_PASSWORD_HASH = '#set-password';
/** Existing accounts: email + password. */
export const signInWithPassword = (email: string, password: string) => supabase().auth.signInWithPassword({ email, password });
/** New accounts: a one-time link creates the account, then they choose a password. */
export const createAccountWithEmail = (email: string) => supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: home() + SET_PASSWORD_HASH, shouldCreateUser: true } });
/** Forgot password, or an older account that only ever used links: email a link to set one. */
export const sendPasswordLink = (email: string) => supabase().auth.resetPasswordForEmail(email, { redirectTo: home() + SET_PASSWORD_HASH });
export const setPassword = (password: string) => supabase().auth.updateUser({ password });
/** The 6-digit code from the same email. Works on any device or browser, unlike the link. */
export const verifyEmailCode = (email: string, token: string, why: 'create' | 'password') => supabase().auth.verifyOtp({ email, token, type: why === 'password' ? 'recovery' : 'email' });
export const signOut = async () => { await supabase().auth.signOut(); setAccount(null); };

/** Who is signed in, and are they on the invite list? */
export async function loadAccount(): Promise<{ account: Account | null; invited: boolean; email?: string }> {
  const { data } = await supabase().auth.getSession();
  const session = data.session; if (!session) return { account: null, invited: false };
  const email = (session.user.email || '').toLowerCase();
  const { data: found, error } = await supabase().from('studio_invites').select('role').eq('email', email).maybeSingle();
  // Katelyn is always the owner, even if the invite list can't be read (so she can never be locked out).
  const row = OWNERS.includes(email) ? { role: 'owner' } : error ? null : found;
  if (!row) return { account: null, invited: false, email };
  const meta = session.user.user_metadata || {};
  const a: Account = { session, email, name: String(meta.full_name || meta.name || email.split('@')[0]), avatar: meta.avatar_url ? String(meta.avatar_url) : undefined, role: row.role === 'owner' ? 'owner' : 'member' };
  setAccount(a); return { account: a, invited: true, email };
}

/* Invites (owners only; enforced by the database too). */
export const listInvites = async (): Promise<Array<{ email: string; role: string }>> => { const d = (await supabase().from('studio_invites').select('email, role, created_at').order('created_at')).data; return Array.isArray(d) ? d : []; };
export const addInvite = async (email: string) => { const { error } = await supabase().from('studio_invites').insert({ email: email.trim().toLowerCase(), role: 'member' }); if (error) throw new Error(error.message.includes('duplicate') ? 'That email is already invited.' : error.message); };
export const removeInvite = async (email: string) => { const { error } = await supabase().from('studio_invites').delete().eq('email', email); if (error) throw new Error(error.message); };
