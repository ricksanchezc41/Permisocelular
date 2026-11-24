# Permisos de celular · Ferrara Linares (versión Firebase)

Port de la app Streamlit/PostgreSQL a **HTML + JavaScript puro** que corre en el navegador y se despliega **gratis** con Firebase (plan Spark, sin tarjeta):

| Antes (Replit)            | Ahora (Firebase)                          |
|---------------------------|-------------------------------------------|
| Streamlit                 | HTML/CSS/JS en `public/` (sin build)      |
| PostgreSQL + SQLAlchemy   | Cloud Firestore                           |
| Usuario + contraseña hash | Firebase Authentication (correo/contraseña) |
| ReportLab (PDF)           | jsPDF (se genera en el navegador)         |
| Lógica en el servidor     | `data.js` + `firestore.rules`             |

## Despliegue paso a paso

### 1. Crear el proyecto (5 min)
1. Entra a <https://console.firebase.google.com> → **Agregar proyecto** (puedes desactivar Google Analytics).
2. **Compilación → Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar.**
3. **Compilación → Firestore Database → Crear base de datos →** modo **producción** → elige ubicación (p. ej. `nam5`).
4. **Configuración del proyecto (⚙) → Tus apps → `</>` Web →** registra la app (sin Hosting) y copia el objeto `firebaseConfig`.
5. Pégalo en **`public/firebase-config.js`**.
6. Pon el ID de tu proyecto en **`.firebaserc`** (reemplaza `TU_PROYECTO`).

### 2. Publicar
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,hosting
```
Tu app queda en `https://TU_PROYECTO.web.app`.

### 3. Crear el superadministrador (hazlo de inmediato)
Abre la URL → **Acceso administrativo**. Como aún no hay administradores verás **Primera configuración**: captura nombre, **usuario** y contraseña. Esa pantalla desaparece para siempre al crearse la cuenta. Después crea más administradores desde **Administradores**.

> Hazlo apenas termine el deploy: mientras no exista el primer superadmin, cualquiera que abra la página podría reclamar esa cuenta.

## Despliegue automático desde GitHub
1. Crea un repositorio en GitHub (puede ser **privado**) y sube el proyecto:
   ```bash
   git init && git add . && git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```
   `firebase-config.js` se puede subir: esa configuración es pública por diseño; la protegen el login y `firestore.rules`.
2. En <https://console.cloud.google.com> (mismo proyecto) → **IAM y administración → Cuentas de servicio → Crear cuenta de servicio** (`github-deploy`). Dale estos roles: **Firebase Hosting Admin**, **Firebase Rules Admin** y **Service Usage Consumer**. Si el deploy se queja de permisos, agrega también **Firebase Viewer**.
3. En esa cuenta → **Claves → Agregar clave → JSON**. Se descarga un archivo: **no lo subas al repositorio**.
4. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Nombre `FIREBASE_SERVICE_ACCOUNT`; valor: el contenido completo del JSON. Después borra el archivo descargado.
5. Haz `git push` a `main` (o ve a **Actions → Deploy a Firebase → Run workflow**). Cuando salga en verde, la app está en `https://TU_PROYECTO.web.app`.

Requisitos previos: el proyecto de Firebase ya creado, Firestore creado y el ID del proyecto en `.firebaserc`.

### Probar en local
```bash
cd public && python3 -m http.server 5000     # o: npx serve public
```
Abre `http://localhost:5000` (no abras el archivo con doble clic: los módulos y Firebase requieren `http://`). `localhost` ya está autorizado en Firebase Auth.

## Plan gratuito: ¿alcanza?
Spark incluye por día 50 000 lecturas, 20 000 escrituras y 20 000 borrados en Firestore, 10 GB de Hosting y Auth por correo sin costo. Para una planta es más que suficiente. Cada pestaña del panel lee sus colecciones completas (igual que la app original), así que si algún día hay decenas de miles de solicitudes conviene paginar.

## Qué cambió respecto a la versión Streamlit
- **Inicio de sesión solo con usuario y contraseña** (3–30 caracteres: letras, números, `.`, `-`, `_`; no distingue mayúsculas). Internamente Firebase Auth exige un correo, así que cada usuario se guarda como `usuario@permisos.local`; es ficticio y nadie lo ve ni lo necesita. Las contraseñas las maneja Firebase Auth (no hay `hash_password` propio).
- **Contraseñas:** cada administrador puede cambiar la suya en **Mi contraseña**. El navegador no puede fijar la contraseña de otra persona; si alguien la olvida, desactiva su cuenta y crea otra con otro usuario (o elimina la cuenta en Firebase → Authentication y vuelve a crearla con el mismo usuario).
- **Reglas de seguridad** (`firestore.rules`): el empleado sin sesión solo puede consultar su documento, crear solicitudes válidas, marcar su propio permiso como expirado y pedir renovación. Todo lo demás exige ser administrador activo. La aprobación automática por encuesta solo se acepta con uso «Trabajo», vigencia ≤ 2 meses y sin bloqueo de 30 días.
- **Bloqueo de reenvío (30 días)** ahora vive en la colección `bloqueos`, para no exponer la lista de solicitudes al público.
- La sesión de admin se cierra al cerrar la pestaña.

Pequeños ajustes respecto al original: el filtro «Desde» del historial ahora sí filtra; «Renovar 2 meses» también reactiva un permiso expirado; el estado «denegado» muestra su propio mensaje en vez de «pendiente»; la edición de usuario ofrece los 4 estados; borrar un usuario pide confirmación; el CSV abre con acentos correctos en Excel; se muestran los últimos cambios (auditoría) al editar un usuario.

## Red local
Firebase Hosting publica la app en una URL de internet; que solo se use desde la red de la planta no la hace privada. Lo que realmente protege los datos son el inicio de sesión y `firestore.rules`, así que no las quites. Si quieres que la página no sea accesible desde fuera, no despliegues Hosting: sirve la carpeta `public/` desde un equipo de la red (`python3 -m http.server 5000 --bind 0.0.0.0`, desde `public/`) y abre `http://IP-DEL-EQUIPO:5000`. Los datos seguirán en Firestore (requiere internet), y para que Auth acepte esa IP agrégala en Authentication → Configuración → Dominios autorizados.

## Límites de seguridad (sin servidor)
Como el plan gratuito no incluye Cloud Functions, la encuesta se evalúa en el navegador y las reglas solo pueden verificar *el resultado* (uso «Trabajo», vigencia ≤ 2 meses, sin bloqueo). Alguien con conocimientos técnicos podría saltarse las preguntas y obtener un permiso de trabajo automático. Si eso es un riesgo, mueve la evaluación a una Cloud Function (requiere plan Blaze, aunque su cuota gratuita suele cubrir este uso). Igual que en la app original, quien conozca un número de empleado puede ver los datos de ese empleado.

## Estructura
```
firebase.json · .firebaserc · firestore.rules · firestore.indexes.json
public/
  index.html · styles.css · logo_ferrara.png
  firebase-config.js   ← tu configuración
  firebase.js          capa del SDK
  data.js              lógica de datos (antes database.py)
  public.js            vista del empleado
  admin.js             panel administrativo
  pdf.js               generación del PDF
  app.js · util.js     arranque y utilidades
  vendor/jspdf.umd.min.js
```
