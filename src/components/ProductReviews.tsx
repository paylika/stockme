import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, Loader2, Star, ThumbsUp, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { uploadImage, MAX_PHOTO_SIZE } from "@/lib/image-upload";
import { IMG, thumb } from "@/lib/img";

/**
 * Avis et notes d'un produit — étoiles, commentaire et photos, comme sur
 * Alibaba. Les avis sont publics : c'est ce qui rassure un acheteur qui ne
 * connaît pas le vendeur.
 *
 * Règles appliquées côté base (incontournables) : un seul avis par personne et
 * par produit, impossible de noter son propre produit, moyenne recalculée
 * automatiquement sur le produit.
 */
type Review = {
  id: string;
  rating: number;
  comment: string | null;
  images: string[] | null;
  created_at: string;
  user_id: string;
  author: string;
  author_avatar: string | null;
  mine: boolean;
};

type Summary = {
  average: number;
  count: number;
  distribution: Record<string, number>;
  reviews: Review[];
};

const MAX_REVIEW_PHOTOS = 3;

/** Affichage d'une note en étoiles (avec demi-étoile). */
export function Stars({ value, size = "sm" }: { value: number; size?: "xs" | "sm" | "md" }) {
  const px = size === "xs" ? "h-3 w-3" : size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = value >= i ? 1 : value >= i - 0.5 ? 0.5 : 0;
        return (
          <span key={i} className={`relative inline-block ${px}`}>
            <Star className={`absolute inset-0 ${px} text-muted-foreground/40`} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={`${px} fill-volt text-volt`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function ProductReviews({ productId, sellerId }: { productId: string; sellerId?: string | null }) {
  const { user } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // 0 = AUCUNE étoile sélectionnée. On ne pré-remplit jamais 5/5 : l'acheteur
  // doit choisir lui-même sa note (sinon tout le monde « note » 5 sans y penser).
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isOwner = !!user && !!sellerId && user.id === sellerId;

  const load = async () => {
    const { data: res } = await supabase.rpc("get_product_reviews", { p_product_id: productId, p_limit: 30 });
    setData((res as Summary | null) ?? null);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, user?.id]);

  // Si l'utilisateur a déjà un avis, on pré-remplit le formulaire pour qu'il le modifie.
  useEffect(() => {
    const mine = data?.reviews.find((r) => r.mine);
    if (mine) {
      setRating(mine.rating);
      setComment(mine.comment ?? "");
    }
  }, [data]);

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const kept: File[] = [];
    for (const f of incoming) {
      if (files.length + kept.length >= MAX_REVIEW_PHOTOS) {
        toast.error(`Maximum ${MAX_REVIEW_PHOTOS} photos par avis.`);
        break;
      }
      if (f.size > MAX_PHOTO_SIZE) {
        toast.error(`${f.name} est trop lourde (15 Mo maximum).`);
        continue;
      }
      kept.push(f);
    }
    if (kept.length) setFiles((prev) => [...prev, ...kept]);
  };

  const submit = async () => {
    if (!user) return;
    if (rating < 1) {
      toast.error("Choisissez d'abord une note de 1 à 5 étoiles.");
      return;
    }
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const f of files) {
        uploaded.push(await uploadImage(f, user.id, "avis"));
      }
      const previous = data?.reviews.find((r) => r.mine)?.images ?? [];
      const { error } = await supabase.from("product_reviews").upsert(
        {
          product_id: productId,
          user_id: user.id,
          rating,
          comment: comment.trim() || null,
          images: [...previous, ...uploaded],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "product_id,user_id" },
      );
      if (error) throw new Error(error.message);
      toast.success("Merci ! Votre avis est publié.");
      setFiles([]);
      setFormOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer votre avis.");
    } finally {
      setBusy(false);
    }
  };

  const removeMine = async () => {
    const mine = data?.reviews.find((r) => r.mine);
    if (!mine || !confirm("Supprimer votre avis ?")) return;
    const { error } = await supabase.from("product_reviews").delete().eq("id", mine.id);
    if (error) return toast.error(error.message);
    toast.success("Avis supprimé");
    setComment("");
    setRating(5);
    await load();
  };

  const myReview = data?.reviews.find((r) => r.mine);
  const count = data?.count ?? 0;
  const average = data?.average ?? 0;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Avis des acheteurs</h2>
          {count > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-2xl font-bold">{average.toFixed(1).replace(".", ",")}</span>
              <Stars value={average} size="md" />
              <span className="text-xs text-muted-foreground">
                {count} avis
              </span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Aucun avis pour le moment — soyez le premier à en donner un.
            </p>
          )}
        </div>

        {/* Action principale */}
        {isOwner ? (
          <p className="max-w-xs rounded-xl bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Vous ne pouvez pas noter votre propre produit. Les avis de vos acheteurs s'afficheront ici.
          </p>
        ) : !user ? (
          <Link to="/auth" search={{ redirect: `/product/${productId}`, mode: "signup" } as never}>
            <Button variant="outline" className="h-10">
              <Star className="mr-1.5 h-4 w-4" /> Connectez-vous pour noter
            </Button>
          </Link>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="volt" className="h-10" onClick={() => setFormOpen((v) => !v)}>
              <Star className="mr-1.5 h-4 w-4" /> {myReview ? "Modifier mon avis" : "Donner mon avis"}
            </Button>
            {myReview && (
              <Button variant="ghost" className="h-10 text-muted-foreground" onClick={removeMine}>
                Supprimer
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Répartition des notes */}
      {count > 0 && data && (
        <div className="mt-4 space-y-1">
          {[5, 4, 3, 2, 1].map((n) => {
            const nb = data.distribution?.[String(n)] ?? 0;
            const pct = count > 0 ? Math.round((nb / count) * 100) : 0;
            return (
              <div key={n} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="w-3 text-right">{n}</span>
                <Star className="h-3 w-3 fill-volt text-volt" />
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-volt" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-8 text-right">{nb}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Formulaire */}
      {formOpen && user && !isOwner && (
        <div className="mt-5 space-y-3 rounded-2xl border border-volt/40 bg-volt/5 p-4">
          <div>
            <p className="text-xs font-semibold">Votre note</p>
            <div className="mt-1 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                  className="p-0.5"
                >
                  <Star
                    className={`h-7 w-7 transition ${
                      rating > 0 && n <= rating ? "fill-volt text-volt" : "text-muted-foreground/40"
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-xs font-semibold">
                {rating > 0 ? `${rating}/5` : "Touchez les étoiles"}
              </span>
            </div>
            {rating === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Aucune étoile n'est sélectionnée par défaut : choisissez la note que vous méritez de donner.
              </p>
            )}
          </div>

          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Qu'avez-vous pensé du produit ? Qualité, conformité, délai, emballage… Votre avis aide les autres acheteurs."
          />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              {files.map((f, i) => (
                <span key={i} className="relative">
                  <img
                    src={URL.createObjectURL(f)}
                    alt=""
                    className="h-16 w-16 rounded-lg border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-destructive text-white"
                    aria-label="Retirer la photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {files.length < MAX_REVIEW_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="grid h-16 w-16 place-items-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition hover:border-volt hover:text-volt"
                >
                  <Camera className="h-5 w-5" />
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  pickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <span className="text-[11px] text-muted-foreground">
                Photos du produit reçu (facultatif) — {MAX_REVIEW_PHOTOS} maximum
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-10" onClick={() => setFormOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button variant="volt" className="h-10" onClick={submit} disabled={busy || rating < 1}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-1.5 h-4 w-4" />}
              {myReview ? "Mettre à jour" : "Publier mon avis"}
            </Button>
          </div>
        </div>
      )}

      {/* Liste des avis */}
      {count > 0 && (
        <ul className="mt-5 space-y-4">
          {(data?.reviews ?? []).map((r) => (
            <li key={r.id} className="border-t border-border pt-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-volt text-[11px] font-bold text-volt-foreground">
                  {r.author_avatar ? (
                    <img src={r.author_avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    r.author.slice(0, 2).toUpperCase()
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{r.author}</span>
                    <Stars value={r.rating} size="xs" />
                    {r.mine && (
                      <span className="rounded-full bg-volt/20 px-2 py-0.5 text-[10px] font-bold text-volt">
                        Votre avis
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  {r.comment && <p className="mt-1 text-sm leading-relaxed">{r.comment}</p>}
                  {r.images && r.images.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.images.map((src) => (
                        <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                          <img
                            src={thumb(src, IMG.review)}
                            alt=""
                            loading="lazy"
                            className="h-20 w-20 rounded-lg border border-border object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
