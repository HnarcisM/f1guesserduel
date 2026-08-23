'use strict';

function setNoStoreHeader(res) {
    if (typeof res?.set === 'function') {
        res.set('Cache-Control', 'no-store');
        return;
    }
    res?.setHeader?.('Cache-Control', 'no-store');
}

function noStoreResponse(req, res, next) {
    setNoStoreHeader(res);
    return next();
}

module.exports = {
    noStoreResponse,
    setNoStoreHeader
};
