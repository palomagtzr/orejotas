# Juntas

Graba juntas presenciales desde el navegador, obtén la transcripción con hablantes identificados y genera un resumen exportable (overview, puntos clave, action items, dudas sin resolver, pendientes…).

- **`web/`** → la app (React + Vite). Se publica en GitHub Pages. No contiene ninguna key.
- **`worker/`** → el backend (Cloudflare Worker, plan gratis). Aquí viven las keys. Habla con AssemblyAI (transcripción + resumen) o Deepgram.

Costo: $0 hasta agotar los $50 USD de crédito de AssemblyAI (~200 horas de junta). Ver "Cuando se acabe el crédito".

---

## 1. Cuentas que necesitas (todas gratis, sin tarjeta)

1. **AssemblyAI** → https://www.assemblyai.com → copia tu API key.
2. **Cloudflare** → https://dash.cloudflare.com/sign-up (Workers plan Free).
3. **GitHub** → el repo debe ser **público** (GitHub Pages gratis solo funciona en repos públicos).

## 2. Desplegar el Worker (backend)

```bash
cd worker
npm install
npx wrangler login                      # abre el navegador, autoriza

# Secretos (nunca van en el código):
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put ACCESS_CODE     # inventa una frase larga; es lo que escribirás en la app

# (Recomendado) contador diario para proteger tu crédito:
npx wrangler kv namespace create BUDGET
# → copia el "id" que imprime y descomenta el bloque [[kv_namespaces]] en wrangler.toml

npx wrangler deploy
```

Al terminar te da una URL tipo `https://juntas-api.TU-CUENTA.workers.dev`. Guárdala.

Edita `worker/wrangler.toml` → `ALLOWED_ORIGIN = "https://TU-USUARIO.github.io"` (sin barra final) y vuelve a correr `npx wrangler deploy`.

## 3. Desplegar la app (GitHub Pages)

1. Sube este repo a GitHub (público), rama `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables** → crea:
   - `VITE_WORKER_URL` = la URL del Worker del paso 2.
   - `VITE_BASE` = `/nombre-del-repo/` (si el repo se llama `TU-USUARIO.github.io`, pon `/`).
4. Haz push (o Actions → "Deploy web to GitHub Pages" → Run workflow). En un minuto la app queda en `https://TU-USUARIO.github.io/nombre-del-repo/`.
5. Abre la app, escribe tu `ACCESS_CODE`, graba.

### Probar en local

```bash
# Terminal 1
cd worker && cp .dev.vars.example .dev.vars   # llena las dos variables
npx wrangler dev                              # http://localhost:8787

# Terminal 2
cd web && cp .env.example .env                # VITE_WORKER_URL=http://localhost:8787  VITE_BASE=/
npm install && npm run dev                    # http://localhost:5173
```

---

## Cómo funciona

```
navegador ──(audio mono, streaming)──▶ Worker ──▶ AssemblyAI /upload + /transcript
    ▲                                   │
    └──── polling cada 4 s ◀────────────┘   al terminar: DELETE del transcript en AssemblyAI
navegador ──(texto con nombres)──────▶ Worker ──▶ LLM Gateway (Claude) ──▶ JSON del resumen
```

- Todo lo persistente (juntas, audio, transcripciones, resúmenes) vive en **IndexedDB de tu navegador**. El Worker no guarda nada.
- Mientras grabas, cada 5 s se guarda un fragmento en IndexedDB. Si se cierra la pestaña, al volver la app ofrece recuperar la grabación.
- **iPhone/iPad:** Safari detiene la grabación al bloquear la pantalla o cambiar de app. La app pide mantener la pantalla encendida; para juntas largas, graba con *Notas de Voz* y usa **Subir archivo**.
- Exportas a **Word (.docx)**, **Markdown** y **.txt**; también puedes descargar el audio.

## Seguridad: qué protege a tu crédito y a tus datos

| Riesgo | Mitigación |
|---|---|
| Alguien encuentra la URL del Worker | Requiere `ACCESS_CODE` (secret). Sin él, 401. Fallos limitados a 5/min por IP. |
| Abuso con código válido | Rate limit 6 transcripciones/min por IP, tope diario (`MAX_TRANSCRIPTS_PER_DAY`), archivo máx. 100 MB. |
| Cobro doble por audio estéreo | La app graba en **mono** forzado. |
| Add-ons que cuestan extra | Solo `speaker_labels`. Modelo explícito en `AAI_SPEECH_MODELS`. |
| Keys en el frontend | Imposible: el frontend solo conoce la URL del Worker. |
| CORS abierto | Solo responde a `ALLOWED_ORIGIN` (y localhost en desarrollo). |
| Datos en AssemblyAI | El transcript se borra de AssemblyAI al entregarse. El audio subido lo elimina AssemblyAI tras procesar. |
| Inyección vía transcript | El prompt trata la transcripción como datos y exige un JSON de esquema fijo. |
| XSS | React renderiza texto plano; no hay HTML inyectado. |
| Stack traces al cliente | Nunca; errores internos devuelven `{"error":"Error interno"}`. |

Lo que **no** protege: a quien tenga tu código de acceso y acceso físico a tu navegador. Usa "Salir" en computadoras compartidas y recuerda que borrar datos del sitio borra tus juntas (exporta).

**Legal:** en México debes informar a los participantes que la reunión se graba. Dilo al inicio.

## Cuando se acabe el crédito

Las llamadas a proveedores están aisladas en `worker/src/providers/`. Para cambiar a **Deepgram** ($200 de crédito gratis al registrarte):

```bash
cd worker
npx wrangler secret put DEEPGRAM_API_KEY
# en wrangler.toml: STT_PROVIDER = "deepgram"
npx wrangler deploy
```

Nada más cambia. El resumen sigue usando el LLM Gateway de AssemblyAI; si ese crédito también se agotó, reemplaza `callModel()` en `worker/src/llm.js` por el proveedor que prefieras (por ejemplo la API gratuita de Gemini): es una sola función.

Para agregar otro proveedor de transcripción, crea `providers/<nombre>.js` con `submit`, `status` y `cleanup` devolviendo el formato común (`utterances: [{speaker, start, end, text}]`) y regístralo en `PROVIDERS` de `index.js`.

## Variables de entorno del Worker

| Variable | Tipo | Descripción |
|---|---|---|
| `ASSEMBLYAI_API_KEY` | secret | Key de AssemblyAI |
| `ACCESS_CODE` | secret | Código que exige la app |
| `DEEPGRAM_API_KEY` | secret | Solo si `STT_PROVIDER=deepgram` |
| `GROQ_API_KEY` | secret | Resumen con Groq (`LLM_PROVIDER=groq`) |
| `LLM_API_KEY` | secret | Solo si `LLM_PROVIDER=custom` |
| `LLM_PROVIDER` | var | `groq` \| `assemblyai` \| `custom` |
| `LLM_BASE_URL` | var | Endpoint OpenAI-compatible si `custom` |
| `ALLOWED_ORIGIN` | var | Origen de la app (coma para varios) |
| `STT_PROVIDER` | var | `assemblyai` \| `deepgram` |
| `AAI_SPEECH_MODELS` | var | Modelos en orden, p. ej. `universal-3-pro,universal-2` |
| `LLM_MODEL` | var | Modelos en orden, separados por coma |
| `MAX_TRANSCRIPTS_PER_DAY` | var | Tope diario (requiere KV `BUDGET`) |
| `MAX_UPLOAD_MB` | var | Tamaño máximo de audio |
