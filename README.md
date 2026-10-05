# embuddies

Hardware project discovery and build platform. The public site is static and deploys to GitHub Pages. Community publishing uses a separately configured Supabase project; without it, the curated directory still works and creators can use the reviewed GitHub issue form.

## Run locally

Serve the repository root over HTTP, for example `npx serve . -l 4173`. Open `/` or `/en/`. Opening HTML files directly will not load the JSON catalog.

## Enable community publishing

1. Create a Supabase project. Run [`platform/schema.sql`](platform/schema.sql) in its SQL editor on a new database. The schema creates project submissions, published projects, build reports, partner kits, event counts and row-level access rules.
2. Enable email magic-link sign-in. Set the Site URL to `https://embuddies.com`. Allow `https://embuddies.com/submit/**`, `https://embuddies.com/reports/submit/**`, and the exact `https://embuddies.com/moderation/` Auth redirects; add matching local development URLs. The path-scoped wildcards cover the language and project query parameters. Follow the [Supabase redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls) when configuring the allowlist.
3. Put the project's URL and **public anon key only** in [`platform/config.js`](platform/config.js). Never put a service-role key in this static repository.
4. Sign in once at `/submit/`, find your user UUID in Supabase Auth, then run `insert into public.platform_admins (user_id) values ('YOUR-USER-UUID');` in the SQL editor. The project and build-report review queue is at `/moderation/`.
5. Before opening public accounts, publish privacy and content rules appropriate to the countries served, confirm mail deliverability, and test the workflow with a non-admin account. A production database, domain setup and operational review remain external setup tasks.

Published content is copied from a submission only by `review_project_submission`. Author revisions create another submission rather than editing public content directly. Media is kept in a private bucket and signed only for its author, admins or published projects. Accounts can update their own drafts; anonymous visitors can read approved work. Draft content does not enter the public project query.

## Curated projects

Edit [`projects/catalog.json`](projects/catalog.json). Keep one entry per verified original project with a real source URL. `openness` distinguishes `open`, `partial`, `restricted` and `showcase`. `readiness` distinguishes `documented`, `reference` and `showcase`. Use `documented` only when a current parts list and build guide are available. Do not invent a BOM or claim that a project is independently reproducible without checking it. The initial catalog has eight source-linked projects; reaching approximately twenty is an editorial milestone, not a generated-data target.

For every new entry, check the original author's attribution and media permission, current hardware revision, resource links, licensing and whether parts can be sourced. Keep a short internal record of the review. Project images provided by authors must be licensed or uploaded by the rights holder.

## Partner-kit pilot

There are no kits for sale on the site. A verified partner kit is entered in `public.partner_kits` by a database administrator only after compatibility, revision, delivery regions, price and partner support have been checked. `active = false` keeps it private until launch. The partner handles payment, shipping and after-sales support. Do not copy partner offers into author-submitted project data.

Project pages record outbound kit clicks, not orders. Reconcile confirmed partner orders into `public.partner_orders` using a non-personal partner reference, region, amount, commission, fulfillment status and support-issue flag. `platform_metrics()` separates clicks, orders and support issues. Partner reports are the source of truth for completed sales; browser click counts are directional and can be affected by blocking or bots.

## Operating cadence

- Weeks 1–6: verify and publish a varied catalog toward twenty entries. Interview at least ten creators and ten prospective builders. Record what each person could not find, build or buy.
- Weeks 7–12: invite creators to publish through the reviewed submission flow. Review rights, openness label, BOM/build claims and external links before approving; send actionable rejection notes.
- Months 3–6: pilot two or three partner kits only where build demand and fulfillment are confirmed. Review the project-to-BOM-to-kit-click-to-order funnel and after-sales issues monthly.
- Expand commerce or agent infrastructure only after repeat creator submissions, real builds and positive order contribution after commissions and operating costs.

Do not interpret the static site or schema as evidence that interviews, partnerships, kit sales, payments, legal review or agent development have been completed.
