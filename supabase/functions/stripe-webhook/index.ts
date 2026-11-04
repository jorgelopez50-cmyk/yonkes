import { createClient } from 'npm:@supabase/supabase-js@2';

function fromHex(value: string) {
  return new Uint8Array(value.match(/.{1,2}/g)?.map((part) => parseInt(part, 16)) ?? []);
}

async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(',').map((part) => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || signatures.length === 0 || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  return signatures.some((signature) => {
    const supplied = fromHex(signature);
    if (supplied.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ supplied[index];
    return difference === 0;
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const signature = request.headers.get('stripe-signature');
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!signature || !secret || !supabaseUrl || !serviceRoleKey) {
    return new Response('Webhook is not configured', { status: 503 });
  }

  const rawBody = await request.text();
  if (!await verifyStripeSignature(rawBody, signature, secret)) {
    return new Response('Invalid signature', { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid event', { status: 400 });
  }

  const eventType = event.type;
  if (eventType !== 'checkout.session.completed' &&
      eventType !== 'checkout.session.async_payment_succeeded' &&
      eventType !== 'checkout.session.async_payment_failed') {
    return new Response('Ignored', { status: 200 });
  }

  const data = event.data as { object?: Record<string, unknown> } | undefined;
  const session = data?.object;
  if (!session || typeof event.id !== 'string' || typeof session.id !== 'string' ||
      typeof session.amount_total !== 'number' || typeof session.currency !== 'string') {
    return new Response('Invalid checkout event', { status: 400 });
  }

  const paid = eventType === 'checkout.session.async_payment_succeeded' ||
    (eventType === 'checkout.session.completed' && session.payment_status === 'paid');
  if (!paid && eventType === 'checkout.session.completed') return new Response('Awaiting payment', { status: 200 });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.rpc('apply_stripe_checkout_event', {
    p_event_id: event.id,
    p_event_type: eventType,
    p_session_id: session.id,
    p_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    p_status: paid ? 'pagado' : 'fallido',
    p_amount: session.amount_total,
    p_currency: session.currency,
  });
  if (error) return new Response('Could not apply payment event', { status: 500 });
  return new Response('ok', { status: 200 });
});