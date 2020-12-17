const express = require('express');
const expressWs = require('express-ws')
const router = express.Router()
const { asyncHandlerWs } = require('../utils/promiseHelper')
const { subscribeNewOrder } = require('./order')
expressWs(router);

router.ws('/subscribe/:model/:action/:userId', asyncHandlerWs(subscribeNewOrder))

module.exports = router