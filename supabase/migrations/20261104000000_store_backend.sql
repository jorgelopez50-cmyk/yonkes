create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role text not null default 'cliente' check (role in ('cliente', 'admin')),
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price_cop integer not null check (price_cop > 0),
  category text not null,
  image_url text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  user_name text not null,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_preparacion', 'en_camino', 'entregado')),
  payment_status text not null default 'pendiente'
    check (payment_status in ('pendiente', 'pagado', 'fallido', 'reembolsado')),
  payment_method text not null default 'stripe' check (payment_method = 'stripe'),
  subtotal_cop integer not null default 0 check (subtotal_cop >= 0),
  delivery_fee_cop integer not null default 5000 check (delivery_fee_cop >= 0),
  total_cop integer not null default 5000 check (total_cop >= 0),
  address text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  unit_price_cop integer not null check (unit_price_cop > 0),
  quantity integer not null check (quantity between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  amount_cop integer not null check (amount_cop > 0),
  currency text not null default 'cop',
  status text not null default 'pendiente'
    check (status in ('pendiente', 'pagado', 'fallido', 'reembolsado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.stripe_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index order_items_order_idx on public.order_items (order_id);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.order_status_history enable row level security;
alter table public.stripe_events enable row level security;

create policy "Profiles are visible to their owner or admins"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

create policy "Active products are public"
on public.products for select to anon, authenticated
using (active or (select public.is_admin()));

create policy "Admins can manage products"
on public.products for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Users can read their own orders"
on public.orders for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "Users can read items from visible orders"
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and (o.user_id = (select auth.uid()) or (select public.is_admin()))
  )
);

create policy "Users can read history from visible orders"
on public.order_status_history for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and (o.user_id = (select auth.uid()) or (select public.is_admin()))
  )
);

grant select on public.products to anon, authenticated;
grant select on public.profiles, public.orders, public.order_items, public.order_status_history to authenticated;
revoke all on public.payments, public.stripe_events from anon, authenticated;
revoke insert, update, delete on public.products, public.orders, public.order_items, public.payments, public.order_status_history, public.stripe_events from anon, authenticated;
grant insert, update, delete on public.products to authenticated;

create or replace function public.create_order(p_items jsonb, p_address text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_user_name text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_subtotal integer := 0;
  v_delivery_fee integer := 5000;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid order items';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Invalid order items';
  end if;
  if length(trim(coalesce(p_address, ''))) < 5 or length(p_address) > 300 then
    raise exception 'Invalid delivery address';
  end if;
  if length(trim(coalesce(p_phone, ''))) < 7 or length(p_phone) > 30 then
    raise exception 'Invalid phone number';
  end if;

  select display_name into v_user_name
  from public.profiles where id = v_user_id;
  if not found then
    raise exception 'User profile not found';
  end if;

  insert into public.orders (user_id, user_name, address, phone, delivery_fee_cop, total_cop)
  values (v_user_id, v_user_name, trim(p_address), trim(p_phone), v_delivery_fee, v_delivery_fee)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item ->> 'quantity', '') !~ '^[0-9]+$' then
      raise exception 'Invalid item quantity';
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 30 then
      raise exception 'Invalid item quantity';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid and active;
    if not found then
      raise exception 'Product unavailable';
    end if;

    v_subtotal := v_subtotal + (v_product.price_cop * v_quantity);
    insert into public.order_items (order_id, product_id, product_name, unit_price_cop, quantity)
    values (v_order_id, v_product.id, v_product.name, v_product.price_cop, v_quantity);
  end loop;

  update public.orders
  set subtotal_cop = v_subtotal, total_cop = v_subtotal + v_delivery_fee
  where id = v_order_id;

  insert into public.payments (order_id, amount_cop, currency)
  values (v_order_id, v_subtotal + v_delivery_fee, 'cop');

  insert into public.order_status_history (order_id, new_status, changed_by)
  values (v_order_id, 'pendiente', v_user_id);

  return jsonb_build_object(
    'order_id', v_order_id,
    'subtotal_cop', v_subtotal,
    'delivery_fee_cop', v_delivery_fee,
    'total_cop', v_subtotal + v_delivery_fee
  );
end;
$$;

revoke all on function public.create_order(jsonb, text, text) from public, anon;
grant execute on function public.create_order(jsonb, text, text) to authenticated;

