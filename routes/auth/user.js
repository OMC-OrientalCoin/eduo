const express = require('express');
const router = express.Router();
const userController = require('../../controllers/user');
const { asyncHandler } = require('../../utils/promiseHelper')
const { platformAuthAccess } = require('../../utils/accessAuth')

router.get('/list', asyncHandler(userController.selectAll));
router.get('/list/download', asyncHandler(userController.export));
router.post('/signin', asyncHandler(userController.signIn));
router.get('/signin/check', asyncHandler(userController.isSignedInToday));
router.get('/invite/list', asyncHandler(userController.getInviteList));
router.post('/resetPaypwd', asyncHandler(userController.updatePaypwd));
router.post('/merchant/apply/accept/:userId', platformAuthAccess, asyncHandler(userController.acceptMerchantApply));
router.post('/merchant/apply/reject/:userId', platformAuthAccess, asyncHandler(userController.rejectMerchantApply));

router.post('/kyc/accept/:userId', platformAuthAccess, asyncHandler(userController.acceptIdentity));
router.post('/kyc/reject/:userId', platformAuthAccess,asyncHandler(userController.rejectIdentity));

router.post('/identity', asyncHandler(userController.identity));
router.put('/update', asyncHandler(userController.updateInfo));
router.post('/regist', asyncHandler(userController.createByAdmin));
router.get('/tree', asyncHandler(userController.getTreeLayers))
router.post('/logout', (req, res, next) => {
    req.session.user = null;
    delete req.session.isMerchant
    res.success('登出成功!');
})
router.delete('/', platformAuthAccess, asyncHandler(userController.destroy));
router.get('/group', asyncHandler(userController.myGroup));

module.exports = router;