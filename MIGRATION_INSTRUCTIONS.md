# Main Branch Migration Instructions

## Overview
This PR prepares main branch to be replaced with the copilot/create-online-order-system branch content.

## Current Status
✅ Code changes completed - main will match copilot/create-online-order-system exactly when this PR is merged
✅ index.html is the order system homepage
✅ netlify.toml is configured correctly for deployment
✅ Removed node_modules and other build artifacts

## Steps to Complete Migration

### 1. Merge This PR
When this PR is merged into main, it will replace all content with the online order system.

### 2. Delete Temporary Merge Branch
After merging, delete the following temporary branch that was used for the previous merge attempt:
- `copilot/merge-online-order-system`

This can be done via GitHub UI or with:
```bash
git push origin --delete copilot/merge-online-order-system
```

### 3. Verify Netlify Deployment
After the PR is merged:
- Check that Netlify automatically deploys from main branch
- Verify the deployed site shows the online order system homepage
- Test key functionality:
  - Homepage loads correctly
  - Menu pages work
  - Cart functionality
  - Checkout process
  - Admin dashboard

### 4. Optional Cleanup
Consider deleting other old feature branches if they are no longer needed:
- `copilot/create-online-order-system-again`
- `copilot/add-chatbot-functions`
- `copilot/add-netlify-function-tables`
- `copilot/implement-stripe-checkout`
- `copilot/refactor-repo-structure`
- `copilot/rename-functions-folder`
- `copilot/troubleshoot-project-publishing`
- `copilot/update-index-html-content`
- `revert-10-copilot/rename-functions-folder`

## What Changed
This PR removes files that were mistakenly committed to main in the previous merge:
- Removed `node_modules/` directory (should be in .gitignore)
- Removed extra Netlify functions not in the order system:
  - `invia-ordine.js`
  - `pizza-giorno.js`
  - `pizze-settimana.js`
  - `voto.js`
- Removed `package.json` and `package-lock.json` (not needed in order system)
- Removed standalone `script.js` and `styles.css` files

The repository now exactly matches copilot/create-online-order-system branch.

## Supabase Security Hardening (senza impatti funzionali)

Per l'hardening richiesto su Supabase production usare questi script:

1. Audit pre-deploy:
   - `supabase/audit/20260307_security_audit.sql`
   - Verificare stato iniziale di RLS/policy/grants su `menu_items` e permessi EXECUTE su `increment_table_total`
2. Migrazione hardening:
   - `supabase/migrations/20260307022000_harden_menu_items_and_increment_table_total.sql`
   - Verificare che la migrazione completi senza errori
3. Audit post-deploy:
   - rieseguire `supabase/audit/20260307_security_audit.sql`
   - Verificare: `menu_items` con RLS attivo, `anon/authenticated` solo SELECT, `increment_table_total` eseguibile solo da `service_role`
4. Rollback (solo emergenza):
   - `supabase/migrations/20260307022000_harden_menu_items_and_increment_table_total.rollback.sql`
