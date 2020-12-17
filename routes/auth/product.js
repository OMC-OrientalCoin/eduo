
const express = require('express');
const router = express.Router();
const productController = require('../../controllers/product');
const { notSuperAdmin, notRole, platformMerchantAccess, merchantMerchantAccess} = require('../../utils/accessAuth');
const { asyncHandler } = require('../../utils/promiseHelper');
const { supportBonus } = require('../../config')

const supportBonusAccess = (req, resp, next) => {
  if(!supportBonus) {
    resp.failed('当前版本不支持积分商品添加');
  }else {
    next();
  }
}

router.get('/list', asyncHandler(productController.selectAll));
router.get('/bonus/list', asyncHandler(productController.selectBonus));
router.post('/', supportBonusAccess, platformMerchantAccess, asyncHandler(productController.create4Bonus));
router.put('/:productId', platformMerchantAccess, asyncHandler(productController.update4Bonus));
router.post('/collect/:productId', asyncHandler(productController.collect));
router.get('/collect/list', asyncHandler(productController.collectList));


module.exports = router;