create or replace function public.admin_update_order_status(p_order_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;
  if p_new_status not in ('pendiente', 'en_preparacion', 'en_camino', 'entregado') then
    raise exception 'Invalid order status';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status = p_new_status then
    return;
  end if;
  if v_order.payment_status <> 'pagado' then
    raise exception 'Order must be paid before processing';
  end if;
  if not (
    (v_order.status = 'pendiente' and p_new_status = 'en_preparacion') or
    (v_order.status = 'en_preparacion' and p_new_status = 'en_camino') or
    (v_order.status = 'en_camino' and p_new_status = 'entregado')
  ) then
    raise exception 'Invalid order status transition';
  end if;

  update public.orders set status = p_new_status where id = p_order_id;
  insert into public.order_status_history (order_id, previous_status, new_status, changed_by)
  values (p_order_id, v_order.status, p_new_status, auth.uid());
end;
$$;

revoke all on function public.admin_update_order_status(uuid, text) from public, anon;
grant execute on function public.admin_update_order_status(uuid, text) to authenticated;

create or replace function public.apply_stripe_checkout_event(
  p_event_id text,
  p_event_type text,
  p_session_id text,
  p_payment_intent_id text,
  p_status text,
  p_amount integer,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
begin
  if p_event_type not in ('checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed') then
    raise exception 'Unsupported Stripe event';
  end if;
  if p_status not in ('pagado', 'fallido') then
    raise exception 'Invalid payment status';
  end if;
  if exists (select 1 from public.stripe_events where id = p_event_id) then
    return false;
  end if;

  select * into v_payment from public.payments
  where stripe_checkout_session_id = p_session_id for update;
  if not found or v_payment.amount_cop <> p_amount or lower(v_payment.currency) <> lower(p_currency) then
    raise exception 'Stripe payment does not match order';
  end if;

  if v_payment.status <> 'pagado' or p_status = 'pagado' then
    update public.payments
    set status = p_status, stripe_payment_intent_id = p_payment_intent_id
    where id = v_payment.id;
    update public.orders set payment_status = p_status where id = v_payment.order_id;
  end if;

  insert into public.stripe_events (id, event_type) values (p_event_id, p_event_type);
  return true;
end;
$$;

revoke all on function public.apply_stripe_checkout_event(text, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.apply_stripe_checkout_event(text, text, text, text, text, integer, text) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.orders;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;

insert into public.products (name, description, price_cop, category, image_url) values
  ('Hamburguesa Clásica', 'Jugosa hamburguesa de carne con lechuga, tomate, cebolla y queso', 18000, 'Hamburguesas', 'https://images.unsplash.com/photo-1648580852350-3098af89f110?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZWxpY2lvdXMlMjBoYW1idXJnZXIlMjBmYXN0JTIwZm9vZHxlbnwxfHx8fDE3NzM4Njg0NDB8MA&ixlib=rb-4.1.0&q=80&w=1080'),
  ('Hamburguesa Deluxe', 'Doble carne, tocino, queso cheddar y salsa especial', 25000, 'Hamburguesas', 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGVlc2VidXJnZXIlMjBiYWNvbiUyMGRlbHV4ZXxlbnwxfHx8fDE3NzM4Njg0NDJ8MA&ixlib=rb-4.1.0&q=80&w=1080'),
  ('Pizza Pepperoni', 'Pizza grande con abundante pepperoni y queso mozzarella', 35000, 'Pizzas', 'https://images.unsplash.com/photo-1631347155591-c162abe23014?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXBwZXJvbmklMjBwaXp6YSUyMHNsaWNlfGVufDF8fHx8MTc3Mzc5MzYzMXww&ixlib=rb-4.1.0&q=80&w=1080'),
  ('Pizza Margherita', 'Pizza tradicional con tomate fresco, albahaca y mozzarella', 28000, 'Pizzas', 'https://images.unsplash.com/photo-1707896543317-da87bde75ff6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXJnaGVyaXRhJTIwcGl6emElMjBmcmVzaHxlbnwxfHx8fDE3NzM4MTMwNzB8MA&ixlib=rb-4.1.0&q=80&w=1080'),
  ('Perro Caliente Súper', 'Salchicha premium con todos los aderezos, papa chip y queso', 12000, 'Perros Calientes', 'https://images.unsplash.com/photo-1768251036450-a66f4680d410?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxob3QlMjBkb2clMjBzYXVzYWdlJTIwYnVufGVufDF8fHx8MTc3Mzg2ODQ0MXww&ixlib=rb-4.1.0&q=80&w=1080'),
  ('Papas Fritas Grandes', 'Papas crujientes y doradas, porción grande', 8000, 'Acompañamientos', 'https://images.unsplash.com/photo-1599211469310-9b0b50a2955a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmVuY2glMjBmcmllcyUyMGNyaXNweXxlbnwxfHx8fDE3NzM3NjY4Nzl8MA&ixlib=rb-4.1.0&q=80&w=1080'),
  ('Nuggets de Pollo', '10 nuggets de pollo crujientes con salsa de tu elección', 15000, 'Acompañamientos', 'https://images.unsplash.com/photo-1696265498747-efc4c0dd7b98?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGlja2VuJTIwbnVnZ2V0cyUyMGZyaWVkfGVufDF8fHx8MTc3Mzg2ODQ0Mnww&ixlib=rb-4.1.0&q=80&w=1080'),
  ('Gaseosa Grande', 'Bebida refrescante de 500ml', 4000, 'Bebidas', 'https://images.unsplash.com/photo-1735643434124-f51889fa1f8c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2RhJTIwZHJpbmslMjBjb2xhfGVufDF8fHx8MTc3Mzg0MTI4Mnww&ixlib=rb-4.1.0&q=80&w=1080');