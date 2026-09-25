CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  images text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_product_user_idx
  ON public.product_reviews (product_id, user_id);
CREATE INDEX IF NOT EXISTS product_reviews_product_date_idx
  ON public.product_reviews (product_id, created_at DESC);
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_reviews_read ON public.product_reviews;
CREATE POLICY product_reviews_read ON public.product_reviews
  FOR SELECT USING (true);
DROP POLICY IF EXISTS product_reviews_insert ON public.product_reviews;
CREATE POLICY product_reviews_insert ON public.product_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = product_id AND p.owner_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS product_reviews_update ON public.product_reviews;
CREATE POLICY product_reviews_update ON public.product_reviews
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS product_reviews_delete ON public.product_reviews;
CREATE POLICY product_reviews_delete ON public.product_reviews
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rating_avg numeric(2,1);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rating_count int NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.refresh_product_rating(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products p
     SET rating_avg = s.avg_rating,
         rating_count = s.n
    FROM (
      SELECT round(avg(rating)::numeric, 1) AS avg_rating, count(*)::int AS n
        FROM public.product_reviews
       WHERE product_id = p_product_id
    ) s
   WHERE p.id = p_product_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_product_rating(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.product_reviews_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_product_rating(coalesce(NEW.product_id, OLD.product_id));
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.product_reviews_after_change() FROM PUBLIC;
DROP TRIGGER IF EXISTS product_reviews_after_change ON public.product_reviews;
CREATE TRIGGER product_reviews_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.product_reviews_after_change();
UPDATE public.products p
   SET rating_avg = s.avg_rating, rating_count = s.n
  FROM (
    SELECT product_id, round(avg(rating)::numeric, 1) AS avg_rating, count(*)::int AS n
      FROM public.product_reviews GROUP BY product_id
  ) s
 WHERE p.id = s.product_id;
CREATE OR REPLACE FUNCTION public.get_product_reviews(
  p_product_id uuid,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  SELECT json_build_object(
    'average', coalesce(round(avg(rating)::numeric, 1), 0),
    'count', count(*),
    'distribution', json_build_object(
      '5', count(*) FILTER (WHERE rating = 5),
      '4', count(*) FILTER (WHERE rating = 4),
      '3', count(*) FILTER (WHERE rating = 3),
      '2', count(*) FILTER (WHERE rating = 2),
      '1', count(*) FILTER (WHERE rating = 1)
    ),
    'reviews', coalesce((
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT r.id, r.rating, r.comment, r.images, r.created_at, r.user_id,
               coalesce(nullif(pf.shop_name, ''), nullif(pf.full_name, ''), 'Acheteur StockMe') AS author,
               pf.avatar_url AS author_avatar,
               (r.user_id = auth.uid()) AS mine
          FROM public.product_reviews r
          LEFT JOIN public.profiles pf ON pf.id = r.user_id
         WHERE r.product_id = p_product_id
         ORDER BY r.created_at DESC
         LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
      ) t
    ), '[]'::json)
  ) INTO v
  FROM public.product_reviews
  WHERE product_id = p_product_id;
  RETURN coalesce(v, json_build_object('average', 0, 'count', 0,
    'distribution', json_build_object('5',0,'4',0,'3',0,'2',0,'1',0), 'reviews', '[]'::json));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_product_reviews(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_reviews(uuid, int, int) TO anon, authenticated;