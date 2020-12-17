const express = require('express');
const router = express.Router();
const { getIndexInfo, updateWallet } = require('../../controllers/user')
const { acceptTransaction, rejectTransaction } = require('../../controllers/wallet')
const { getGeneralConfig, updateConfig, getProtocol } = require('../../controllers/config');
const { destroy } = require('../../controllers/universe');
const { asyncHandler } = require('../../utils/promiseHelper');
const { merchantMerchantAccess, notSuperAdmin, notRole, platformAuthAccess, platformMerchantAccess } = require('../../utils/accessAuth');
const { addPlatformAdmin, updatePlatformAdmin } = require('../../controllers/admin');
const { updateByAdmin } = require('../../controllers/user');
const { updateByPlatform, toggleStatus, create } = require('../../controllers/merchant')
const { toggleProductStatus, addHot } = require('../../controllers/product');
const { selectAll, process } = require('../../controllers/applyMerchant')
const { create: createCategory, update: updateCategory } = require('../../controllers/category');
const { create: createMainType, update: updateMainType } = require('../../controllers/mainType');
const { create: createCarousel} = require('../../controllers/carousel');
const grid = require('./grid')
const video = require('./video')

const platformSuperAdminAccess = (req, resp, next) => {
  if (notSuperAdmin(req.session.user, 'platform')) {
    resp.failed('权限不足！');
  } else {
    next();
  }
}

router.get('/indexInfo', asyncHandler(getIndexInfo));
router.post('/confirm/:transactionId', platformAuthAccess, asyncHandler(acceptTransaction));
router.post('/reject/:transactionId', platformAuthAccess, asyncHandler(rejectTransaction));
router.delete('/:model/:instanceId', (req, resp, next) => {
  if (['category', 'mainType', 'product'].indexOf(req.params.model) >= 0) {
    if(req.params.model === 'product') {
      merchantMerchantAccess(req, resp, next);
    }else {
      platformMerchantAccess(req, resp, next);
    }
  } else {
    platformSuperAdminAccess(req, resp, next);
  }
}, asyncHandler(destroy));
router.get('/config', asyncHandler(getGeneralConfig));
router.get('/protocol', asyncHandler(getProtocol));
router.put('/config', platformSuperAdminAccess, asyncHandler(updateConfig));
router.post('/user/admin', platformSuperAdminAccess, asyncHandler(addPlatformAdmin));
router.put('/user/admin/:userId', platformSuperAdminAccess, asyncHandler(updatePlatformAdmin));
router.put('/user/:userId', platformAuthAccess, asyncHandler(updateByAdmin));

router.post('/user/wallet/:userId', asyncHandler(updateWallet));

router.put('/merchant/:merchantId', platformMerchantAccess, asyncHandler(updateByPlatform));
router.post('/merchant/toggle/:merchantId', platformMerchantAccess, asyncHandler(toggleStatus));

router.post('/merchant/mainType', asyncHandler(createMainType));
router.put('/merchant/mainType/:mainTypeId', platformMerchantAccess, asyncHandler(updateMainType));

router.post('/merchant/:userId', platformAuthAccess, asyncHandler(create))
router.get('/merchant/apply/list', asyncHandler(selectAll));
router.put('/merchant/apply/process/:id', asyncHandler(process));

router.post('/product/toggle/:productId', platformAuthAccess, asyncHandler(toggleProductStatus));
router.post('/product/hot/:productId', platformMerchantAccess, asyncHandler(addHot));

router.post('/category', asyncHandler(createCategory));
router.put('/category/:categoryId', asyncHandler(updateCategory));

router.use('/category/grid', grid);
router.use('/video', video);

router.post('/carousel/', asyncHandler(createCarousel));



module.exports = router;