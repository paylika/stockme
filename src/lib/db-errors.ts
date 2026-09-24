/**
 * Quand une fonction PostgreSQL n'a pas encore été créée dans Supabase,
 * PostgREST renvoie « Could not find the function … (PGRST202) ». Ce message
 * technique ne dit rien à un administrateur : on le traduit en action concrète.
 */
const MISSING_FUNCTION = /could not find the function|PGRST202|function .* does not exist/i;

export function isMissingFunction(message: string) {
  return MISSING_FUNCTION.test(message);
}

export function explainDbError(message: string, script?: string) {
  if (!isMissingFunction(message)) return message;
  return script
    ? `Fonction base de données manquante : collez le script « ${script} » dans Supabase (SQL Editor → Run), puis rechargez cette page.`
    : "Fonction base de données manquante : collez le script SQL correspondant dans Supabase (SQL Editor → Run), puis rechargez cette page.";
}
