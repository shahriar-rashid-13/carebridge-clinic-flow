import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { initSentry } from "./lib/sentry";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  if (!router.isServer) initSentry(router);

  return router;
};
