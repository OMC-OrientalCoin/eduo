const express = require('express');
const router = express.Router();
const { createTokenAmountRecharge, createLegalRecharge, createTokenRecharge, createExtract, createTokenExtract,
   getMyTransactions, getWalletList, transfer, exchange, exportList, freeze, market, lottery, buyVip, getRefundList, getBonusPoolList } = require('../../controllers/wallet')
const { asyncHandler } = require('../../utils/promiseHelper');
const { merchantMerchantAccess } = require('../../utils/accessAuth');
const { supportTokens, supportAmount } = require('../../config')
const { walletStatusFilter } = require('../../middleware')

const userMerchantAccess = (req, resp, next) => {
  if(req.body.isMerchant) {
    merchantMerchantAccess(req, resp, next);
  }else {
    next();
  }
}

const supportTokenAccess = (req, resp, next) => {
  const payment = req.body.payment;
  if(supportTokens && supportTokens.indexOf(payment) >= 0) {
    resp.failed(`当前版本不支持${payment}的充值`)
  }else {
    next();
  }
}

const supportAmountAccess = (req, resp, next) => {
  const payment = req.body.payment;
  if(!supportAmount) {
    resp.failed(`当前版本不支持${payment}的充值`)
  }else {
    next();
  }
}

// router.post('/exchange/uc', asyncHandler(exchange))
router.post('/inner/token/transfer', asyncHandler(transfer))
router.post('/rechargeIn', supportAmountAccess, walletStatusFilter, asyncHandler(createLegalRecharge));
router.post('/extract', userMerchantAccess, walletStatusFilter, asyncHandler(createExtract));
router.post('/token/rechargeIn', supportTokenAccess, asyncHandler(createTokenRecharge));
router.post('/token/transfer', userMerchantAccess, asyncHandler(createTokenExtract));
router.get('/records/my', asyncHandler(getMyTransactions));
router.get('/detail/list', asyncHandler(getWalletList));
router.get('/detail/list/download', asyncHandler(exportList));
router.post('/exchange/edou', walletStatusFilter, asyncHandler(exchange));
router.post('/freeze/edou', walletStatusFilter, asyncHandler(freeze));
router.get('/edou/market', asyncHandler(market));
router.post('/lottery', walletStatusFilter, asyncHandler(lottery));
router.post('/vip/buy', walletStatusFilter, asyncHandler(buyVip))
router.get('/merchant/refund/list', asyncHandler(getRefundList));
router.get('/bonusPool/list', asyncHandler(getBonusPoolList));

module.exports = router;