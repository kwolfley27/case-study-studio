// Who is calling a Studio function?
// - The old Studio passcode still works (counts as the owner).
// - Otherwise the caller must be signed in (Authorization: Bearer <access token>) with an invited email.
//   "owner" (Katelyn) can use everything; invited "member"s can upload and publish, but not the AI features.
import { createClient } from 'npm:@supabase/supabase-js@2';

export type Caller = { ok: true; owner: boolean; userId: string | null } | { ok: false; status: number; error: string; message: string };

export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

export async function caller(request: Request, opts: { ownerOnly?: boolean } = {}): Promise<Caller> {
  const pass = Deno.env.get('STUDIO_PASSCODE') || '';
  if (pass && request.headers.get('x-studio-passcode') === pass) return { ok: true, owner: true, userId: null };
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, status: 401, error: 'signin', message: 'Please sign in to the Studio.' };
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: 'signin', message: 'Please sign in to the Studio.' };
  const email = (data.user.email || '').toLowerCase();
  const { data: invite } = await db.from('studio_invites').select('role').eq('email', email).maybeSingle();
  if (!invite) return { ok: false, status: 403, error: 'invite', message: 'This account isn’t invited to the Studio.' };
  const owner = invite.role === 'owner';
  if (opts.ownerOnly && !owner) return { ok: false, status: 403, error: 'owner', message: 'AI features are only available to the Studio owner.' };
  return { ok: true, owner, userId: data.user.id };
}
