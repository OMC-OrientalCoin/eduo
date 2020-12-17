var hbs = require('hbs');
var path = require('path');
var fs = require('fs');
var logger = require('../utils/log')('error');
var menuConfig = require('../config').menuConfig;
var config = require('../config');
var { inWhiteList } = require('../utils/promiseHelper');

hbs.registerPartials(path.join(__dirname, '../views/partials'));

var blocks = {};

hbs.registerHelper('extend', function (name, context) {
  var block = blocks[name];
  if (!block) {
    block = blocks[name] = [];
  }

  block.push(context.fn(this)); // for older versions of handlebars, use block.push(context(this));
});

hbs.registerHelper('block', function (name) {
  var val = (blocks[name] || []).join('\n');

  // clear the block
  blocks[name] = [];
  return val;
});

hbs.registerHelper('json', function (obj) {
  return JSON.stringify(obj);
});

hbs.registerHelper('or', function (trueValue, falseValue, context) {
  return trueValue ? trueValue : falseValue;
});

var versions = {};
fs.readFile(path.join(__dirname, '../config/versions.mapping'), 'utf8', (err, data) => {
  if(err) {
    logger.error(err);
  }else {
    rows = data.split('\n');
    rows.map(row => {
      var sepIndex = row.indexOf('#');
      versions[row.slice(0, sepIndex)] = row.slice(sepIndex + 1) || 'noVersion';
    })
  }
});

hbs.registerHelper('getVersion', (key) => {
  return versions[key] || 'noVersion';
});

hbs.registerHelper('getHost', () => {
  return `${config.staticResource}`;
});

// hbs.registerHelper('isAdmin', (userName) => {
//   let isAdmin = false;
//   if(whiteUsers.indexOf(userName) >= 0) {
//     isAdmin = true;
//   }
//   return isAdmin;
// })

module.exports = function (app) {
  hbs.localsAsTemplateData(app);

  return function (req, res, next) {
    app.locals.req_ = req;
    next();
  };
};

