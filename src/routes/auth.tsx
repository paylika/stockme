import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  WEST_AFRICA_LOCATIONS,
  WEST_AFRICA_COUNTRIES,
  COUNTRY_DIAL_CODES,
  COUNTRY_FLAGS,
  SENEGAL_REGIONS,
  SENEGAL_REGION_NAMES,
} from "@/lib/constants";
import { toast } from "sonner";
import { IconCheck, IconChevronDown } from "@/components/icons";
import logoUrl from "@/assets/stockme-logo.png";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; mode?: "login" | "signup" } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    mode: search.mode === "login" ? "login" : "signup",
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect, mode } = Route.useSearch();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">(mode ?? "signup");

  // login
  const [lEmail, setLEmail] = useState("");
  const [lPwd, setLPwd] = useState("");

  // signup
  const [sEmail, setSEmail] = useState("");
  const [sPwd, setSPwd] = useState("");
  const [sName, setSName] = useState("");
  const [sCountry, setSCountry] = useState("Sénégal");
  const [countryOpen, setCountryOpen] = useState(false);
  const [sLocalPhone, setSLocalPhone] = useState("");
  const [sRegion, setSRegion] = useState("");
  const [sCity, setSCity] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [sRole, setSRole] = useState("both");
  const destination = redirect?.startsWith("/") ? redirect : "/dashboard";

  const dial = COUNTRY_DIAL_CODES[sCountry] ?? "+221";
  const isSenegal = sCountry === "Sénégal";
  // Villes proposées : communes de la région choisie (Sénégal) sinon liste du pays.
  const cityOptions = useMemo(() => {
    if (isSenegal) return sRegion ? SENEGAL_REGIONS[sRegion] ?? [] : [];
    return WEST_AFRICA_LOCATIONS[sCountry] ?? [];
  }, [isSenegal, sRegion, sCountry]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.assign(destination);
    });
  }, [destination]);

  const resetLocation = () => {
    setSRegion("");
    setSCity("");
  };

  const goAfterAuth = () => {
    window.location.assign(destination);
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: lEmail, password: lPwd });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Connecté !");
    goAfterAuth();
  };

  const signup = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = sLocalPhone.replace(/\D/g, "");
    if (digits.length < 6) return toast.error("Numéro WhatsApp invalide");
    if (isSenegal && !sRegion) return toast.error("Veuillez choisir votre région");
    if (!sCity) return toast.error("Veuillez choisir votre ville");
    const fullPhone = `${dial}${digits}`;
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: sEmail,
      password: sPwd,
      options: {
        emailRedirectTo: `${window.location.origin}${destination}`,
        data: {
          full_name: sName,
          phone: fullPhone,
          whatsapp: fullPhone,
          country: sCountry,
          region: isSenegal ? sRegion : null,
          city: sCity || sCountry,
          role: sRole,
        },
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    if (!data.session) {
      await supabase.auth.signInWithPassword({ email: sEmail, password: sPwd });
    }
    setLoading(false);
    toast.success("Bienvenue sur StockMe !");
    goAfterAuth();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto w-full max-w-md px-4 sm:px-6">
        <div className="py-10 md:py-16">
          <div className="w-full pb-10">
            <Link to="/" className="mb-8 flex items-center gap-2.5">
              <img src={logoUrl} alt="StockMe" className="h-10 w-10 rounded-xl object-contain" />
              <span className="text-lg font-display font-semibold tracking-tight">
                Stock<span className="font-bold">Me</span>
              </span>
            </Link>

            <Tabs value={tab} onValueChange={(value) => setTab(value as "login" | "signup")}>
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-muted p-1">
                <TabsTrigger value="signup" className="rounded-lg text-sm">Créer un compte</TabsTrigger>
                <TabsTrigger value="login" className="rounded-lg text-sm">Connexion</TabsTrigger>
              </TabsList>

              <TabsContent value="signup" className="mt-7">
                <div className="mb-6">
                  <h1 className="font-display text-2xl font-bold tracking-tight">Créez votre compte</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Gratuit — accédez aux numéros WhatsApp des fournisseurs.
                  </p>
                </div>
                <form onSubmit={signup} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="sn">Nom complet ou entreprise</Label>
                    <Input id="sn" className="h-11" required value={sName} onChange={(e) => setSName(e.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="se">Email</Label>
                    <Input
                      id="se"
                      type="email"
                      className="h-11"
                      required
                      value={sEmail}
                      onChange={(e) => setSEmail(e.target.value)}
                    />
                  </div>

                  {/* Pays */}
                  <div className="space-y-1.5">
                    <Label>Pays</Label>
                    <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm transition hover:border-foreground/30"
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-base">{COUNTRY_FLAGS[sCountry]}</span>
                            {sCountry}
                            <span className="text-muted-foreground">{dial}</span>
                          </span>
                          <IconChevronDown className="h-4 w-4 opacity-50" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Rechercher un pays..." />
                          <CommandList>
                            <CommandEmpty>Aucun pays trouvé.</CommandEmpty>
                            <CommandGroup>
                              {WEST_AFRICA_COUNTRIES.map((c) => (
                                <CommandItem
                                  key={c}
                                  value={c}
                                  onSelect={() => {
                                    setSCountry(c);
                                    resetLocation();
                                    setCountryOpen(false);
                                  }}
                                >
                                  <span className="mr-2 text-base">{COUNTRY_FLAGS[c]}</span>
                                  <span className="flex-1">{c}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {COUNTRY_DIAL_CODES[c]}
                                  </span>
                                  {sCountry === c && <IconCheck className="ml-2 h-4 w-4 text-primary" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* WhatsApp */}
                  <div className="space-y-1.5">
                    <Label htmlFor="sph">Numéro WhatsApp</Label>
                    <div className="flex h-11 items-center rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
                      <span className="flex h-full items-center gap-1.5 border-r border-input pl-3 pr-2 text-sm font-medium text-muted-foreground">
                        <span className="text-base">{COUNTRY_FLAGS[sCountry]}</span>
                        {dial}
                      </span>
                      <input
                        id="sph"
                        type="tel"
                        inputMode="numeric"
                        required
                        placeholder="76 678 32 15"
                        value={sLocalPhone}
                        onChange={(e) => setSLocalPhone(e.target.value.replace(/[^\d\s]/g, ""))}
                        className="h-full flex-1 bg-transparent px-3 text-sm outline-none"
                      />
                    </div>
                  </div>

                  {/* Localisation — Région → Ville pour le Sénégal, sinon Ville */}
                  <div className={isSenegal ? "grid grid-cols-2 gap-3" : ""}>
                    {isSenegal && (
                      <div className="space-y-1.5">
                        <Label>Région</Label>
                        <Select
                          value={sRegion}
                          onValueChange={(v) => {
                            setSRegion(v);
                            setSCity("");
                          }}
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Région" />
                          </SelectTrigger>
                          <SelectContent>
                            {SENEGAL_REGION_NAMES.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label>{isSenegal ? "Ville / Commune" : "Ville"}</Label>
                      <Popover open={cityOpen} onOpenChange={setCityOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={isSenegal && !sRegion}
                            className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm transition hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className={sCity ? "truncate" : "truncate text-muted-foreground"}>
                              {sCity || (isSenegal && !sRegion ? "Choisir la région d'abord" : "Choisir…")}
                            </span>
                            <IconChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Rechercher…" />
                            <CommandList>
                              <CommandEmpty>Aucun résultat.</CommandEmpty>
                              <CommandGroup heading={isSenegal ? sRegion : sCountry}>
                                {cityOptions.map((c) => (
                                  <CommandItem
                                    key={c}
                                    value={c}
                                    onSelect={() => {
                                      setSCity(c);
                                      setCityOpen(false);
                                    }}
                                  >
                                    <span className="flex-1">{c}</span>
                                    {sCity === c && <IconCheck className="ml-2 h-4 w-4 text-primary" />}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Profil</Label>
                    <Select value={sRole} onValueChange={setSRole}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Les deux (acheter & vendre)</SelectItem>
                        <SelectItem value="fournisseur">Fournisseur</SelectItem>
                        <SelectItem value="revendeur">Revendeur</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="sp">Mot de passe</Label>
                    <Input
                      id="sp"
                      type="password"
                      className="h-11"
                      required
                      minLength={6}
                      value={sPwd}
                      onChange={(e) => setSPwd(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">6 caractères minimum.</p>
                  </div>

                  <Button type="submit" variant="volt" className="h-12 w-full text-base font-semibold" disabled={loading}>
                    {loading ? "Création..." : "Créer mon compte"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Déjà inscrit ?{" "}
                    <button type="button" onClick={() => setTab("login")} className="font-semibold text-primary underline underline-offset-2">
                      Se connecter
                    </button>
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="login" className="mt-7">
                <div className="mb-6">
                  <h1 className="font-display text-2xl font-bold tracking-tight">Content de vous revoir</h1>
                  <p className="mt-1 text-sm text-muted-foreground">Connectez-vous à votre compte StockMe.</p>
                </div>
                <form onSubmit={login} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="le">Email</Label>
                    <Input
                      id="le"
                      type="email"
                      className="h-11"
                      required
                      value={lEmail}
                      onChange={(e) => setLEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lp">Mot de passe</Label>
                    <Input
                      id="lp"
                      type="password"
                      className="h-11"
                      required
                      value={lPwd}
                      onChange={(e) => setLPwd(e.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="volt" className="h-12 w-full text-base font-semibold" disabled={loading}>
                    {loading ? "..." : "Se connecter"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Pas encore de compte ?{" "}
                    <button type="button" onClick={() => setTab("signup")} className="font-semibold text-primary underline underline-offset-2">
                      Créer un compte
                    </button>
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
