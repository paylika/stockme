/**
 * Accès aux variables d'environnement CÔTÉ SERVEUR uniquement.
 *
 * En production (Cloudflare Workers) les secrets sont exposés dans `env` ;
 * en développement (Node) ils viennent de `process.env`. Les deux chemins
 * sont essayés, sans jamais importer `cloudflare:workers` statiquement
 * (ce module n'existe pas sous Node).
 */
export async function serverEnv(name: string): Promise<string | undefined> {
  const fromProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
  if (fromProcess) return fromProcess;

  try {
    const specifier = "cloudflare:workers";
    const mod = (await import(/* @vite-ignore */ specifier)) as {
      env?: Record<string, string | undefined>;
    };
    return mod?.env?.[name];
  } catch {
    return undefined;
  }
}

/** Indique si un paiement par carte est configuré (clé Stripe présente). */
export async function hasStripe(): Promise<boolean> {
  return !!(await serverEnv("STRIPE_SECRET_KEY"));
}

/** Indique si le mobile money est configuré (clé UnitechPay présente). */
export async function hasUnitechPay(): Promise<boolean> {
  return !!(await serverEnv("UNITECH_API_KEY"));
}
