import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/stockme-client";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    const [{ data: sessionData }, { data: userData }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);
    if (!sessionData.session && !userData.user) {
      const redirectTo = `${location.pathname}${location.searchStr}${location.hash}`;
      throw redirect({
        to: "/auth",
        search: { redirect: redirectTo, mode: redirectTo === "/dashboard/new" ? "signup" : "login" },
      });
    }
  },
  head: () => {
    const { meta } = buildSeoHead({ noindex: true, title: "Mon espace — StockMe" });
    return { meta, links: [] };
  },
  component: () => <Outlet />,
});
