
const express = require('express');
const router = express.Router();
const { select, trans, receiveTransfer } = require('../controllers/transaction');

// router.get('/queryTransfer', select);
router.post('/transfer', trans);
router.post('/receiveTransfer', receiveTransfer);

module.exports = router;