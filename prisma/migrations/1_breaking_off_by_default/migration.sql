-- A post is "breaking" only when someone marks it; the image otherwise says NEWS.
ALTER TABLE `Post` ALTER COLUMN `showBreaking` SET DEFAULT false;
