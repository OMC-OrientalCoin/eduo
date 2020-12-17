const express = require('express');
const router = express.Router();
const { applyMerchant, select, selectApply, selectExtractApply, selectStatistic,
  selectBuyers, update, updateMerchantCategory } = require('../../controllers/merchant')
const { create: createApply } = require('../../controllers/applyMerchant');
const { selectMerchantAdminList, addMerchantAdmin, updateMerchantAdmin } = require('../../controllers/admin');
const { select4Merchant, create, update: updateProduct, destroy } = require('../../controllers/product');
const { asyncHandler } = require('../../utils/promiseHelper')
const { merchantMerchantAccess } = require('../../utils/accessAuth');
const { select: selectMainType } = require('../../controllers/mainType');
const { supportMultiMerchant } = require('../../config/')
const templateRouter = require('./template')

const supportMultiMerchantValidate = (req, resp, next) => {
  if(supportMultiMerchant) {
    next();
  }else {
    resp.failed('您的版本不支持多商户');
  }
}
// router.post('/apply', supportMultiMerchantValidate, asyncHandler(applyMerchant));
router.post('/apply', supportMultiMerchantValidate, asyncHandler(createApply));
router.get('/list', asyncHandler(select));
router.get('/apply/list', asyncHandler(selectApply));
router.get('/extract/list', asyncHandler(selectExtractApply));
router.get('/statistics/list', asyncHandler(selectStatistic));
router.get('/customer/list', asyncHandler(selectBuyers));
router.put('/:merchantId', asyncHandler(update));
router.get('/admin/list', asyncHandler(selectMerchantAdminList));
router.post('/admin/', asyncHandler(addMerchantAdmin));
router.put('/admin/:userId', asyncHandler(updateMerchantAdmin));


router.get('/product/list', asyncHandler(select4Merchant));
router.post('/product/', merchantMerchantAccess, asyncHandler(create));
router.put('/product/:productId', merchantMerchantAccess, asyncHandler(updateProduct));
router.delete('/product/:productId', merchantMerchantAccess, asyncHandler(destroy));

router.get('/mainType/list', asyncHandler(selectMainType));

router.use('/freight/template', templateRouter);

router.put('/category/:categoryId', asyncHandler(updateMerchantCategory))

module.exports = router;