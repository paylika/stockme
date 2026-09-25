-- ============================================================
-- StockMe — Messages de limite : prix du badge à 5 000 F/an
--
-- Les messages d'erreur envoyés au vendeur quand il atteint ses limites
-- annonçaient encore l'ancien prix de 2 000 FCFA et 5 photos. On les met à
-- jour : 5 000 FCFA par an et 10 photos par produit.
--
-- Aucun changement de comportement : seuls les textes changent.
-- Idempotent : peut être collé plusieurs fois sans effet de bord.
-- ============================================================

CREATE OR REPLACE FUNCTION public.products_guard_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified boolean;
  v_count int;
  c_max_images constant int := 2;
  c_max_products constant int := 10;
BEGIN
  -- Les administrateurs ne sont jamais bloqués (modération).
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(p.verified AND (p.verified_until IS NULL OR p.verified_until > now()), false)
    INTO v_verified
  FROM public.profiles p
  WHERE p.id = NEW.owner_id;

  IF coalesce(v_verified, false) THEN
    RETURN NEW; -- compte vérifié : aucune limite
  END IF;

  -- ---- Photos : 2 maximum ----
  IF TG_OP = 'INSERT' THEN
    IF NEW.images IS NOT NULL AND coalesce(array_length(NEW.images, 1), 0) > c_max_images THEN
      RAISE EXCEPTION 'Compte non vérifié : % photos maximum par produit. Faites vérifier votre boutique (5 000 FCFA par an) pour en mettre jusqu''à 10.', c_max_images;
    END IF;

    -- ---- Publications : 10 maximum ----
    IF NEW.published = true THEN
      SELECT count(*) INTO v_count FROM public.products WHERE owner_id = NEW.owner_id AND published = true;
      IF v_count >= c_max_products THEN
        RAISE EXCEPTION 'Compte non vérifié : % produits publiés maximum. Faites vérifier votre boutique (5 000 FCFA par an) pour publier sans limite.', c_max_products;
      END IF;
    END IF;
  ELSE
    -- Édition : on ne bloque que si le vendeur AJOUTE des photos au-delà de la limite.
    IF NEW.images IS NOT NULL
       AND coalesce(array_length(NEW.images, 1), 0) > c_max_images
       AND coalesce(array_length(NEW.images, 1), 0) > coalesce(array_length(OLD.images, 1), 0) THEN
      RAISE EXCEPTION 'Compte non vérifié : % photos maximum par produit. Faites vérifier votre boutique (5 000 FCFA par an) pour en mettre jusqu''à 10.', c_max_images;
    END IF;

    -- Passage de « dépublié » à « publié » : le quota s'applique aussi.
    IF NEW.published = true AND coalesce(OLD.published, false) = false THEN
      SELECT count(*) INTO v_count FROM public.products WHERE owner_id = NEW.owner_id AND published = true;
      IF v_count >= c_max_products THEN
        RAISE EXCEPTION 'Compte non vérifié : % produits publiés maximum. Faites vérifier votre boutique (5 000 FCFA par an) pour publier sans limite.', c_max_products;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.products_guard_limits() FROM PUBLIC;
