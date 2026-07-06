function normalizeProcessError(error) {
    if (error instanceof Error) return error;
    return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

function createProcessErrorHandlers(options = {}) {
    const logger = options.logger || console;
    const server = options.server || null;
    const shutdownTimeoutMs = Number.isFinite(options.shutdownTimeoutMs) ? options.shutdownTimeoutMs : 5000;
    const exitProcess = options.exitProcess || (code => process.exit(code));
    let isShuttingDown = false;

    function writeFatalLog(reason, error) {
        const logFn = typeof logger.error === 'function' ? logger.error.bind(logger) : logger.log?.bind(logger);
        if (typeof logFn === 'function') {
            logFn(reason, { error: normalizeProcessError(error) });
        }
    }

    function exitOnce(code) {
        if (exitOnce.called) return;
        exitOnce.called = true;
        exitProcess(code);
    }

    function shutdown(reason, error) {
        if (isShuttingDown) return;
        isShuttingDown = true;
        writeFatalLog(reason, error);

        if (!server || typeof server.close !== 'function') {
            exitOnce(1);
            return;
        }

        const timeout = setTimeout(() => exitOnce(1), shutdownTimeoutMs);
        timeout.unref?.();

        server.close(closeError => {
            clearTimeout(timeout);
            if (closeError) {
                writeFatalLog('HTTP server failed to close after fatal error', closeError);
            }
            exitOnce(1);
        });
    }

    return {
        handleUncaughtException: error => shutdown('Uncaught exception', error),
        handleUnhandledRejection: reason => shutdown('Unhandled promise rejection', reason)
    };
}

function registerProcessErrorHandlers(options = {}) {
    const processRef = options.processRef || process;
    const handlers = createProcessErrorHandlers(options);

    processRef.on('uncaughtException', handlers.handleUncaughtException);
    processRef.on('unhandledRejection', handlers.handleUnhandledRejection);

    return function unregisterProcessErrorHandlers() {
        processRef.off?.('uncaughtException', handlers.handleUncaughtException);
        processRef.off?.('unhandledRejection', handlers.handleUnhandledRejection);
    };
}

module.exports = {
    createProcessErrorHandlers,
    registerProcessErrorHandlers,
    normalizeProcessError
};
