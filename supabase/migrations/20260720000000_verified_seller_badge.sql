-- ============================================================
-- StockMe — Badge « Fournisseur vérifié » (2 000 FCFA)
--
--   • profiles.verified        → le vendeur a payé et a été contrôlé
--   • profiles.verified_at     → date d'activation
--   • profiles.verified_until  → fin de validité (NULL = à vie)
--
-- Le badge est ACTIVÉ PAR L'ADMIN après paiement (Wave / Orange Money
-- puis confirmation WhatsApp). Un vendeur ne peut PAS se l'attribuer :
-- un trigger remet ces colonnes à leur valeur précédente pour tout
-- appelant qui n'est pas administrateur.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_until timestamptz;

-- ------------------------------------------------------------------
-- Garde-fou : seul un admin peut modifier les colonnes du badge
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_guard_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.verified := false;
      NEW.verified_at := NULL;
      NEW.verified_until := NULL;
    ELSE
      NEW.verified := OLD.verified;
      NEW.verified_at := OLD.verified_at;
      NEW.verified_until := OLD.verified_until;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.profiles_guard_verified() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_guard_verified ON public.profiles;
CREATE TRIGGER profiles_guard_verified
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_verified();

-- ------------------------------------------------------------------
-- Activer le badge (admin uniquement)
--   p_months = NULL → badge à vie ; sinon validité de N mois (défaut 12)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_seller_verified(p_user_id uuid, p_months int DEFAULT 12)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_until timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  v_until := CASE WHEN p_months IS NULL THEN NULL ELSE now() + (p_months || ' months')::interval END;

  UPDATE public.profiles
     SET verified = true, verified_at = now(), verified_until = v_until
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  RETURN json_build_object('ok', true, 'verified', true, 'verified_until', v_until);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_seller_verified(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_seller_verified(uuid, int) TO authenticated;

-- ------------------------------------------------------------------
-- Retirer le badge (admin uniquement)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_unset_seller_verified(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  UPDATE public.profiles
     SET verified = false, verified_until = NULL
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  RETURN json_build_object('ok', true, 'verified', false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_unset_seller_verified(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unset_seller_verified(uuid) TO authenticated;

-- ------------------------------------------------------------------
-- Profil public : on ajoute le badge (calculé → l'expiration est
-- respectée automatiquement, même si la colonne reste à true)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_seller(p_seller_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  SELECT row_to_json(t) INTO v FROM (
    SELECT
      p.id, p.shop_name, p.full_name, p.avatar_url, p.city, p.bio, p.created_at,
      (SELECT count(*) FROM public.products pr
        WHERE pr.owner_id = p.id AND pr.published = true) AS products_count,
      (p.verified AND (p.verified_until IS NULL OR p.verified_until > now())) AS is_verified,
      p.verified_until
    FROM public.profiles p
    WHERE p.id = p_seller_id
  ) t;

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_seller(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_seller(uuid) TO anon, authenticated;
