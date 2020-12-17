var _ = require('lodash');

var responses = {
  badRequest: function(data) {
    this.status(400).json(typeof data === 'string' ? { msg: data } : data);
  },
  ok: function(data) {
    this.json(typeof data === 'string' ? { msg: data } : data);
  },
  forbidden: function(data) {
    this.status(403).json(typeof data === 'string' ? { msg: data } : data);
  },
  notFound: function(data) {
    this.status(404).json(typeof data === 'string' ? { msg: data } : data);
  },
  serverError: function(data) {
    this.status(500).json(typeof data === 'string' ? { msg: data } : data);
  },
  success: function(data) {
    this.json({ success: true, data: data});
  },
  failed: function(data) {
    _.isString(data) && this.json({ success: false, msg: data});
  },
};

module.exports = function(req, res, next) {
  _.assign(res, responses);
  if(req.session.user) {
    req.userName = req.session.user.userName;
  }
  next();
};
