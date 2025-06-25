
const rateLimit = {};
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutos
const MAX_REQUESTS = 100; // requests por janela

// Rate limiting simples
const rateLimitMiddleware = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimit[ip]) {
        rateLimit[ip] = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
        return next();
    }
    
    if (now > rateLimit[ip].resetTime) {
        rateLimit[ip] = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
        return next();
    }
    
    if (rateLimit[ip].count >= MAX_REQUESTS) {
        return res.status(429).json({ 
            error: 'Muitas requisições. Tente novamente em alguns minutos.' 
        });
    }
    
    rateLimit[ip].count++;
    next();
};

// Validação de entrada
const validateInput = (req, res, next) => {
    // Sanitizar strings
    const sanitizeString = (str) => {
        if (typeof str !== 'string') return str;
        return str.trim().replace(/[<>]/g, ''); // Remover tags básicas
    };
    
    // Sanitizar recursivamente
    const sanitizeObject = (obj) => {
        if (typeof obj !== 'object' || obj === null) {
            return typeof obj === 'string' ? sanitizeString(obj) : obj;
        }
        
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
    };
    
    req.body = sanitizeObject(req.body);
    next();
};

// Limpeza periódica do rate limit
setInterval(() => {
    const now = Date.now();
    for (const ip in rateLimit) {
        if (now > rateLimit[ip].resetTime) {
            delete rateLimit[ip];
        }
    }
}, RATE_LIMIT_WINDOW);

module.exports = { rateLimitMiddleware, validateInput };
