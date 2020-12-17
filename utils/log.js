var log4js = require('log4js');
var errorLogger = log4js.getLogger('error');
var logger = {
    error: errorLogger,
    console: log4js.getLogger('console')
};

module.exports = function(level) {
    return logger[level];
};
