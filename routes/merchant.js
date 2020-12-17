
const express = require('express');
const router = express.Router();
const { selectAll, selectById, statisticById, login } = require('../controllers/merchant');
const { asyncHandler} = require('../utils/promiseHelper');

router.get('/list', asyncHandler(selectAll));
router.get('/:merchantId', asyncHandler(selectById));
router.get('/statistics/:merchantId', asyncHandler(statisticById));
router.post('/login', asyncHandler(login));

module.exports = router;