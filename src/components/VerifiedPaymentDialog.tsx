import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  VERIFIED_BADGE_PRICE_FCFA,
  SERVICE_WHATSAPP,
  SERVICE_WHATSAPP_DISPLAY,
  verifiedBadgeWhatsAppLink,
} from "@/lib/constants";
import { AlertTriangle, Check, Copy, MessageCircle, ShieldCheck, Store, Smartphone } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shopName?: string | null;
  contactName?: string | null;
};

/**
 * Pop-up affichée AVANT WhatsApp : le vendeur doit d'abord envoyer l'argent,
 * puis confirmer avec la case « J'ai déjà envoyé ». Tant que la case n'est pas
 * cochée, le bouton WhatsApp reste désactivé — ce qui évite les messages de
 * personnes qui n'ont rien payé.
 *
 * Le paiement se fait par Wave ou Orange Money, et le badge est activé À LA
 * MAIN par l'équipe StockMe après réception de la capture (validation sous 24 h).
 */
export function VerifiedPaymentDialog({ open, onOpenChange, shopName, contactName }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  // On remet la case à zéro à chaque ouverture (confirmation consciente).
  useEffect(() => {
    if (open) {
      setConfirmed(false);
      setCopied(false);
    }
  }, [open]);

  const waHref = verifiedBadgeWhatsAppLink(shopName, contactName);
  const boutique = (shopName ?? "").trim() || (contactName ?? "").trim();

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(SERVICE_WHATSAPP);
      setCopied(true);
      toast.success("Numéro copié — collez-le dans Wave ou Orange Money");
    } catch {
      toast.error("Copie impossible : notez le numéro affiché");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left text-lg">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
            Badge Fournisseur vérifié
          </DialogTitle>
          <DialogDescription className="text-left">
            {VERIFIED_BADGE_PRICE_FCFA.toLocaleString("fr-FR")} FCFA / an — activation après vérification de votre
            paiement.
          </DialogDescription>
        </DialogHeader>

        {/* Étape 1 : payer */}
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Étape 1 — Envoyez d'abord l'argent
          </p>

          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-volt/15 text-volt">
              <Smartphone className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Wave ou Orange Money</p>
              <p className="text-lg font-bold tracking-tight">{SERVICE_WHATSAPP_DISPLAY}</p>
            </div>
            <button
              type="button"
              onClick={copyNumber}
              className="ml-auto inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold transition hover:bg-accent"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copié" : "Copier"}
            </button>
          </div>

          <p className="mt-3 text-sm font-semibold">
            Montant exact : {VERIFIED_BADGE_PRICE_FCFA.toLocaleString("fr-FR")} FCFA
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Envoyez le montant exact au numéro ci-dessus, puis revenez ici. Gardez la capture du paiement : elle sera
            demandée sur WhatsApp.
          </p>

          {boutique ? (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-[11px] leading-relaxed">
              <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                Le message partira avec le nom de votre boutique :{" "}
                <strong className="text-foreground">{boutique}</strong> — c'est ce nom que nous utilisons pour activer
                votre badge.
              </span>
            </p>
          ) : (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] leading-relaxed">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <span>
                Ajoutez d'abord le <strong className="text-foreground">nom de votre boutique</strong> dans votre profil,
                sinon nous ne pourrons pas identifier votre paiement.
              </span>
            </p>
          )}
        </div>

        {/* Étape 2 : confirmer */}
        <div className="rounded-2xl border border-border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Étape 2 — Confirmez
          </p>

          <label
            className={`mt-3 flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
              confirmed ? "border-success/50 bg-success/10" : "border-border bg-background"
            }`}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-input accent-volt"
            />
            <span className="text-sm font-semibold leading-snug">
              J'ai déjà envoyé les {VERIFIED_BADGE_PRICE_FCFA.toLocaleString("fr-FR")} FCFA
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                Cochez uniquement si le transfert est bien parti depuis votre compte.
              </span>
            </span>
          </label>

          {!confirmed && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-volt" />
              Le bouton WhatsApp s'activera après la case cochée — nous ne traitons que les demandes déjà payées.
            </p>
          )}
        </div>

        {/* Étape 3 : envoyer la preuve */}
        <div className="flex flex-col gap-2">
          {confirmed ? (
            <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={() => onOpenChange(false)}>
              <Button variant="volt" className="h-12 w-full text-sm font-bold">
                <MessageCircle className="mr-1.5 h-4 w-4" /> Envoyer la capture sur WhatsApp
              </Button>
            </a>
          ) : (
            <Button variant="volt" disabled className="h-12 w-full text-sm font-bold">
              <MessageCircle className="mr-1.5 h-4 w-4" /> Envoyer la capture sur WhatsApp
            </Button>
          )}
          <Button variant="ghost" className="h-10 w-full text-xs" onClick={() => onOpenChange(false)}>
            Plus tard
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            Demande traitée sous 24 h après réception de la capture. Badge activé sur votre profil, votre boutique et
            toutes vos annonces.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
