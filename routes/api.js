/*
 * api.js
 *
 * Distributed under terms of the MIT license.
 */
const express = require('express');
const router = express.Router();
const userRouter = require('./auth/user');
const carouselRouter = require('./auth/carousel');
const newsRouter = require('./auth/news');
const orderRouter = require('./auth/order');
const productRouter = require('./auth/product');
const addressRouter = require('./auth/receivingAddress');
const platformRouter = require('./auth/platform');
const bounsTicketRouter = require('./auth/bonusTicket');
const merchantRouter = require('./auth/merchant');
const walletRouter = require('./auth/wallet');
const feedbackRouter = require('./auth/feedback')
const { asyncHandler } = require('../utils/promiseHelper');
const { search } = require('../controllers/video')

router.use('/user', userRouter);
router.use('/carousel', carouselRouter);
router.use('/news', newsRouter);
router.use('/order', orderRouter);
router.use('/product', productRouter);
router.use('/address', addressRouter);
router.use('/platform', platformRouter);
router.use('/bonusTicket', bounsTicketRouter);
router.use('/merchant', merchantRouter);
router.use('/wallet', walletRouter);
router.use('/feedback', feedbackRouter);
router.post('/video/list', asyncHandler(search))

module.exports = router;
