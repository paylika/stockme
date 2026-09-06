
-- ============================================================
-- Gestion admin : rôles + listage utilisateurs + stats plateforme
-- (fonctions SECURITY DEFINER réservées à l'admin)
-- ============================================================

-- Donner / retirer le rôle admin. Seul un admin peut le faire.
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_role = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  ELSIF p_role = 'user' THEN
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin';
  ELSE
    RAISE EXCEPTION 'invalid role';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

-- Liste des utilisateurs (id, email, profil, rôle admin) — admin uniquement.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT
      u.id,
      u.email,
      p.full_name,
      p.city,
      p.role,
      u.created_at,
      EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    ORDER BY u.created_at DESC
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Statistiques globales de la plateforme (KPIs admin) — admin uniquement.
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT json_build_object(
    'views',    (SELECT count(*) FROM public.product_events WHERE event = 'view'),
    'contacts', (SELECT count(*) FROM public.product_events WHERE event = 'contact'),
    'favorites',(SELECT count(*) FROM public.favorites)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO authenticated;
