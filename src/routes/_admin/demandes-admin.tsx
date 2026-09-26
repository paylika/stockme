import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/format";
import { adminBuyingRequests, adminSetRequestStatus, type AdminRequest } from "@/lib/buying-requests";
import { toast } from "sonner";
import { Eye, EyeOff, Flag, Handshake, Loader2, RefreshCw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_admin/demandes-admin")({
  component: AdminRequestsPage,
});

const STATUS_LABEL: Record<string, string> = {
  open: "En ligne",
  closed: "Clôturée",
  hidden: "Masquée",
};

/** Modération des demandes d'achat : signalements, masquage, contacts. */
function AdminRequestsPage() {
  const [items, setItems] = useState<AdminRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await adminBuyingRequests());
    } catch (err) {
      setItems([]);
      const message = err instanceof Error ? err.message : "";
      toast.error(
        /function|does not exist|schema cache/i.test(message)
          ? "Collez d'abord le script SQL des demandes (supabase/A_COLLER_MAINTENANT.sql)."
          : "Chargement impossible.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: string, status: "open" | "closed" | "hidden") => {
    setBusyId(id);
    try {
      await adminSetRequestStatus(id, status);
      toast.success(status === "hidden" ? "Demande masquée" : "Demande remise en ligne");
      await load();
    } catch {
      toast.error("Action impossible.");
    } finally {
      setBusyId(null);
    }
  };

  const reported = (items ?? []).filter((r) => r.signalements > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Handshake className="h-6 w-6 text-volt" /> Demandes d'achat
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ce que les acheteurs cherchent.{" "}
            <strong className="text-foreground">
              Les demandes signalées et sans réponse sont vos priorités : relancez les fournisseurs concernés.
            </strong>
          </p>
        </div>
        <Button variant="outline" className="h-10" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Rafraîchir
        </Button>
      </div>

      {reported.length > 0 && (
        <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-bold text-destructive">
            <Flag className="h-3.5 w-3.5" /> {reported.length} demande{reported.length > 1 ? "s" : ""} signalée
            {reported.length > 1 ? "s" : ""} — à vérifier
          </p>
        </div>
      )}

      {items === null ? (
        <div className="mt-6 h-40 rounded-2xl shimmer bg-muted" />
      ) : items.length === 0 ? (
        <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center">
          <Handshake className="h-9 w-9 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Aucune demande pour l'instant</p>
          <p className="mt-1 max-w-md px-4 text-xs text-muted-foreground">
            Publiez-en vous-même quelques-unes (celles que vous recevez sur WhatsApp) : une page avec de vraies
            demandes donne envie aux fournisseurs de répondre, une page vide tue le concept.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Demande</th>
                <th className="px-4 py-3 text-left">Acheteur</th>
                <th className="px-4 py-3 text-center">Budget</th>
                <th className="px-4 py-3 text-center">Réponses</th>
                <th className="px-4 py-3 text-center">État</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <Link
                      to="/demandes/$id"
                      params={{ id: r.id }}
                      className="font-semibold hover:text-primary hover:underline"
                    >
                      {r.title}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {r.category ?? "Sans catégorie"} · {r.city ?? "—"} ·{" "}
                      {r.quantity ? `${r.quantity} ${r.unit}` : "quantité non précisée"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.demandeur}</p>
                    <p className="text-[11px] text-muted-foreground">{r.demandeur_whatsapp ?? r.demandeur_phone ?? "—"}</p>
                    {r.signalements > 0 && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">
                        <Flag className="h-3 w-3" /> {r.signalements} signalement{r.signalements > 1 ? "s" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold">
                    {r.budget_fcfa ? formatFCFA(r.budget_fcfa) : "À négocier"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        r.responses_count > 0 ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {r.responses_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-[11px] font-semibold">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {r.status === "hidden" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={busyId === r.id}
                          onClick={() => void setStatus(r.id, "open")}
                        >
                          {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={busyId === r.id}
                          title="Masquer du site"
                          onClick={() => void setStatus(r.id, "hidden")}
                        >
                          {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-destructive"
                        disabled={busyId === r.id}
                        title="Clôturer"
                        onClick={() => void setStatus(r.id, "closed")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 rounded-xl bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Rappel utile :</strong> une demande sans réponse fait fuir l'acheteur pour
        de bon. Relancez les fournisseurs dont c'est la catégorie (le plus simple : le groupe WhatsApp). Vous saurez
        aussi quels produits recruter en priorité : ce sont ceux qui reviennent ici sans réponse.
      </p>
    </div>
  );
}
