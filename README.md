# Control de compras de obra

Aplicación web para el estudio de mercado y el seguimiento de cotizaciones de obra.
Consorcio AMG · CPI Educación Superior Simití.

- **Frontend:** React + Vite + TypeScript (estático)
- **Base de datos y autenticación:** Supabase (PostgreSQL + Auth)
- **Hosting:** Cloudflare Pages

---

## Puesta en marcha

Estos pasos requieren crear cuentas y manejar credenciales, así que los hace usted.

### 1. Crear el proyecto en Supabase

1. Entre a <https://supabase.com> y cree una cuenta.
2. Cree un proyecto nuevo. Anote la contraseña de la base de datos en un lugar seguro.
3. Elija la región más cercana: **East US (North Virginia)** es la de menor latencia hacia Colombia.

### 2. Crear las tablas

1. En el panel, vaya a **SQL Editor → New query**.
2. Abra `supabase/migrations/0001_init.sql`, copie **todo** el contenido y péguelo.
3. Presione **Run**. Debe terminar sin errores.

### 3. Cerrar el registro público — paso crítico

En **Authentication → Providers → Email**:

- **Enable sign ups** → **DESACTIVADO**
- **Confirm email** → **ACTIVADO**

> Si deja el registro abierto, cualquier persona con la dirección de la página
> puede crearse una cuenta y ver los precios y contactos de proveedores. Este es
> el ajuste que sostiene todo el control de acceso.

### 4. Configurar las URL de redirección

En **Authentication → URL Configuration**:

- **Site URL:** la dirección de su sitio en Cloudflare Pages
- **Redirect URLs:** agregue `https://SU-SITIO.pages.dev/definir-clave`
  y `http://localhost:5173/definir-clave` para pruebas locales.

### 5. Conectar el frontend

1. Copie `.env.example` como `.env`.
2. En Supabase, vaya a **Project Settings → API** y copie:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY`

Estas dos claves son públicas por diseño: viajan al navegador. Lo que protege
los datos es Row Level Security en PostgreSQL, no ocultarlas.

> **Nunca** ponga la clave `service_role` en `.env` ni en el código. Esa clave
> ignora todas las políticas de seguridad. Va únicamente como variable de
> entorno cifrada en Cloudflare Pages (ver paso 8).

### 6. Correr en local

```bash
npm install
npm run dev
```

Abre en <http://localhost:5173>.

### 7. Crear usuarios

El sistema crea a **todos** los usuarios como `operario` a propósito: nadie se
vuelve administrador solo.

Hay dos formas de dar de alta a una persona. Cuál usar depende de si tiene un
dominio propio para enviar correo.

#### 7a. Por invitación (requiere dominio propio + SMTP configurado)

El correo integrado de Supabase permite solo **2 envíos por hora** en todos
los planes: sirve para una prueba puntual, no para invitar a un equipo. Para
usarlo de verdad hay que conectar un proveedor de correo real (Resend, con
plan gratuito) en **Authentication → Settings → SMTP Settings**, y eso exige
un dominio propio verificado — el remitente de prueba de Resend
(`onboarding@resend.dev`) solo entrega al dueño de esa cuenta de Resend, a
nadie más.

1. Con el SMTP configurado, invite desde **Authentication → Users → Invite user**.
2. Esa persona abre el correo, define su contraseña y entra una vez.

#### 7b. Manual, sin correo (lo que se usa mientras no haya dominio propio)

1. **Authentication → Users → Add user** (no "Invite" — "Add user" crea la
   cuenta directamente).
2. Escriba el correo y una **contraseña temporal**.
3. Marque **Auto Confirm User**. Sin esto la cuenta queda sin confirmar y no
   puede entrar.
4. Entréguele el correo y la contraseña temporal por un canal seguro
   (verbalmente, en persona, WhatsApp cifrado — no por correo sin cifrar).
5. Esa persona entra con esos datos y, ya dentro, cambia la contraseña desde
   **Mi cuenta** en la barra superior. No hace falta que el administrador
   vuelva a intervenir para eso.

#### Promover al primer administrador

Con la primera persona ya registrada (por cualquiera de las dos vías) y habiendo
entrado una vez, en **SQL Editor** ejecute:

```sql
update public.profiles set role = 'admin' where email = 'correo@empresa.com';
```

Verifique:

```sql
select email, role, active from public.profiles order by created_at;
```

### 8. Desplegar en Cloudflare Pages

1. Suba el repositorio a GitHub.
2. En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
3. Configuración de compilación:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. En **Settings → Environment variables**, agregue:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` → **marcada como secreta**, solo la usa la
     función de invitación del servidor. Cárguela usted directamente aquí.

---

## Roles

| Acción | Operario | Administrador |
|---|:--:|:--:|
| Ver ítems, proveedores y cotizaciones | ✓ | ✓ |
| Cambiar estado, nota y cantidad de un ítem | ✓ | ✓ |
| Cargar y editar cotizaciones | ✓ | ✓ |
| Editar precio de referencia o especificación técnica | — | ✓ |
| Crear, importar o borrar ítems | — | ✓ |
| Crear, archivar o borrar proyectos | — | ✓ |
| Invitar usuarios y cambiar roles | — | ✓ |

Los permisos se aplican en **PostgreSQL**, no en la interfaz: aunque alguien
manipule el navegador, la base rechaza la operación.

---

## Respaldos

El plan gratuito de Supabase **no hace copias de respaldo** y pausa el proyecto
tras una semana sin actividad.

Mientras siga en plan gratuito, exporte el Excel semanalmente desde la propia
aplicación y guarde el archivo en la carpeta del consorcio.

**Suba a Supabase Pro (US$25/mes) cuando cargue la primera cotización formal
real.** Desde ese momento perder la base tendría costo de reconstrucción; Pro
incluye respaldos diarios y elimina la pausa por inactividad.

---

## Estructura

```
src/
  lib/
    supabase.ts     cliente del navegador (clave anónima)
    auth.tsx        sesión, perfil y rol
    types.ts        tipos de la base de datos
  pages/
    Login.tsx       ingreso
    SetPassword.tsx primer ingreso / recuperación
    Dashboard.tsx   tablero
supabase/
  migrations/       esquema y políticas de seguridad
public/
  _redirects        enrutado SPA para Cloudflare Pages
```
