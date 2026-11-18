-- Nouveau statut de lead : « Autre » (accessible par tous les rôles), en fin de liste
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'autre';
