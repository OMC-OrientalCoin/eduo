const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const { asyncHandler } = require('../utils/promiseHelper')

router.post('/forgetPwd', asyncHandler(userController.forgetPwd))
router.post('/resetPwd', userController.resetPassword);
router.post('/login', userController.login);
router.post('/regist', asyncHandler(userController.create));
router.post('/info/:userId', asyncHandler(userController.selectById));

module.exports = router;