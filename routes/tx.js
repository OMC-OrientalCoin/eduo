
const express = require('express');
const router = express.Router();
const wallet = require('../controllers/wallet');
const { asyncHandler } = require('../utils/promiseHelper')
const { getTenpaySdk } = require('../utils/tenpayHelper')
const { accessWhiteIpList } = require('../config')
const { IpFilter } = require('express-ipfilter');

router.post('/', IpFilter(accessWhiteIpList, { mode: 'allow'}), asyncHandler(wallet.manualCreateTx));
// vip购买,alipay
router.post('/alipay/receiveNotify', asyncHandler(wallet.receiveAlipayNotify));
// vip购买,tenpay
router.post('/tenpay/receiveNotify', getTenpaySdk().middlewareForExpress('pay'), asyncHandler(wallet.receiveTenpayNotify));
// ebrgo充币回调
router.post('/ebrgo/in', asyncHandler(wallet.ebrgoIn));

module.exports = router;