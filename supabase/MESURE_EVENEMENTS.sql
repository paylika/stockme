-- ============================================================================
-- StockMe — MESURE DES ÉVÉNEMENTS (vues et contacts)
--
-- À coller dans Supabase → SQL Editor → Run.
-- Aucune modification : ce fichier ne fait que LIRE. Tu peux le relancer quand
-- tu veux, à n'importe quelle heure.
--
-- POURQUOI : avant d'alléger la table des statistiques, il faut connaître son
-- volume réel, sa taille et sa vitesse de croissance. Décider sans ces chiffres
-- reviendrait à optimiser au hasard.
-- ============================================================================

-- 1. LE VOLUME ET LA TAILLE
select
  (select count(*) from public.product_events)                                   as evenements_total,
  (select count(*) from public.product_events where event = 'view')              as vues_total,
  (select count(*) from public.product_events where event = 'contact')           as contacts_total,
  (select count(*) from public.product_events
     where created_at >= now() - interval '24 hours')                            as dernieres_24h,
  (select count(*) from public.product_events
     where created_at >= now() - interval '7 days')                              as derniers_7_jours,
  (select min(created_at)::date from public.product_events)                      as premier_evenement,
  pg_size_pretty(pg_relation_size('public.product_events'))                      as taille_table,
  pg_size_pretty(pg_total_relation_size('public.product_events')
                 - pg_relation_size('public.product_events'))                    as taille_index,
  pg_size_pretty(pg_total_relation_size('public.product_events'))                as taille_totale;

-- 2. LA PROJECTION : au rythme des 7 derniers jours, où en sera-t-on dans un an ?
select
  round(count(*) filter (where created_at >= now() - interval '7 days') / 7.0)          as evenements_par_jour,
  round(count(*) filter (where created_at >= now() - interval '7 days') / 7.0 * 365)    as dans_un_an,
  pg_size_pretty((
    pg_total_relation_size('public.product_events')::numeric
    * (count(*) filter (where created_at >= now() - interval '7 days') / 7.0 * 365)
    / greatest(count(*), 1)
  )::bigint)                                                                            as taille_dans_un_an
from public.product_events;

-- 3. LES 5 PRODUITS LES PLUS LOURDS (ceux qui écrivent le plus souvent)
select p.name, count(*) as evenements
from public.product_events e
join public.products p on p.id = e.product_id
group by p.name
order by 2 desc
limit 5;

-- 4. LES 5 VENDEURS QUI GÉNÈRENT LE PLUS D'ÉVÉNEMENTS
select coalesce(pr.shop_name, pr.full_name, 'sans nom') as vendeur, count(*) as evenements
from public.product_events e
join public.profiles pr on pr.id = e.seller_id
group by 1
order by 2 desc
limit 5;

-- 5. RÉPARTITION PAR JOUR SUR LES 14 DERNIERS JOURS (pour voir la tendance)
select
  created_at::date                                    as jour,
  count(*) filter (where event = 'view')              as vues,
  count(*) filter (where event = 'contact')           as contacts
from public.product_events
where created_at >= now() - interval '14 days'
group by 1
order by 1 desc;
