const { hashPassword, verifyPassword } = require('./passwordService');

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeUsername(username) {
    return String(username || '').trim();
}

function sanitizeUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        createdAt: row.createdAt || row.created_at
    };
}

function createAuthService(db, sessionService) {
    const createUserStmt = db.prepare(`
        INSERT INTO users (username, email, password_hash, last_seen_at)
        VALUES (@username, @email, @passwordHash, datetime('now'))
    `);

    const findByEmailStmt = db.prepare(`
        SELECT id, username, email, password_hash, created_at AS createdAt
        FROM users
        WHERE email = ?
    `);

    const findByIdStmt = db.prepare(`
        SELECT id, username, email, created_at AS createdAt
        FROM users
        WHERE id = ?
    `);

    const updateLastSeenStmt = db.prepare(`
        UPDATE users SET last_seen_at = datetime('now') WHERE id = ?
    `);

    function validateRegisterInput({ username, email, password }) {
        const cleanUsername = normalizeUsername(username);
        const cleanEmail = normalizeEmail(email);

        if (!USERNAME_REGEX.test(cleanUsername)) {
            return 'Username-ul trebuie să aibă 3-20 caractere și poate conține doar litere, cifre sau underscore.';
        }

        if (!EMAIL_REGEX.test(cleanEmail)) {
            return 'Email-ul nu este valid.';
        }

        if (typeof password !== 'string' || password.length < 8) {
            return 'Parola trebuie să aibă minimum 8 caractere.';
        }

        return null;
    }

    async function register({ username, email, password }) {
        const validationError = validateRegisterInput({ username, email, password });
        if (validationError) {
            return { ok: false, status: 400, message: validationError };
        }

        const cleanUsername = normalizeUsername(username);
        const cleanEmail = normalizeEmail(email);

        try {
            const result = createUserStmt.run({
                username: cleanUsername,
                email: cleanEmail,
                passwordHash: await hashPassword(password)
            });

            const user = findByIdStmt.get(result.lastInsertRowid);
            const session = sessionService.createSession(user.id);
            return { ok: true, user: sanitizeUser(user), session };
        } catch (error) {
            if (error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { ok: false, status: 409, message: 'Username-ul sau email-ul este deja folosit.' };
            }

            throw error;
        }
    }

    async function login({ email, password }) {
        const cleanEmail = normalizeEmail(email);
        if (!EMAIL_REGEX.test(cleanEmail) || typeof password !== 'string' || password.length === 0) {
            return { ok: false, status: 400, message: 'Email sau parolă invalidă.' };
        }

        const userRow = findByEmailStmt.get(cleanEmail);
        if (!userRow || !(await verifyPassword(password, userRow.password_hash))) {
            return { ok: false, status: 401, message: 'Email sau parolă greșită.' };
        }

        updateLastSeenStmt.run(userRow.id);
        const session = sessionService.createSession(userRow.id);
        return { ok: true, user: sanitizeUser(userRow), session };
    }

    function getUserById(userId) {
        return sanitizeUser(findByIdStmt.get(userId));
    }

    return {
        register,
        login,
        getUserById
    };
}

module.exports = {
    createAuthService
};
