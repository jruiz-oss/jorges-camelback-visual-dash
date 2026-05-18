# Agent instructions for this repo

This is the Camelback Resort ad dashboard — a Next.js (app-router) site that
mirrors live placements from Meta Ads, Google Ads, and StackAdapt onto a
single "live wall" view. Server components fetch the connectors in
`app/page.tsx`; the only client islands are `TopBar` and `CreativeTile`.

---

## Standing rule: keep the .md files honest

**Any time you change code, update the markdown.** This is not optional, it is
how the next person (or the next agent) avoids debugging blind.

Specifically, for every change you ship:

1. **Append a new entry to `CHANGELOG.md`** describing
   - **what** changed (file by file, with the actual mechanism — not a
     summary), and
   - **why** the change is shaped the way it is (the alternative that didn't
     work, the constraint that forced the design, the field that's documented
     vs. the one you tried first).

   Match the existing entry format: `## YYYY-MM-DD — short title`, then
   `### What changed` / `### Why this works` (or `### Why this should hold`)
   / `### Verification`. Newest entry on top.

2. **Update any other `.md` that touches what you changed.** If you alter
   deploy steps, edit `DEPLOY.md`. If you change a documented contract that
   another `.md` quotes, edit that quote.

3. **Remove stale content.** If your change deletes a feature, a field, a
   workaround, or a file — go find every `.md` that still describes it and
   delete those passages. Outdated docs are worse than no docs.

4. **Don't add `.md` files unless asked.** No new READMEs, no per-component
   markdown. The two existing docs (`CHANGELOG.md`, `DEPLOY.md`) are the
   whole surface.

This rule applies to every code change, whether it came from a user request,
a refactor, a hotfix, or your own initiative. If you only changed code and
left the markdown untouched, the change is not done.

---

## Standing rule: always provide the git push command

**After every code change, output the exact terminal command to commit and push.**
No exceptions — even for one-line edits. Always use this format:

```bash
cd "/Users/jorgeuiz/Documents/Claude/Projects/Camleback Ad View" && git add -A && git commit -m "<short description of change>" && git push
```

The commit message should be short and specific to what changed. This command
goes at the end of every response where code was modified.
