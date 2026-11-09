-- Nouvelle catégorie de lead : « Vidéo PAC Atlantic 990 € ».
-- (La catégorie clim_1euro est désormais affichée « PAC image Atlantic 990 € » :
--  seul le libellé change côté application, la valeur en base reste clim_1euro.)
ALTER TYPE lead_category ADD VALUE IF NOT EXISTS 'video_pac_atlantic_990' AFTER 'clim_1euro';
