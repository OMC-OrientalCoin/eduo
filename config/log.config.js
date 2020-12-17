var path = require('path');
var mkdirp = require('mkdirp');

var filePath = process.platform === 'win32' ? path.join(__dirname, '../logs') : '/wae/log/fever';
mkdirp.sync(filePath);

module.exports = {
  appenders: {
    console: { type: 'console'},
    access: {
      "type": "dateFile",
      // "filename": process.platform === 'win32' ? "log/access.log" : '/var/log/nodejs/access.log',
      "filename": path.join(filePath, 'access.log'),
      "pattern": "-yyyy-MM-dd",
      "alwaysIncludePattern": true,
    },
    error: {
      "type": "dateFile",
      // "filename": process.platform === 'win32' ? "log/error.log" : '/var/log/nodejs/error.log',
      "filename": path.join(filePath, 'error.log'),
      "pattern": "-yyyy-MM-dd",
      "alwaysIncludePattern": true,
    }
  },
  categories: {
    default: { appenders: ['console'], level: 'info'},
    access: { appenders: ['access'], level: 'info' },
    error: { appenders: ['error'], level: 'info' }
  },
  "replaceConsole": true
};