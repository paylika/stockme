import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * `@tanstack/react-query` n'est plus utilisé : le site n'effectue aucune requête
 * via ses hooks (`useQuery` / `useMutation`). Il était pourtant embarqué dans le
 * paquet téléchargé par TOUS les visiteurs, pour rien.
 */
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
