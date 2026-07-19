const {
    readPersistedRooms,
    writePersistedRooms
} = require('./roomPersistence');

function createPersistentRoomStore(options = {}) {
    const persistenceFilePath = options.persistenceFilePath;
    const saveDebounceMs = Number.isFinite(options.saveDebounceMs) && options.saveDebounceMs >= 0
        ? options.saveDebounceMs
        : 250;
    const rooms = new Map();
    let saveTimer = null;
    let savePromise = null;
    let closePromise = null;
    let dirtyRevision = 0;
    let persistedRevision = 0;
    let lastSavedRoomCount = 0;
    let lastSaveError = null;
    let isClosing = false;
    const logger = options.logger || console;
    const writeRooms = options.writePersistedRooms || writePersistedRooms;

    const persistenceOptions = {
        driversRepository: options.driversRepository
    };

    const restoredRooms = Array.isArray(options.initialRooms)
        ? options.initialRooms
        : readPersistedRooms(persistenceFilePath, persistenceOptions);

    for (const room of restoredRooms) {
        rooms.set(room.roomId, room);
    }

    function get(roomId) {
        return rooms.get(roomId) || null;
    }

    function set(roomId, room) {
        rooms.set(roomId, room);
        markDirty(roomId);
        return room;
    }

    function remove(roomId) {
        const removed = rooms.delete(roomId);
        if (removed) markDirty(roomId, { touchActivity: false });
        return removed;
    }

    function has(roomId) {
        return rooms.has(roomId);
    }

    function values() {
        return [...rooms.values()];
    }

    function clearSaveTimer() {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
    }

    async function drainPendingSaves() {
        while (persistedRevision < dirtyRevision) {
            const revisionToPersist = dirtyRevision;

            try {
                lastSavedRoomCount = await writeRooms(persistenceFilePath, values());
                persistedRevision = revisionToPersist;
                lastSaveError = null;
            } catch (error) {
                lastSaveError = error;
                throw error;
            }
        }

        return lastSavedRoomCount;
    }

    function saveNow() {
        clearSaveTimer();
        if (!persistenceFilePath) return Promise.resolve(0);

        if (dirtyRevision === persistedRevision && !savePromise) {
            dirtyRevision += 1;
        }

        if (!savePromise) {
            const trackedSave = drainPendingSaves().finally(() => {
                if (savePromise === trackedSave) savePromise = null;
            });
            savePromise = trackedSave;
        }

        return savePromise;
    }

    function logSaveError(error) {
        logger?.error?.('[rooms] Nu am putut salva camerele persistente.', { error });
    }

    function startSave() {
        saveNow().catch(logSaveError);
    }

    function scheduleSave() {
        if (saveTimer || isClosing) return;

        saveTimer = setTimeout(() => {
            saveTimer = null;
            startSave();
        }, saveDebounceMs);

        if (typeof saveTimer.unref === 'function') {
            saveTimer.unref();
        }
    }

    function markDirty(roomId = null, { touchActivity = true } = {}) {
        if (!persistenceFilePath) return;
        if (touchActivity) {
            const targetRoom = typeof roomId === 'string' ? rooms.get(roomId) : null;
            if (targetRoom) {
                targetRoom.inactiveSince = null;
            } else if (!roomId) {
                for (const room of rooms.values()) room.inactiveSince = null;
            }
        }
        dirtyRevision += 1;

        if (saveDebounceMs === 0) {
            startSave();
            return;
        }
        scheduleSave();
    }

    function close() {
        if (closePromise) return closePromise;

        isClosing = true;
        clearSaveTimer();
        closePromise = dirtyRevision > persistedRevision || savePromise
            ? saveNow()
            : Promise.resolve(lastSavedRoomCount);

        return closePromise;
    }

    function getLastSaveError() {
        return lastSaveError;
    }

    return {
        provider: 'file',
        get,
        set,
        remove,
        has,
        values,
        markDirty,
        saveNow,
        close,
        getLastSaveError
    };
}

module.exports = {
    createPersistentRoomStore
};
