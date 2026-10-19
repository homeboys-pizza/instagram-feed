# Homeboys Instagram feed

Keeps BOYS IN THE WILD on the Homeboys website showing the latest posts from @homeboyspizza.

- `.github/workflows/feed.yml` runs every three hours. It copies the latest posts to this repository's GitHub Pages
  site as `feed.json` plus pictures in `img/`. On Mondays it also renews the Instagram key.
- `feed.config.json` sets how many posts to show, and holds `pin` and `hide` lists. Add a post's Instagram link to a
  list, save, and the feed rebuilds.
- Secrets (Settings > Secrets and variables > Actions): `INSTAGRAM_TOKEN` (the Instagram key) and `SECRETS_WRITER`
  (a fine-grained GitHub token with Secrets read and write on this repository only, so the job can store each renewed key).
- If a run fails, nothing is published and the last good feed stays up.
