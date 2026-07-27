# 08 · Enterprise production operations

Application code is only one control layer. A high-value deployment is not
approved until every applicable control below has an owner and evidence.

## Identity and perimeter

- Serve the panel on a dedicated custom domain with HTTPS; disable the
  `workers.dev` route after verification.
- Put Cloudflare Access in front of `/admin*`, `/api/login`, `/api/logout`,
  `/api/me`, `/api/uploads*`, `/api/properties*`, `/api/posts*`,
  `/api/reviews*` and `/api/chatbot*`.
- Use the corporate IdP, require phishing-resistant MFA where available, keep
  Access sessions short and document break-glass access.
- Keep `/api/public/*`, `/api/images/*` and `/api/health` public only when the
  business design requires it. Public does not mean confidential.
- Use least-privilege Cloudflare/Neon/GitHub roles; prohibit shared operator
  accounts and review access quarterly.

## Data protection

- Separate database roles, branches, buckets and signing secrets per client.
- Define data classification and retention. Do not put secrets, private
  contracts or personal data into chatbot prompts/documents.
- Enable Neon backups appropriate to recovery objectives. Perform and record
  restore tests, not only backup-success checks.
- Monitor R2 cleanup errors and reconcile stored keys against database
  references. Apply a reviewed retention/lifecycle policy for orphaned data.
- Document deletion semantics: validated images are public to anyone holding
  their URL; PDF and unknown stored types require the configured administrator
  session. A future public-document feature needs a separate explicit policy.

## Detection and response

- Send Worker logs/traces and Access authentication events to monitored
  storage/SIEM with retention matching policy.
- Alert on repeated 401/403/429/5xx responses, Access denials, deployment
  events, secret changes and unusual AI usage/cost.
- Maintain named on-call ownership, escalation contacts, credential-rotation
  procedures and a tested incident-response runbook.
- Never log credentials, cookies, authorization headers, request bodies
  containing client data or raw chatbot documents.

## Secure delivery

- Protect the main branch and require reviewed pull requests plus passing
  CodeQL, Semgrep, Trivy, dependency audit, tests and typecheck.
- Pin CI actions and use short-lived/OIDC credentials where supported.
- Deploy immutable reviewed commits; record commit SHA, Worker version,
  migration and approver. Separate staging and production resources.
- Patch dependencies on a defined SLA and repeat threat modeling after adding
  endpoints, file types, identity providers, AI tools or data classes.
- Run independent penetration testing before first high-value launch and
  periodically thereafter. Add authenticated DAST in a controlled staging
  environment.

## Release evidence

The release record must contain:

- clean `npm run security:audit` and Wrangler dry-run,
- secret scan and dependency/SAST results,
- migration/rollback and backup/restore evidence,
- Access/MFA and CORS policy screenshots or exported configuration,
- post-deploy negative smoke tests,
- known risks, owners and acceptance dates.

No checklist or tool output creates a guarantee of perfect security. Production
approval is a risk decision supported by evidence and ongoing operations.
