var localConfig = require('./config.local');
var devConfig = require('./config.dev');
var prdConfig = require('./config.prd');
var log4jsConfig = require('./log.config');

var config = prdConfig;

if (process.env.NODE_ENV === 'development') {
  config = devConfig;
} else if (process.env.NODE_ENV === 'local') {
  config = localConfig;
}

config.log4js = log4jsConfig;

module.exports = config;
