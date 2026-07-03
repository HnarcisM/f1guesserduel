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
    let lastSaveError = null;

    const persistenceOptions = {
        driversRepository: options.driversRepository
    };

    for (const room of readPersistedRooms(persistenceFilePath, persistenceOptions)) {
        rooms.set(room.roomId, room);
    }

    function get(roomId) {
        return rooms.get(roomId) || null;
    }

    function set(roomId, room) {
        rooms.set(roomId, room);
        markDirty();
        return room;
    }

    function remove(roomId) {
        const removed = rooms.delete(roomId);
        if (removed) markDirty();
        return removed;
    }

    function has(roomId) {
        return rooms.has(roomId);
    }

    function values() {
        return [...rooms.values()];
    }

    function saveNow() {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }

        try {
            lastSaveError = null;
            return writePersistedRooms(persistenceFilePath, values());
        } catch (error) {
            lastSaveError = error;
            throw error;
        }
    }

    function scheduleSave() {
        if (saveTimer) return;

        saveTimer = setTimeout(() => {
            saveTimer = null;
            try {
                saveNow();
            } catch (error) {
                console.error('[rooms] Nu am putut salva camerele persistente:', error.message);
            }
        }, saveDebounceMs);

        if (typeof saveTimer.unref === 'function') {
            saveTimer.unref();
        }
    }

    function markDirty() {
        if (!persistenceFilePath) return;
        if (saveDebounceMs === 0) {
            saveNow();
            return;
        }
        scheduleSave();
    }

    function close() {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
            saveNow();
        }
    }

    function getLastSaveError() {
        return lastSaveError;
    }

    return {
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
