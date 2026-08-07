# Self-Hosted operations

Run commands from `deploy/self-hosted`. The application writes logs to standard
output. RefKit does not run a migration during normal application startup.

## Health and logs

```bash
docker compose ps
docker compose logs --tail=200 app
docker compose logs --tail=200 postgres
docker compose logs --tail=200 backup-scheduler
```

- `GET /api/health/live` returns 200 when the process can answer HTTP.
- `GET /api/health/ready` returns 200 only when configuration is valid, the
  database is reachable, and its latest migration timestamp and hash match the
  image metadata.
- Email providers and outgoing App webhook destinations are optional external
  dependencies and do not make the application unready.

The migration job acquires a fixed PostgreSQL advisory lock. A second migration
runner exits without changing the database. Before applying anything, the job
checks that every stored migration is an exact immutable prefix of the image's
migration journal. A newer, missing, reordered, or modified migration stops the
operation with an error.

## Scheduled backups

`backup-scheduler` creates a PostgreSQL custom-format logical dump and a gzip
archive of the uploads volume every 24 hours by default. Each bundle contains:

- `database.dump`
- `uploads.tar.gz`
- a release and creation-time manifest
- SHA-256 checksums

The scheduler logs source sizes, available destination space, the completed
filename, retention deletions, and failures. A failed job exits so Compose shows
and retries the failure. Monitor that service and alert when it is stopped or
restarting.

Scheduled backups keep the application online. The database dump is a
transactionally consistent PostgreSQL snapshot, and the upload archive is a
filesystem snapshot taken immediately afterward. An asset replaced in that
small interval can make the pair disagree. Use the cold operation before every
upgrade and whenever an exact database-plus-uploads recovery point is required:

```bash
./bin/backup
```

That command stops application writes and the scheduler, creates the bundle,
then restores the previous running services. It does not stop PostgreSQL.

Copy completed `refkit-*.tar.gz` files to encrypted off-server storage. Local
retention is 14 days by default. Test restores regularly on a clean host.

## Recovery-secret set

Ordinary data bundles never contain `.env` or credentials. Protect a separate
copy of:

- the exact RefKit image digest and version
- `.env`, or all values needed to reconstruct it
- `PAYOUT_DETAILS_ENCRYPTION_KEY`, whose loss makes encrypted payout and webhook records unrecoverable
- authentication, IP hashing, database, email, and setup secrets
- DNS and reverse-proxy configuration

Do not store the secret set unencrypted beside ordinary backups.

## Administrator email recovery

If the only administrator loses access to the existing email address, first
repair the instance email configuration, then replace the administrator email
from the running application container:

```bash
docker compose exec app node apps/app/scripts/self-hosted/recover-admin.mjs admin@example.com
```

The command updates the existing administrator, marks the new address
unverified, and revokes its sessions. It does not create another administrator
or open registration. Restart RefKit, then request a sign-in link for the new
address.

## Restore onto a clean host

1. Install the supported Docker and Compose versions.
2. Copy `deploy/self-hosted` from the release matching the backup manifest.
3. Recreate `.env` from the separately protected secret set. Its
   `REFKIT_VERSION` and `REFKIT_IMAGE` must match the backup.
4. Copy the backup bundle into `BACKUP_DIR`.
5. Confirm the destructive restore:

   ```bash
   RESTORE_CONFIRM=restore-refkit ./bin/restore refkit-YYYYMMDDTHHMMSSZ-VERSION.tar.gz
   ```

   Replace `refkit` in the confirmation value if `POSTGRES_DB` differs.

The restore completely lists and preflight-extracts both archives before
dropping the target database. It rejects unsafe paths, links, and special
files, then verifies checksums, format, RefKit version, and the exact pinned
image reference. It restores the database and uploads, fixes upload ownership
and permissions for the non-root application user, starts the matching image,
and waits for readiness. Any failure leaves the application stopped.

Afterward, complete the golden product checks: sign in, load an uploaded asset,
read Programs and Affiliates, inspect commission and payout history, and test a
new API-reported test payment.

## Upgrade

Read the target release notes first. Only upgrade origins and intermediate
versions listed there are supported. Pulling `latest`, database downgrade, and
skipping a required intermediate release are unsupported.

Use the exact target image digest and release version:

```bash
./bin/upgrade \
  ghcr.io/refkitnet/refkit@sha256:TARGET_DIGEST \
  TARGET_VERSION
```

The operation:

1. pulls the target before downtime and verifies its OCI version label
2. stops application writes
3. records the previous and target image information
4. creates the required cold pre-migration backup
5. updates `.env` to the target image and version
6. runs the locked migration from that exact target image
7. starts the application and waits for version-aware readiness
8. restarts scheduled backups

Upgrade records are stored beside backups as `upgrade-*.txt`. If migration or
readiness fails, the application remains stopped and the command prints the
previous image and pre-migration backup.

## Rollback

Rollback means restoring the pre-migration backup with the previous image. It
never means running a down-migration.

1. Restore `REFKIT_IMAGE` and `REFKIT_VERSION` in `.env` from the upgrade record.
2. Ensure the previous pinned image is available.
3. Restore the named pre-migration bundle:

   ```bash
   RESTORE_CONFIRM=restore-refkit ./bin/restore BACKUP_FILENAME
   ```

Do not start the previous image against a database whose target migration
succeeded. Restore first.

## Capacity and failure handling

- PostgreSQL data, uploads, and backups require independent free-space
  monitoring.
- Backup creation refuses to start unless the destination has twice the current
  database-plus-upload size plus `BACKUP_MIN_FREE_MB`.
- A full database volume, upload volume, or backup filesystem is an operator
  incident. RefKit does not delete product data to make space.
- Never copy a running PostgreSQL volume as a backup.
- Keep at least one verified off-server backup outside the host failure domain.
