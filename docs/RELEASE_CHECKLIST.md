# Release Checklist

Use this checklist before merging a product or deployment change.

## Local quality

- [ ] `npm ci` completes without dependency errors.
- [ ] `npm run quality` passes.
- [ ] `npm run test:coverage -w apps/web` was reviewed for unexpected coverage drops.
- [ ] `npm run validate:migrations` passes when database files changed.
- [ ] Headless Playwright smoke and accessibility checks pass.

## Runtime and data

- [ ] The change was tested against the intended Supabase environment.
- [ ] API errors return a controlled response and do not expose secrets.
- [ ] Catalog or migration changes have a backup or rollback path.
- [ ] No production-only environment variable was copied into source control.

## Product and accessibility

- [ ] Loading, empty, and error states remain understandable.
- [ ] Keyboard focus and accessible names were checked for changed controls.
- [ ] Public route metadata and canonical URLs are still correct.

## Deployment

- [ ] `NEXT_PUBLIC_SITE_URL` matches the public URL.
- [ ] OAuth callback URLs match the deployed environment.
- [ ] The deployed health endpoint responds successfully.
- [ ] Logs and Sentry show no new unexpected errors after deployment.
