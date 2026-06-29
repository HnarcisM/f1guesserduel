function createMemoryRoomStore() {
    const rooms = new Map();

    function get(roomId) {
        return rooms.get(roomId) || null;
    }

    function set(roomId, room) {
        rooms.set(roomId, room);
        return room;
    }

    function remove(roomId) {
        rooms.delete(roomId);
    }

    function has(roomId) {
        return rooms.has(roomId);
    }

    return {
        get,
        set,
        remove,
        has
    };
}

module.exports = {
    createMemoryRoomStore
};
