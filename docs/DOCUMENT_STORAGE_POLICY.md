# Private business-document policy

Status: implementation baseline; legal retention periods require counsel approval before automated deletion is introduced.

## Scope

The production document service stores tenant and agency onboarding evidence: GST and FSSAI certificates, distributorship letters, owner PAN evidence, cancelled cheques, address proof, and explicitly classified supporting files. Invoice PDFs, statements, delivery proof, exports, and physical deletion are not silently inferred from this first slice; they require their own generation and retention workflows.

## Security boundary

- Buckets are private. No public CDN or public-read object is permitted.
- The API authenticates every list, upload, preview, download, and archive request and applies the same tenant, agency, city, region, selected-agency, or global RBAC scope as the owning record.
- Active tenant members may list and read documents owned by their own active tenant. They cannot upload, archive, or access another tenant.
- Object keys contain only environment labels, entity type, public random UUIDs, and a media extension. They never contain GSTINs, phone numbers, business names, or original file names.
- The browser and mobile app never receive storage credentials. Content is streamed through the API with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- Accepted media are PDF, JPEG, PNG, and WebP. The current maximum is 10 MiB. Declared MIME type and magic bytes must agree.
- SHA-256 and byte size are recorded at upload and checked again before every content response. A mismatch quarantines the metadata record and blocks access.

## Record lifecycle

- Each upload creates a new immutable version. Existing bytes and identity metadata are never overwritten.
- Upload, view, download, quarantine, and archive events are append-only.
- Archive requires a fresh privileged MFA check and an audit reason. Archive hides content access but retains the object and history.
- Legal hold blocks archive. No application route physically deletes documents.
- `kyc`, `financial`, `operations`, and `temporary` retention classes exist in metadata. Automated expiry is deliberately absent until written legal periods, litigation-hold procedure, and recovery validation are approved.

## Storage-provider modes

- `disabled`: production-safe default; list operations remain available for existing metadata, while new uploads and unavailable content fail closed.
- `local`: development and test only, with a private root and path-escape protection. Configuration validation rejects it in staging and production.
- `spaces`: S3-compatible DigitalOcean Spaces adapter using a private bucket and dedicated application credential.

## Production activation checklist

1. Approve the incremental Spaces cost outside the USD 45 monthly ceiling.
2. Create a private, environment-specific bucket in the approved region or nearest supported region. Do not enable a public CDN.
3. Create dedicated application credentials and verify their actual scope. If the provider credential can reach unrelated buckets, isolate the account/team further.
4. Configure encrypted App Platform variables for endpoint, region, bucket, access key, and secret; set `OBJECT_STORAGE_PROVIDER=spaces`.
5. Upload, download, digest-verify, archive, and unauthorized-access-test a non-sensitive fixture through the deployed API.
6. Configure and test an independent object backup/copy strategy. Primary-bucket availability is not a backup.
7. Record recovery time and integrity results, access-log retention, incident ownership, and credential-rotation procedure.
8. Only after steps 1–7 pass, enable `features.document_uploads` through the Super Admin control with fresh MFA and an audit reason.

## Incident handling

On suspected credential exposure, disable `features.document_uploads`, rotate the storage credential, review the document event ledger and provider logs, verify object digests, and quarantine mismatched records. Do not erase evidence during investigation. Restoration or deletion requires an approved, separately audited procedure.
