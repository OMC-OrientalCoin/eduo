var request = require('request');
var parseString = require('xml2js').parseString;
var _ = require('lodash');

var config = require('../config');
var utils = require('../utils');

module.exports = function (req, res, next) {
  if (req.session && req.session.user) { //如果已经登录
    next();
  } else{
    req.session.error = 'Access denied!';
    res.failed('请登录！');
    // res.redirect('/index');
  }
}
