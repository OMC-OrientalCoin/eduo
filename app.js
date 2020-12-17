var express = require('express');
var compression = require('compression');
var path = require('path');
// var favicon = require('serve-favicon');
var cookieSession = require('cookie-session');
var flash = require('connect-flash');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var log4js = require('log4js');

var config = require('./config');
// var middleware = require('./middleware');
var logger = require('./utils/log')('error');
const mongoose = require('mongoose');
const dbConfig = require('./config').db;
var  responseTime = require('response-time')

var app = express();
var expressWs = require('express-ws');
var websocket = require('./ws/index');

var wsInstance = expressWs(app);

app.use('/ws', websocket)

// mongoose support
mongoose.connect(dbConfig.uri, dbConfig.option);
mongoose.Promise = global.Promise;
const db = mongoose.connection;
db.on('error', (err) => {
  console.error.bind(console, 'MongoDB connection error:' + err)
});
app.all('*', function (req, res, next) {
  // res.header("Access-Control-Allow-Origin", '*');
  res.header("Access-Control-Allow-Origin", req.header("Origin"));
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Connection, User-Agent, Cookie");
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  // res.header("X-Powered-By",' 3.2.1');
  // res.header("Content-Type", "application/json;charset=utf-8");
  res.header("Access-Control-Allow-Credentials", "true");
  // 跨域options 返回200
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
app.use(require('./middleware/hbs')(app));


// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
log4js.configure(config.log4js);
app.use(log4js.connectLogger(log4js.getLogger("access"), {
  level: log4js.levels.INFO
}));

app.use(compression());
// app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(config.pathConfig.static));
// if (process.env.NODE_ENV !== 'production') {
  app.use(responseTime(function (req, resp, time) {
    console.log(`${req.method} ${req.url} ${req.method === 'GET' ? JSON.stringify(req.query) : JSON.stringify(req.body)}: ${time} ms`)
  }))
// }
//allow
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.text({ type: '*/xml' }));
app.use(cookieParser());
app.use(cookieSession({
  secret: 'ZoKWeYjQfEoy5S8h',
  cookie: {
    maxAge: 7200000,
    path: "/",
    secure: true,
    sameSite: 'none',
    httpOnly: true,
  },
  maxAge: 7200000,
  httpOnly: true,
  sameSite: 'none',
  secure: true,
}));
app.set('trust proxy', true);
app.use(flash());

// app.use(middleware.auth);
require('./middleware').initCommonMiddleware(app);
app.use(function (req, res, next) {
  req.wsInstance = wsInstance
  next();
});
require('./routes')(app);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function (err, req, res, next) {
    if (typeof err === 'string') {
      res.failed(err);
    } else if (err.message) {
      res.failed(err.message);
    } else {
      res.status(err.status || 500);
    }
    console.error(err);
    logger.error(err);
    // res.render('error', {
    //   message: err.message,
    //   error: err
    // });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
  if (typeof err == 'string' || err.message) {
    const msg = (err && err.message) || err
    console.error(err)
    res.failed(msg);
  } else {
    res.status(err.status || 500);
  }
  logger.error(err);
  // if (req.xhr == true) {
  //   res.json({
  //     success: false,
  //     msg: err.message
  //   })
  // } else {
  //   res.render('error', {
  //     message: err.message,
  //     error: {}
  //   });
  // }
});

module.exports = app;
