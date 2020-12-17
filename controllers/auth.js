var db = require('../models');
var config = require('../config');
function logout(req, res, next) {
  var logoutUrl = config.cas ? config.cas.logout + '?service=' + encodeURIComponent('http://localhost:3000') : encodeURIComponent('http://localhost:3000');
  console.log(logoutUrl);
  res.redirect(logoutUrl);
}
module.exports = {
  logout: function(req, res, next) {
  	if(req.session){
      req.session = null;
      logout(req, res, next);
  	}else{
  		res.redirect("http://localhost:3000");
  	}
  }
};