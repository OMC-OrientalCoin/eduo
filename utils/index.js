var _ = require('lodash');

module.exports = {
  url: {
    params: function (obj) {
      if (_.isPlainObject(obj)) {
        var result = [];
        for (var key in obj) {
          result.push(key + '=' + obj[key]);
        }
        return result.join('&');
      }
      return '';
    },
    addParam: function (src, key, value) {
      if (_.isPlainObject(src)) {
        src[key] = value;
        return src;
      } else {
        var src = src.split('?');
        return src[0] + '?' + key + '=' + value + (src.length > 1 ? '&' + src[1] : '');
      }
    }
  }
};