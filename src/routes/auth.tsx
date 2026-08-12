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
} from "@/lib/constants";
import { toast } from "sonner";
import { Boxes, Check, ChevronDown } from "lucide-react";

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
  const [sCity, setSCity] = useState("");
  const [regionOpen, setRegionOpen] = useState(false);
  const [sRole, setSRole] = useState("both");
  const destination = redirect?.startsWith("/") ? redirect : "/dashboard";

  const dial = COUNTRY_DIAL_CODES[sCountry] ?? "+221";
  const regions = useMemo(() => WEST_AFRICA_LOCATIONS[sCountry] ?? [], [sCountry]);


  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.assign(destination);
    });
  }, [destination]);

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
    if (!sCity) return toast.error("Veuillez choisir votre région");
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
      <div className="mx-auto max-w-md px-4 sm:px-6 py-10 pb-28">
        <Link to="/" className="flex items-center gap-2 mb-6">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="h-5 w-5" />
          </div>
          <span className="font-bold text-lg">StockMe</span>
        </Link>

        <Tabs value={tab} onValueChange={(value) => setTab(value as "login" | "signup")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signup">Créer un compte</TabsTrigger>
            <TabsTrigger value="login">Connexion</TabsTrigger>
          </TabsList>

          <TabsContent value="signup" className="mt-6">
            <div className="mb-5">
              <h1 className="text-2xl font-bold font-display tracking-tight">Créez votre compte</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Gratuit — accédez aux numéros WhatsApp des fournisseurs.
              </p>
            </div>
            <form onSubmit={signup} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="sn">Nom complet ou entreprise</Label>
                <Input id="sn" required value={sName} onChange={(e) => setSName(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="se">Email</Label>
                <Input
                  id="se"
                  type="email"
                  required
                  value={sEmail}
                  onChange={(e) => setSEmail(e.target.value)}
                />
              </div>

              {/* Pays — liste déroulante avec recherche */}
              <div className="space-y-1.5">
                <Label>Pays</Label>
                <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-base">{COUNTRY_FLAGS[sCountry]}</span>
                        {sCountry}
                        <span className="text-muted-foreground">{dial}</span>
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
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
                                setSCity("");
                                setCountryOpen(false);
                              }}
                            >
                              <span className="mr-2 text-base">{COUNTRY_FLAGS[c]}</span>
                              <span className="flex-1">{c}</span>
                              <span className="text-xs text-muted-foreground">
                                {COUNTRY_DIAL_CODES[c]}
                              </span>
                              {sCountry === c && <Check className="ml-2 h-4 w-4 text-primary" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* WhatsApp avec indicatif automatique */}
              <div className="space-y-1.5">
                <Label htmlFor="sph">Numéro WhatsApp</Label>
                <div className="flex h-11 items-center rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
                  <span className="flex items-center gap-1.5 pl-3 pr-2 text-sm font-medium text-muted-foreground border-r border-input h-full">
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
                    className="flex-1 h-full bg-transparent px-3 text-sm outline-none"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  L'indicatif s'ajuste selon votre pays.
                </p>
              </div>

              {/* Région — liste déroulante avec recherche, filtrée par pays */}
              <div className="space-y-1.5">
                <Label>Région</Label>
                <Popover open={regionOpen} onOpenChange={setRegionOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <span className={sCity ? "" : "text-muted-foreground"}>
                        {sCity || "Choisir votre région..."}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Rechercher une région..." />
                      <CommandList>
                        <CommandEmpty>Aucune région trouvée.</CommandEmpty>
                        <CommandGroup heading={sCountry}>
                          {regions.map((r) => (
                            <CommandItem
                              key={r}
                              value={r}
                              onSelect={() => {
                                setSCity(r);
                                setRegionOpen(false);
                              }}
                            >
                              <span className="flex-1">{r}</span>
                              {sCity === r && <Check className="ml-2 h-4 w-4 text-primary" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label>Profil</Label>
                <Select value={sRole} onValueChange={setSRole}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Les deux</SelectItem>
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
                  required
                  minLength={6}
                  value={sPwd}
                  onChange={(e) => setSPwd(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">6 caractères minimum.</p>
              </div>

              <Button type="submit" variant="volt" className="w-full h-12 text-base font-semibold" disabled={loading}>
                {loading ? "Création..." : "Créer mon compte"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Déjà inscrit ?{" "}
                <button type="button" onClick={() => setTab("login")} className="font-semibold text-primary underline">
                  Se connecter
                </button>
              </p>
            </form>
          </TabsContent>

          <TabsContent value="login" className="mt-6">
            <form onSubmit={login} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="le">Email</Label>
                <Input
                  id="le"
                  type="email"
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
                  required
                  value={lPwd}
                  onChange={(e) => setLPwd(e.target.value)}
                />
              </div>
              <Button type="submit" variant="volt" className="w-full h-12 text-base font-semibold" disabled={loading}>
                {loading ? "..." : "Se connecter"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
      <MobileNav />
    </div>
  );
}
