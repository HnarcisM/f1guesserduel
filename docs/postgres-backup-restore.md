# Backup și restaurare PostgreSQL

Aceste comenzi creează backup-uri logice PostgreSQL în format custom, verificabile cu `pg_restore`, și testează restaurarea într-o bază separată în CI.

## Cerințe

Folosește una dintre variante:

- `pg_dump` și `pg_restore` instalate local, de preferat cu aceeași versiune majoră ca serverul PostgreSQL;
- Docker, configurând `POSTGRES_TOOLS_DOCKER_IMAGE`, de exemplu `postgres:17-alpine`.

Nu salva connection string-urile reale în repository sau în istoricul shell-ului partajat.

## Creare backup

Cu PostgreSQL client tools instalate local:

```bash
POSTGRES_BACKUP_DATABASE_URL='postgresql://user:password@host/database?sslmode=require' \
npm run postgres:backup
```

Cu Docker:

```bash
POSTGRES_TOOLS_DOCKER_IMAGE=postgres:17-alpine \
POSTGRES_BACKUP_DATABASE_URL='postgresql://user:password@host/database?sslmode=require' \
npm run postgres:backup
```

Implicit, fișierele sunt scrise în `backups/postgres/`:

- `*.dump` — arhiva PostgreSQL custom;
- `*.dump.json` — timestamp, sursă fără parolă, dimensiune și checksum SHA-256.

Poți alege explicit calea:

```bash
npm run postgres:backup -- --output /cale/securizata/f1guesser.dump
```

Un fișier existent nu este suprascris fără `--overwrite`.

## Verificare fără restaurare

```bash
npm run postgres:backup:verify -- --file /cale/f1guesser.dump
```

Verificarea recalculează SHA-256 când metadata există și rulează `pg_restore --list` pentru a valida structura arhivei. Nu este necesară o conexiune la baza de date pentru această comandă.

## Restaurare testată într-o bază separată

Creează o bază goală de staging/restore și rulează:

```bash
POSTGRES_RESTORE_DATABASE_URL='postgresql://user:password@host/f1guesser_restore?sslmode=require' \
npm run postgres:restore -- \
  --file /cale/f1guesser.dump \
  --confirm RESTORE
```

Restaurarea folosește implicit:

- verificare checksum și `pg_restore --list` înainte de orice modificare;
- `--single-transaction` și `--exit-on-error`;
- `--clean --if-exists`;
- `--no-owner --no-privileges` pentru portabilitate între provideri.

Pentru a păstra obiectele existente, folosește `--no-clean`. Această variantă poate eșua dacă obiectele din backup există deja.

Dacă metadata arată că ținta este aceeași bază din care a fost creat backup-ul, comanda refuză restaurarea. Pentru un disaster recovery intenționat pe baza originală, după verificarea manuală a hostului și bazei:

```bash
npm run postgres:restore -- \
  --file /cale/f1guesser.dump \
  --confirm RESTORE \
  --allow-source-target-match
```

## Test automat de restore

`test/integration/postgresBackupRestore.integration.test.js`:

1. aplică migrările aplicației;
2. inserează un marker unic în baza sursă;
3. creează și verifică backup-ul;
4. creează o bază PostgreSQL separată;
5. restaurează arhiva;
6. verifică markerul și tabela `schema_migrations` în baza restaurată;
7. șterge baza temporară.

CI rulează testul cu PostgreSQL 17 și `pg_dump`/`pg_restore` din imaginea `postgres:17-alpine`.

## Politică operațională minimă

- Creează backup-uri automate cel puțin zilnic după ce există utilizatori reali.
- Păstrează cel puțin o copie în afara providerului bazei de date.
- Criptează storage-ul backupurilor și limitează accesul: arhiva conține date de cont, hash-uri de parolă, sesiuni și statistici.
- Definește o retenție, de exemplu 7 backup-uri zilnice și 4 săptămânale.
- Rulează periodic un restore drill într-o bază separată; un backup neverificat nu este suficient.
- Nu restaura direct peste producție înainte de a valida backup-ul într-un mediu separat.
