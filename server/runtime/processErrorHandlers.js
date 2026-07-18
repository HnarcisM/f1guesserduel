function normalizeProcessError(error) {
    if (error instanceof Error) return error;
    return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

function createProcessErrorHandlers(options = {}) {
    const logger = options.logger || console;
    const server = options.server || null;
    const shutdownTimeoutMs = Number.isFinite(options.shutdownTimeoutMs) ? options.shutdownTimeoutMs : 5000;
    const exitProcess = options.exitProcess || (code => process.exit(code));
    const beforeShutdown = typeof options.beforeShutdown === 'function'
        ? options.beforeShutdown
        : null;
    const cleanup = typeof options.cleanup === 'function'
        ? options.cleanup
        : null;
    let isShuttingDown = false;
    let hasExited = false;
    let shutdownPromise = null;

    function writeFatalLog(reason, error) {
        const logFn = typeof logger.error === 'function' ? logger.error.bind(logger) : logger.log?.bind(logger);
        if (typeof logFn === 'function') {
            logFn(reason, { error: normalizeProcessError(error) });
        }
    }

    function writeShutdownLog(signal) {
        const logFn = typeof logger.info === 'function' ? logger.info.bind(logger) : logger.log?.bind(logger);
        if (typeof logFn === 'function') {
            logFn('Graceful shutdown started.', { signal });
        }
    }

    function exitOnce(code) {
        if (hasExited) return;
        hasExited = true;
        exitProcess(code);
    }

    function closeServer() {
        if (!server || typeof server.close !== 'function') {
            return Promise.resolve(null);
        }

        return new Promise(resolve => {
            server.close(closeError => resolve(closeError || null));
        });
    }

    async function runCleanup() {
        if (!cleanup) return;
        await cleanup();
    }

    function shutdown({ reason, error = null, exitCode, signal = null }) {
        if (isShuttingDown) return shutdownPromise;
        isShuttingDown = true;

        if (error) {
            writeFatalLog(reason, error);
        } else {
            writeShutdownLog(signal || reason);
        }

        const timeout = setTimeout(() => {
            writeFatalLog('Graceful shutdown timed out', new Error(`Shutdown exceeded ${shutdownTimeoutMs}ms.`));
            exitOnce(exitCode);
        }, shutdownTimeoutMs);
        timeout.unref?.();

        try {
            beforeShutdown?.();
        } catch (shutdownStartError) {
            writeFatalLog('Application shutdown preparation failed', shutdownStartError);
            exitCode = 1;
        }

        shutdownPromise = (async () => {
            const closeError = await closeServer();
            if (closeError) {
                writeFatalLog('HTTP server failed to close during shutdown', closeError);
                exitCode = 1;
            }

            try {
                await runCleanup();
            } catch (cleanupError) {
                writeFatalLog('Application resource cleanup failed', cleanupError);
                exitCode = 1;
            } finally {
                clearTimeout(timeout);
                exitOnce(exitCode);
            }

            return exitCode;
        })();

        return shutdownPromise;
    }

    return {
        handleUncaughtException: error => shutdown({
            reason: 'Uncaught exception',
            error,
            exitCode: 1
        }),
        handleUnhandledRejection: reason => shutdown({
            reason: 'Unhandled promise rejection',
            error: normalizeProcessError(reason),
            exitCode: 1
        }),
        handleSigterm: () => shutdown({
            reason: 'SIGTERM',
            signal: 'SIGTERM',
            exitCode: 0
        }),
        handleSigint: () => shutdown({
            reason: 'SIGINT',
            signal: 'SIGINT',
            exitCode: 0
        })
    };
}

function registerProcessErrorHandlers(options = {}) {
    const processRef = options.processRef || process;
    const handlers = createProcessErrorHandlers(options);

    processRef.on('uncaughtException', handlers.handleUncaughtException);
    processRef.on('unhandledRejection', handlers.handleUnhandledRejection);
    processRef.on('SIGTERM', handlers.handleSigterm);
    processRef.on('SIGINT', handlers.handleSigint);

    return function unregisterProcessErrorHandlers() {
        processRef.off?.('uncaughtException', handlers.handleUncaughtException);
        processRef.off?.('unhandledRejection', handlers.handleUnhandledRejection);
        processRef.off?.('SIGTERM', handlers.handleSigterm);
        processRef.off?.('SIGINT', handlers.handleSigint);
    };
}

module.exports = {
    createProcessErrorHandlers,
    registerProcessErrorHandlers,
    normalizeProcessError
};
