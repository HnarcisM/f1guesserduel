function createServerErrorMessage(error, options = {}) {
    const port = options.port || process.env.PORT || 3000;

    if (error?.code === 'EADDRINUSE') {
        return [
            `Portul ${port} este deja folosit.`,
            'Închide serverul vechi sau pornește aplicația pe alt port.',
            '',
            'Windows CMD:',
            `  netstat -ano | findstr :${port}`,
            '  taskkill /PID <PID> /F',
            '',
            'Sau pornește pe alt port:',
            '  set PORT=3001',
            '  npm start'
        ].join('\n');
    }

    if (error?.code === 'EACCES') {
        return [
            `Nu am permisiune să pornesc serverul pe portul ${port}.`,
            'Alege un port mai mare, de exemplu PORT=3001, sau rulează terminalul cu permisiunile necesare.'
        ].join('\n');
    }

    return `Serverul nu a putut porni: ${error?.message || 'eroare necunoscută'}`;
}

function createServerErrorHandler(options = {}) {
    const logger = options.logger || console;
    const exitProcess = options.exitProcess || (code => process.exit(code));
    const port = options.port;

    return function handleServerError(error) {
        logger.error('');
        logger.error('===================================================');
        logger.error(' ❌ F1 GUESSER DUEL NU A PUTUT PORNI');
        logger.error('===================================================');
        logger.error(createServerErrorMessage(error, { port }));
        logger.error('===================================================');

        exitProcess(1);
    };
}

module.exports = {
    createServerErrorHandler,
    createServerErrorMessage
};
