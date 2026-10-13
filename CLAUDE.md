# Kanakku

## Commits

Every commit credits Jisnu as a co-author. End each commit message with:

```
Co-Authored-By: Jisnu-Dev <imjisnu@gmail.com>
```

(alongside any other attribution lines). Push to `main`; Vercel deploys it automatically.

## Checking a change

- `npm test` runs the split, balance, checklist and ticket-reading tests.
- `npm run build` must pass before pushing.
- New tables or columns go in `SCHEMA` in `lib/db.ts` as `if not exists` statements, and the
  `to_regclass(...)` check there must name the newest object, or existing databases won't pick
  the change up.
