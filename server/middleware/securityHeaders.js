const helmet = require('helmet');

const BASE_CONNECT_SRC = ["'self'", 'ws:', 'wss:'];
const BASE_IMG_SRC = ["'self'", 'data:'];
const BASE_STYLE_SRC = ["'self'"];
const BASE_SCRIPT_SRC = ["'self'"];

function createContentSecurityPolicyDirectives({ isProduction = false } = {}) {
    const directives = {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: BASE_CONNECT_SRC,
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: BASE_IMG_SRC,
        objectSrc: ["'none'"],
        scriptSrc: BASE_SCRIPT_SRC,
        scriptSrcAttr: ["'none'"],
        styleSrc: BASE_STYLE_SRC,
        styleSrcAttr: ["'none'"],
        upgradeInsecureRequests: isProduction ? [] : null
    };

    return directives;
}

function createSecurityHeadersMiddleware(options = {}) {
    const isProduction = options.isProduction === true;

    return helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: createContentSecurityPolicyDirectives({ isProduction })
        },
        crossOriginEmbedderPolicy: false,
        hsts: isProduction
            ? {
                maxAge: 15552000,
                includeSubDomains: true
            }
            : false,
        referrerPolicy: {
            policy: 'no-referrer'
        }
    });
}

module.exports = {
    createContentSecurityPolicyDirectives,
    createSecurityHeadersMiddleware
};
