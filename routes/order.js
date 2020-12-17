const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order');
const { asyncHandler } = require('../utils/promiseHelper')
const { getTenpaySdk } = require('../utils/tenpayHelper')

router.post('/pay/receiveNotify', asyncHandler(orderController.receiveNotify));
router.post('/pay/tenpay/receiveNotify', getTenpaySdk().middlewareForExpress('pay'), asyncHandler(orderController.tenpayReceiveNotify));

module.exports = router;