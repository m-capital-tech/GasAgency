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

1. Record the separately approved incremental Spaces cost outside the original USD 45 monthly ceiling.
2. Confirm the private `munna-gas-connect-production-documents` bucket in `sgp1`. Do not enable a public CDN or public file listing.
3. Use the dedicated bucket-scoped Read/Write/Delete application credential. Do not expose it to the dashboard, mobile app, worker, or repository.
4. Configure encrypted App Platform variables for endpoint, region, bucket, access key, and secret; set `OBJECT_STORAGE_PROVIDER=spaces`.
5. Upload, download, digest-verify, archive, and unauthorized-access-test a non-sensitive fixture through the deployed API. Direct unauthenticated object and bucket-list requests must fail; the API download must reproduce the fixture's SHA-256 digest; archived content must return `document_unavailable`.
6. Configure and test an independent object backup/copy strategy. Primary-bucket availability is not a backup.
7. Record recovery time and integrity results, access-log retention, incident ownership, and credential-rotation procedure.
8. Only after steps 1–7 pass, enable `features.document_uploads` through the Super Admin control with fresh MFA and an audit reason.

### Controlled production acceptance

Keep `features.document_uploads` disabled while the App Platform storage variables are applied and the API is redeployed. Confirm `/health/ready` first, then verify that unauthenticated requests to both the bucket root and a known object URL return `403`; a private bucket must not list or serve objects directly.

Use a small non-sensitive PDF fixture with a locally recorded SHA-256 digest. A Super Admin with a fresh MFA session may then enable the feature with a reason that identifies the controlled storage acceptance test. Upload the fixture from the private-documents panel of one test agency or tenant, download it through the application, and compare the downloaded digest and byte size to the original. Verify that a signed-out application request returns `401` and, when a limited-scope test user is available, that an out-of-scope request returns `403`.

Archive the fixture with an audit reason and confirm that the record is shown as archived, a subsequent content request returns `409 document_unavailable`, and the private object is retained. If upload, retrieval, integrity, authorization, or archive behavior fails, immediately disable the feature again and preserve the failed record and logs for diagnosis. Do not physically delete the archived acceptance fixture; it is evidence of the release check. Record the deployment identifier, document public ID, original and downloaded digests, HTTP results, tester, and timestamp without recording credentials or session tokens.

## Incident handling

On suspected credential exposure, disable `features.document_uploads`, rotate the storage credential, review the document event ledger and provider logs, verify object digests, and quarantine mismatched records. Do not erase evidence during investigation. Restoration or deletion requires an approved, separately audited procedure.
