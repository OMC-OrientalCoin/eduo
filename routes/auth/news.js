
const express = require('express');
const router = express.Router();
const newsController = require('../../controllers/news');
const { asyncHandler } = require('../../utils/promiseHelper')

router.post('/', asyncHandler(newsController.create));
router.put('/:newsId', asyncHandler(newsController.update));

module.exports = router;