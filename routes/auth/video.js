
const express = require('express');
const router = express.Router();
const video = require('../../controllers/video');
const { asyncHandler } = require('../../utils/promiseHelper')

router.post('/list/audit', asyncHandler(video.audit));
router.post('/list/comment', asyncHandler(video.comments));
router.post('/list', asyncHandler(video.selectAll));

module.exports = router;