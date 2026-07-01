function normalizeStatusCode(error) {
    const status = Number(error?.status || error?.statusCode || 500);
    return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function isJsonParseError(error) {
    return Boolean(error) && error.type === 'entity.parse.failed';
}

function getPublicMessage(error, statusCode, isProduction) {
    if (isJsonParseError(error)) {
        return 'Body-ul requestului nu conține JSON valid.';
    }

    if (statusCode >= 500) {
        return isProduction
            ? 'A apărut o eroare internă. Încearcă din nou mai târziu.'
            : (error?.message || 'Internal Server Error');
    }

    return error?.message || 'Request invalid.';
}

function createErrorPayload(error, options = {}) {
    const isProduction = options.isProduction === true;
    const statusCode = normalizeStatusCode(error);
    const payload = {
        message: getPublicMessage(error, statusCode, isProduction)
    };

    if (!isProduction) {
        payload.code = error?.code || error?.type || 'INTERNAL_ERROR';

        if (error?.stack) {
            payload.stack = error.stack;
        }
    }

    return {
        statusCode,
        payload
    };
}

function createErrorMiddleware(options = {}) {
    const isProduction = options.isProduction === true;
    const logger = options.logger || console;

    return function errorMiddleware(error, req, res, next) {
        if (res.headersSent) {
            return next(error);
        }

        const { statusCode, payload } = createErrorPayload(error, { isProduction });

        if (statusCode >= 500 && logger && typeof logger.error === 'function') {
            logger.error(error);
        }

        return res.status(statusCode).json(payload);
    };
}

module.exports = {
    createErrorMiddleware,
    createErrorPayload,
    getPublicMessage,
    normalizeStatusCode
};
