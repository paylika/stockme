import { createMiddleware } from '@tanstack/react-start'
import { ensureSession } from '@/lib/auth-session'

// Must be registered as a global `functionMiddleware` in `src/start.ts`; otherwise
// the browser never attaches the bearer token to serverFn RPCs.
//
// `ensureSession` (et non `getSession`) : un jeton momentanément illisible ne
// doit pas transformer un appel connecté en appel anonyme — sinon la réponse
// revient vide et la page paraît « déconnectée ».
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    const session = await ensureSession()
    const token = session?.access_token
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  },
)
