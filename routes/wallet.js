const express = require('express');
const router = express.Router();
const { receiveRechargeAlipayNotify, receiveRechargeTenpayNotify, receiveRechargeUnionpayNotify } = require('../controllers/wallet');
const { refundTenpayReceiveNotify } = require('../controllers/order')
const { asyncHandler} = require('../utils/promiseHelper');
const { getTenpaySdk } = require('../utils/tenpayHelper');

router.post('/recharge/alipay/receiveNotify', asyncHandler(receiveRechargeAlipayNotify));
router.post('/recharge/tenpay/receiveNotify', getTenpaySdk().middlewareForExpress('pay'), asyncHandler(receiveRechargeTenpayNotify));
router.post('/recharge/unionpay/receiveNotify', asyncHandler(receiveRechargeUnionpayNotify))
router.post('/refund/tenpay/receiveNotify', getTenpaySdk().middlewareForExpress('refund'), asyncHandler(refundTenpayReceiveNotify));

module.exports = router;