-- Performance : index taillés pour les requêtes réellement exécutées
-- (relevées dans pg_stat_statements et les logs API Supabase), plus les
-- derniers avertissements de l'advisor « performance ».
-- Purement additif côté données : aucune ligne ni règle d'accès modifiée
-- (les politiques tasks gardent exactement la même logique).

-- 1. Listes télépro : assigned_to + category + status, triées par
--    telepro_added_at DESC, id DESC. Avant : BitmapAnd de 3 index puis tri
--    (~30 ms par page). Sert aussi lead_status_counts(p_assigned_to) en
--    index-only scan.
create index if not exists idx_leads_assigned_cat_status_added
  on public.leads (assigned_to, category, status, telepro_added_at desc, id desc);

-- 2. Compteurs du menu côté admin/secrétaire (lead_status_counts(null)) :
--    GROUP BY category, status en index-only scan au lieu de lire toute la table.
create index if not exists idx_leads_category_status
  on public.leads (category, status);

-- 3. Rappels télépro (/api/telepro/callback-due, agenda) :
--    assigned_to = ? AND status = ? AND callback_at <= now, tri callback_at.
create index if not exists idx_leads_assigned_status_callback
  on public.leads (assigned_to, status, callback_at)
  where callback_at is not null;

-- 4. Historique d'un lead : lead_id = ? ORDER BY created_at DESC LIMIT 20.
create index if not exists idx_lead_logs_lead_created
  on public.lead_logs (lead_id, created_at desc);
drop index if exists public.idx_lead_logs_lead_id; -- préfixe du précédent

-- 5. Tableau de bord admin : appels par télépro sur une période.
create index if not exists idx_lead_logs_user_created
  on public.lead_logs (user_id, created_at);
drop index if exists public.idx_lead_logs_user_id; -- préfixe du précédent

-- 6. Historique de redistribution d'un lead (lead_id = ? ORDER BY created_at).
create index if not exists idx_lead_distributions_lead_created
  on public.lead_distributions (lead_id, created_at);
drop index if exists public.idx_lead_distributions_lead_id; -- préfixe du précédent

-- 7. Index redondant : (assigned_to) est le préfixe de
--    idx_leads_assigned_telepro_added_at (assigned_to, telepro_added_at DESC).
--    Un index de moins à maintenir à chaque écriture sur leads.
drop index if exists public.idx_leads_assigned_to;

-- 8. Clés étrangères sans index (advisor « unindexed_foreign_keys »).
create index if not exists idx_lead_distributions_from_telepro on public.lead_distributions (from_telepro);
create index if not exists idx_lead_distributions_to_telepro on public.lead_distributions (to_telepro);
create index if not exists idx_lead_redistributions_created_by on public.lead_redistributions (created_by);
create index if not exists idx_sav_requests_created_by on public.sav_requests (created_by);
create index if not exists idx_tasks_completed_by on public.tasks (completed_by);

-- 9. RLS tasks : auth.uid() évalué une fois par requête et non par ligne
--    (advisor « auth_rls_initplan », même correctif que 041).
alter policy "Users see their own tasks" on public.tasks
  using (assigned_to = (select auth.uid()) or created_by = (select auth.uid()));
alter policy "Admins and secretaires see all tasks" on public.tasks
  using (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = any (array['admin'::text, 'secretaire'::text])
  ));

analyze public.leads;
analyze public.lead_logs;
analyze public.lead_distributions;
