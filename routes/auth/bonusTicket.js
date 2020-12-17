const express = require('express');
const router = express.Router();
const { selectMyFetchList, select, selectFetchList, create, fetch, destroy } = require('../../controllers/bonusTicket');
const { asyncHandler } = require('../../utils/promiseHelper');
const { merchantMerchantAccess } = require('../../utils/accessAuth')
const { supportBonusTicket } = require('../../config')

const supportBonusTicketAccess = (req, resp, next) => {
  if(!supportBonusTicket) {
    resp.failed('当前版本不支持优惠券功能');
  }else {
    next();
  }
}

router.get('/my', asyncHandler(selectMyFetchList))
router.post('/fetch/:bonusTicketId', asyncHandler(fetch));
router.get('/list', asyncHandler(select));
router.post('/', supportBonusTicketAccess, merchantMerchantAccess, asyncHandler(create));
router.get('/fetch/list/:bonusTicketId', asyncHandler(selectFetchList));
router.delete('/:bonusTicketId', merchantMerchantAccess, asyncHandler(destroy));

module.exports = router;