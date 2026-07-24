const {
    DEFAULT_AVATAR_KEY,
    normalizeAvatarKey
} = require('../auth/authService');

const DEFAULT_DUEL_LEVEL = 1;
const MAX_PUBLIC_DUEL_LEVEL = 10_000;

function normalizeDuelLevel(value) {
    const level = Number(value);
    return Number.isSafeInteger(level) && level >= DEFAULT_DUEL_LEVEL && level <= MAX_PUBLIC_DUEL_LEVEL
        ? level
        : DEFAULT_DUEL_LEVEL;
}

function normalizeDuelUsername(value, fallback = 'Guest') {
    if (typeof value !== 'string') return fallback;
    const username = value.trim();
    return username ? username.slice(0, 20) : fallback;
}

function buildPublicMemberIdentity(source = {}, fallbackUsername = 'Guest') {
    return {
        username: normalizeDuelUsername(source?.username, fallbackUsername),
        avatarKey: normalizeAvatarKey(source?.avatarKey || source?.avatar_key) || DEFAULT_AVATAR_KEY,
        level: normalizeDuelLevel(source?.level)
    };
}

function applyMemberIdentity(member, source = {}, fallbackUsername = null) {
    if (!member) return false;
    const identity = buildPublicMemberIdentity(
        source,
        fallbackUsername || member.username || member.guestUsername || 'Guest'
    );
    const changed = member.username !== identity.username
        || member.avatarKey !== identity.avatarKey
        || member.level !== identity.level;

    member.username = identity.username;
    member.avatarKey = identity.avatarKey;
    member.level = identity.level;
    return changed;
}

module.exports = {
    DEFAULT_DUEL_LEVEL,
    MAX_PUBLIC_DUEL_LEVEL,
    normalizeDuelLevel,
    normalizeDuelUsername,
    buildPublicMemberIdentity,
    applyMemberIdentity
};
