import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEST_AFRICA_LOCATIONS } from "@/lib/constants";
import { toast } from "sonner";
import { LogOut, MapPin, Phone, MessageCircle, Mail, UserRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [role, setRole] = useState("both");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.user.id)
        .maybeSingle();
      if (data) {
        setName(data.full_name ?? "");
        setPhone(data.phone ?? "");
        setWhatsapp(data.whatsapp ?? "");
        setCity(data.city ?? "");
        setRole(data.role ?? "both");
      }
      setLoading(false);
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name, phone, whatsapp, city, role })
      .eq("id", u.user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profil mis à jour");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    toast.success("Déconnecté");
    navigate({ to: "/" });
  };

  const initials =
    (name || email || "U")
      .split(/\s+/)
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="h-8 w-48 shimmer bg-muted rounded" />
        </div>
        <MobileFooter />
      <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Profile hero card */}
      <section className="border-b border-border bg-gradient-to-b from-card to-background">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-8 pb-10">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-volt text-volt-foreground text-xl font-bold font-display shadow-lg shadow-volt/30">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold tracking-tight font-display truncate">
                {name || "Mon profil"}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground inline-flex items-center gap-1.5 truncate">
                <Mail className="h-3.5 w-3.5 shrink-0" /> {email}
              </p>
              {city && (
                <p className="mt-0.5 text-xs text-muted-foreground inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {city}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 space-y-8">
        <form onSubmit={save} className="space-y-6">
          <div>
            <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" /> Identité
            </h2>
            <div className="mt-3 space-y-4 rounded-2xl border border-border bg-card p-5">
              <div className="space-y-1.5">
                <Label>Nom complet / entreprise</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Profil</Label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="fournisseur">Fournisseur</option>
                  <option value="revendeur">Revendeur</option>
                  <option value="both">Les deux</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground inline-flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" /> Contact
            </h2>
            <div className="mt-3 space-y-4 rounded-2xl border border-border bg-card p-5">
              <div className="space-y-1.5">
                <Label className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Téléphone
                </Label>
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="inline-flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </Label>
                <Input
                  type="tel"
                  placeholder="+221..."
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Pays / Ville
                </Label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choisir...</option>
                  {Object.entries(WEST_AFRICA_LOCATIONS).map(([country, cities]) => (
                    <optgroup key={country} label={country}>
                      {cities.map((c) => (
                        <option key={`${country}-${c}`} value={c}>{c}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <Button type="submit" variant="volt" className="h-12 w-full text-base font-semibold" disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer les modifications"}
          </Button>
        </form>

        {/* Logout — set apart, full-width destructive style */}
        <div className="pt-4 border-t border-dashed border-border">
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border border-border bg-card text-sm font-medium text-muted-foreground hover:text-destructive hover:border-destructive/50 transition"
          >
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </button>
        </div>
      </div>

      <MobileFooter />
      <MobileNav />
    </div>
  );
}
