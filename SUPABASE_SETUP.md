# Configuracion de Supabase y Stripe

Esta aplicacion usa Supabase Auth, Postgres, Row Level Security y Edge Functions. Stripe se integra mediante Checkout y un webhook firmado. No agregues claves privadas al archivo `.env` del frontend.

## Requisito de Stripe

Antes de habilitar pagos reales, confirma en Stripe que la empresa puede abrir una cuenta en su pais de constitucion, liquidar en la moneda configurada y cobrar a sus clientes. Colombia no aparece en la lista actual de paises donde Stripe habilita cuentas estandar. La integracion implementada usa COP y tarjeta; PSE, Nequi y Bancolombia no se habilitan automaticamente. No uses datos de una empresa o pais distintos a los reales.

## Configuracion del proyecto

1. Crea un proyecto en Supabase y copia su URL y su clave publica/anonima.
2. Copia `.env.example` a `.env.local` y reemplaza los valores de Supabase. Estas variables son publicas; no coloques aqui `service_role`, `STRIPE_SECRET_KEY` ni `STRIPE_WEBHOOK_SECRET`.
3. En el SQL Editor de Supabase, ejecuta `supabase/migrations/20261104000000_store_backend.sql`. La migracion crea el catalogo inicial de ocho productos; no la ejecutes repetidamente como script manual.
4. En Authentication, configura las URL de redireccion permitidas para el dominio local y de produccion. Para probar sin correo de confirmacion, desactiva temporalmente la confirmacion de correo en el proyecto de desarrollo.
5. Si necesitas un administrador, registra primero su usuario y luego asigna el rol desde el SQL Editor:

   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'admin@tu-dominio.com');`

6. Instala y autentica Supabase CLI, vincula el proyecto y configura los secretos de las Edge Functions:

   `supabase link --project-ref TU_PROJECT_REF`

   `supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... SITE_URL=http://localhost:5173`

   Los valores `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los proporciona Supabase al runtime de Edge Functions.

7. Despliega las funciones:

   `supabase functions deploy create-checkout-session`

   `supabase functions deploy stripe-webhook --no-verify-jwt`

8. En Stripe, crea un endpoint webhook apuntando a `https://TU_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`. Suscribe los eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded` y `checkout.session.async_payment_failed`. Guarda el secreto de firma del endpoint como `STRIPE_WEBHOOK_SECRET`.
9. Ejecuta `pnpm dev` y prueba el flujo primero con las claves de prueba de Stripe. Para produccion, actualiza `SITE_URL`, las URLs permitidas de Supabase y los secretos Stripe en el proyecto correspondiente.

## Seguridad y operacion

- El frontend solo usa la clave publica de Supabase. La clave `service_role` y las claves de Stripe se guardan como secretos de Edge Functions.
- Las politicas RLS limitan perfiles y pedidos al propietario, salvo administradores. El cliente no puede insertar pedidos directamente ni modificar estados de pago.
- El precio y el total se calculan en la funcion SQL a partir de los precios guardados en la base de datos. El carrito local solo envia identificadores de producto y cantidades.
- La confirmacion del pago se hace unicamente despues de verificar la firma del webhook de Stripe.
- El acceso de administrador se asigna manualmente en la base de datos; nunca se acepta un rol enviado desde el navegador.
- Los archivos de `.env.local` y las claves de Stripe no deben subirse al repositorio.