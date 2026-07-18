const compression = require('compression');

const DEFAULT_COMPRESSION_THRESHOLD_BYTES = 1024;

function createResponseCompressionMiddleware(options = {}) {
    const threshold = Number.isFinite(options.thresholdBytes) && options.thresholdBytes >= 0
        ? options.thresholdBytes
        : DEFAULT_COMPRESSION_THRESHOLD_BYTES;

    return compression({ threshold });
}

module.exports = {
    DEFAULT_COMPRESSION_THRESHOLD_BYTES,
    createResponseCompressionMiddleware
};
