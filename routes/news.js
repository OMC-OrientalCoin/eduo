const express = require('express');
const router = express.Router();
const newsController = require('../controllers/news');
const { asyncHandler } = require('../utils/promiseHelper');

router.get('/list', asyncHandler(newsController.selectAll));
router.get('/:newsId', asyncHandler(newsController.selectById));

module.exports = router;