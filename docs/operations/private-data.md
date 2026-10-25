# Backups and private research data

## Recovery layers

- GitHub Actions retains only AES-256-GCM encrypted application dumps and verification metadata
  for 30 days. This is short-term release recovery, not permanent storage.
- Private `m97j/archive-private-data` retains encrypted, restore-verified snapshots and approved
  research exports. The workflow refuses a public dataset and verifies the uploaded file hash.
- Decryption keys stay outside that repository: `ARCHIVE_BACKUP_ENCRYPTION_KEY` is a 32-byte key
  represented as 64 hexadecimal characters in GitHub `Production` Secrets. It is not a password
  or an HF token. Keep an independent copy in a password manager/offline recovery store.
- The initial backup and a Windows DPAPI-protected key copy are also retained locally. DPAPI
  depends on the Windows user/machine and is not an independent disaster-recovery key copy.

The dump covers application `public` and, when present, `drizzle` schemas. Supabase-managed Auth
and Storage are excluded and are not modified by this migration path. Use the platform's separate
backup/export procedure for those services. This is not a claim of full-project point-in-time recovery.

`packages/db/scripts/restore-backup.mjs` authenticates/decrypts an encrypted dump into a **new**
local file; it never restores production automatically. Put the key in the short-lived process
environment, run `node packages/db/scripts/restore-backup.mjs encrypted.dump.aesgcm recovered.dump`,
then restore into an isolated PostgreSQL instance for inspection. Never paste a key into chat,
command arguments, committed scripts or shell history.

The production migration workflow runs read-only planning by default. Explicit `apply=true`
requires a fresh snapshot, successful isolated restoration, encryption/decryption verification,
an Actions artifact and a hash-verified private HF copy. Changing rows after backup invalidates the
migration gate. Pause background writes during future releases requiring this gate. Apply only
backwards-compatible changes before deploying new clients; retain original data until independently reviewed.

## Research export boundary

Creating the dataset does **not** enable visitor tracking. No new activity collection or model
training is started by this release. Future exports should be produced by the private worker,
not browsers, with a repository-scoped `HF_DATASET_TOKEN` in HF Secrets.

Optional visitor raw activity now belongs in a **separate private HF Bucket**, with independent
short-session and time-bounded model-improvement choices. It must not be committed to this
backup Dataset's history. See [session activity](session-activity.md) for the disabled-by-default
capture, deletion capabilities, real scheduled expiry and activation gates. No existing Dataset
snapshot is migrated or deleted by that change.

Only reviewed, purpose-compatible research exports should become versioned Dataset snapshots.
Query text/embeddings are not captured by the activity feature. Corpus embeddings may use
PostgreSQL/pgvector for serving when capacity permits, with approved research snapshots in a
separate Dataset. A serving index/cache and a training dataset have different lifetimes.

Before collection is enabled, define the purpose, opt-in/opt-out behavior, pseudonymous IDs,
retention period, deletion process and access scope. Do not retain raw IPs, email addresses,
passwords, tokens, private document text or unrestricted query text by default. Training requires
an explicitly approved data selection; repository privacy alone is not consent.

Use batched, date-partitioned Parquet/JSONL exports rather than one HF commit per click. Each
batch needs schema/model/tokenizer/corpus versions, source hashes and consent/retention metadata.
Private data must not be sent to public knowledge-engine demos; send only approved minimal
features. HF Git/Xet history can retain old versions after a normal file deletion, so effective
erasure needs a documented history/storage cleanup procedure, not just deleting the latest file.
