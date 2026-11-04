import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return jsonResponse({ error: 'Authentication required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const siteUrl = Deno.env.get('SITE_URL');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !stripeSecretKey || !siteUrl) {
    return jsonResponse({ error: 'Payment service is not configured' }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: 'Invalid session' }, 401);

  let payload: { items?: unknown; address?: unknown; phone?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 30) {
    return jsonResponse({ error: 'Invalid cart' }, 400);
  }
  if (typeof payload.address !== 'string' || typeof payload.phone !== 'string') {
    return jsonResponse({ error: 'Delivery information is required' }, 400);
  }

  const items = payload.items.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const value = item as Record<string, unknown>;
    return { product_id: value.productId, quantity: value.quantity };
  });
  if (items.some((item) => !item || typeof item.product_id !== 'string' || !Number.isInteger(item.quantity))) {
    return jsonResponse({ error: 'Invalid cart items' }, 400);
  }

  const { data: order, error: orderError } = await userClient.rpc('create_order', {
    p_items: items,
    p_address: payload.address,
    p_phone: payload.phone,
  });
  if (orderError || !order?.order_id || !Number.isInteger(order.total_cop)) {
    return jsonResponse({ error: orderError?.message ?? 'Could not create order' }, 400);
  }

  const amount = Number(order.total_cop);
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('payment_method_types[0]', 'card');
  form.set('line_items[0][price_data][currency]', 'cop');
  form.set('line_items[0][price_data][product_data][name]', `Pedido ${String(order.order_id).slice(0, 8)}`);
  form.set('line_items[0][price_data][unit_amount]', String(amount));
  form.set('line_items[0][quantity]', '1');
  form.set('client_reference_id', String(order.order_id));
  form.set('metadata[order_id]', String(order.order_id));
  form.set('success_url', `${siteUrl}/tracking?order=${order.order_id}&checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${siteUrl}/checkout?checkout=cancelled`);

  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `checkout-${order.order_id}`,
    },
    body: form,
  });
  const stripeSession = await stripeResponse.json();
  if (!stripeResponse.ok || typeof stripeSession.url !== 'string') {
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await serviceClient.from('payments').update({ status: 'fallido' }).eq('order_id', order.order_id);
    await serviceClient.from('orders').update({ payment_status: 'fallido' }).eq('id', order.order_id);
    return jsonResponse({ error: stripeSession.error?.message ?? 'Could not start payment' }, 502);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: saveError } = await serviceClient.from('payments')
    .update({ stripe_checkout_session_id: stripeSession.id })
    .eq('order_id', order.order_id);
  if (saveError) return jsonResponse({ error: 'Could not save payment session' }, 500);

  return jsonResponse({ orderId: order.order_id, checkoutUrl: stripeSession.url });
});