const middleware = require('../middleware');
const apiRouter = require('./api');
const config = require('../config');
const { create, resetPassword, getCaptcha } = require('../controllers/user');
const { getProtocol, getVersion } = require('../controllers/config')
const frontRouter = require('./front');
const pictureUploadRouter = require('./pictureUpload');
const { startCase } = require('lodash/fp')
const merchantAdminFields = ['category', 'mainType', 'product'];
const { SUCCESS_DELETE } = require('../commons/respCommons')
const { proxy } = require('../controllers/universe');
const { asyncHandler } = require('../utils/promiseHelper')


module.exports = function (app) {
  // app.use(require('./auth')); 
  // 有后台系统的时候用的
  app.use('/admin', middleware.auth, apiRouter);
  app.get('/proxy', asyncHandler(proxy));
  app.post('/passport/smsCode', getCaptcha);
  app.get('/protocol', asyncHandler(getProtocol))
  // app.get('/auth', middleware.auth, function (req, res, next) {
  //   res.redirect('/');
  // });

  app.get('/', middleware.auth, (req, resp, next) => {
    resp.render('index');
  });
  app.get('/index', (rq, resp, next) => {
    resp.render('index');
  })
  // app.post('/user/login', login);


  app.use('/pictureUpload', pictureUploadRouter);
  app.use('/', frontRouter);
};
