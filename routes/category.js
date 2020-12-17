const express = require('express');
const router = express.Router();
const { select } = require('../controllers/category');
const { asyncHandler } = require('../utils/promiseHelper');

router.get('/list', asyncHandler(select));

module.exports = router;