// Case Study Studio — one-click media upload
// Returns a one-time signed upload URL in the public "case-study-media"
// bucket, so the browser can upload a video or image directly, plus the
// permanent public URL to save in the case study.
//
// Secrets: STUDIO_PASSCODE (same as AI drafting). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { caller } from '../_shared/access.ts';

const allowed = new Set(['https://kwolfley27.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']);
const BUCKET = 'case-study-media';
const TYPES = /^(video\/(mp4|webm|quicktime)|image\/(png|jpeg|webp|gif|avif))$/;

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://kwolfley27.github.io',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-studio-passcode',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  if (origin && !allowed.has(origin)) return reply({ error: 'Origin not allowed.' }, 403);

  const who = await caller(request);
  if (!who.ok) return reply({ error: who.error, message: who.message }, who.status);

  let body: { name?: string; type?: string; size?: number; study?: string; publish?: string };
  try { body = await request.json(); } catch { return reply({ error: 'Send JSON.' }, 400); }
  const type = String(body.type || '');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Create the public bucket the first time (ignored if it exists).
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => undefined);

  // Publishing a case study: its JSON goes to published/<slug>.json (replaced on each publish).
  if (body.publish) {
    const slug = String(body.publish).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    if (!slug) return reply({ error: 'Give the case study a page address first.' }, 400);
    // A page address belongs to whoever published it first (Katelyn's earlier pages belong to her).
    const { data: taken } = await supabase.from('published_slugs').select('owner').eq('slug', slug).maybeSingle();
    if (taken?.owner && who.userId && taken.owner !== who.userId) return reply({ error: 'That page address is already used by someone else. Pick another in Page settings.' }, 409);
    if (taken && !taken.owner && !who.owner) return reply({ error: 'That page address is already used. Pick another in Page settings.' }, 409);
    await supabase.from('published_slugs').upsert({ slug, owner: who.userId ?? taken?.owner ?? null, updated_at: new Date().toISOString() });
    const path = `published/${slug}.json`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return reply({ error: `Storage: ${error?.message || 'could not create an upload link.'}` }, 500);
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return reply({ uploadUrl: data.signedUrl, token: data.token, path, publicUrl: pub.publicUrl });
  }
  if (!TYPES.test(type)) return reply({ error: 'Upload a video (mp4, webm, mov) or an image.' }, 400);

  const ext = ({ 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' } as Record<string, string>)[type];
  const folder = String(body.study || 'studio').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60) || 'studio';
  const path = `${who.userId ? `u/${who.userId}/` : ''}${folder}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return reply({ error: `Storage: ${error?.message || 'could not create an upload link.'}` }, 500);
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return reply({ uploadUrl: data.signedUrl, token: data.token, path, publicUrl: pub.publicUrl });
});
