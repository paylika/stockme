import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";

export const Route = createFileRoute("/legal")({
  component: LegalLayout,
});

function LegalLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-3xl px-5 sm:px-6 py-8 sm:py-12">
        <Outlet />
      </main>
      <Footer />
      <MobileFooter />
      <MobileNav />
    </div>
  );
}
