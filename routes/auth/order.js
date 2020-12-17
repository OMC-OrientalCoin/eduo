const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/order');
const { asyncHandler } = require('../../utils/promiseHelper')
const { notNull, platformMerchantAccess } = require('../../utils/accessAuth');
const { tracking } = require('../../controllers/universe')
const { getTenpaySdk } = require('../../utils/tenpayHelper')

const merchantAllAccess = (req, resp, next) => {
  if(notNull(req.session.user, 'merchant')) {
    next();
  }else {
    resp.failed('权限不足！');
  }
}

const tenpaySdk = getTenpaySdk();

router.post('/refund/:orderId', orderController.apply4Refund);
router.post('/cancel/:id', asyncHandler(orderController.cancel));
router.post('/refund/accept/:txId', merchantAllAccess, asyncHandler(orderController.refund));
router.post('/refund/reject/:txId', merchantAllAccess, asyncHandler(orderController.rejectRefund));
router.post('/express/:orderId', orderController.express);
router.get('/list', asyncHandler(orderController.select));
router.get('/list/download', asyncHandler(orderController.export));
router.post('/', orderController.create);
router.post('/pay/:payment/:orderId', asyncHandler(orderController.pay));
router.get('/getAllOrderInfo', asyncHandler(orderController.selectByStatus));
router.get('/getAllOrderInfo/sum', asyncHandler(orderController.selectByStatusLength));
router.put('/comfirmReceipt/:orderId', asyncHandler(orderController.confirmReceipt));
router.delete('/:id', asyncHandler(orderController.destroy));
router.get('/proxy', asyncHandler(tracking))
router.post('/confirm/:orderId', platformMerchantAccess, asyncHandler(orderController.acceptOrder))
router.post('/reject/:orderId', platformMerchantAccess, asyncHandler(orderController.rejectOrder))
router.post('/rate/:orderId', asyncHandler(orderController.rateComment));
router.get('/:orderId', asyncHandler(orderController.selectById));


module.exports = router;