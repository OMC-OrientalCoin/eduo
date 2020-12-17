const express = require('express');
const path = require('path');
const router = express.Router();
const userRouter = require('./user');
const newsRouter = require('./news');
const orderRouter = require('./order');
const productRouter = require('./product');
const categoryRouter = require('./category');
const merchantRouter = require('./merchant');
const walletRouter = require('./wallet');
const txRouter = require('./tx')
const { asyncHandler } = require('../utils/promiseHelper')
const { edouPriceChange } = require('../controllers/change')
const { accessWhiteIpList } = require('../config')
const { getVersion, getLevelPercent } = require('../controllers/config')
const { IpFilter } = require('express-ipfilter');

router.use('/user', userRouter);
router.use('/news', newsRouter);
router.use('/order', orderRouter);
router.use('/product', productRouter);
router.use('/category', categoryRouter);
router.use('/merchant', merchantRouter);
router.use('/wallet', walletRouter);
router.use('/tx', txRouter);
router.post('/edou/price', IpFilter(accessWhiteIpList, { mode: 'allow'}), asyncHandler(edouPriceChange));
router.get('/config/user/donate/percent/:vipLevel', asyncHandler(getLevelPercent));
router.get('/version', (req, resp, next) => {
  resp.download(path.resolve(__dirname, '../public/H56FB7B72.wgt'));
})
router.get('/platform/config', asyncHandler(getVersion))

module.exports = router;