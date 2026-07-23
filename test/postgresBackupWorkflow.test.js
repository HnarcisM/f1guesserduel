const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');
const workflowPath = path.join(projectRoot, '.github', 'workflows', 'postgres-backup.yml');
const documentationPath = path.join(projectRoot, 'docs', 'postgres-backup-restore.md');

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

test('scheduled PostgreSQL workflow creates, verifies, encrypts and retains backups', () => {
    const workflow = read(workflowPath);

    assert.match(workflow, /cron:\s*'17 3 \* \* 0'/);
    assert.match(workflow, /secrets\.POSTGRES_BACKUP_DATABASE_URL/);
    assert.match(workflow, /secrets\.POSTGRES_BACKUP_ENCRYPTION_KEY/);
    assert.match(workflow, /npm run postgres:backup -- --output/);
    assert.match(workflow, /npm run postgres:backup:verify -- --file/);
    assert.match(workflow, /npm run postgres:backup:encrypt -- --file/);
    assert.match(workflow, /BACKUP_FILE \}\}\.enc/);
    assert.match(workflow, /BACKUP_FILE \}\}\.json\.enc/);
    assert.match(workflow, /retention-days:\s*30/);
    assert.match(workflow, /test ! -e "\$BACKUP_FILE"/);
    assert.doesNotMatch(workflow, /path:\s*\|\s*\n\s*\$\{\{ env\.BACKUP_FILE \}\}\s*$/m);
});

test('scheduled PostgreSQL workflow performs an isolated monthly restore drill', () => {
    const workflow = read(workflowPath);

    assert.match(workflow, /postgres-restore:/);
    assert.match(workflow, /first weekly run of the month/);
    assert.match(workflow, /npm run postgres:restore --/);
    assert.match(workflow, /--confirm RESTORE/);
    assert.match(workflow, /127\.0\.0\.1:5432\/f1guesser_restore/);
    assert.match(workflow, /SELECT count\(\*\) FROM schema_migrations;/);
    assert.doesNotMatch(workflow, /--allow-source-target-match/);
});

test('PostgreSQL backup documentation explains secrets, monitoring and initial frequency', () => {
    const documentation = read(documentationPath);

    assert.match(documentation, /POSTGRES_BACKUP_DATABASE_URL/);
    assert.match(documentation, /POSTGRES_BACKUP_ENCRYPTION_KEY/);
    assert.match(documentation, /URL-ul \*\*extern\*\*/);
    assert.match(documentation, /backup în fiecare duminică/);
    assert.match(documentation, /restore drill/);
    assert.match(documentation, /30 de zile/);
    assert.match(documentation, /backup zilnic/);
});
