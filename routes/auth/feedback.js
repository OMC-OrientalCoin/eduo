
const express = require('express');
const router = express.Router();
const feedback = require('../../controllers/feedback');
const { asyncHandler } = require('../../utils/promiseHelper')

router.post('/', asyncHandler(feedback.create));
router.get('/list', asyncHandler(feedback.selectAll));
router.put('/process/:id', asyncHandler(feedback.process));

module.exports = router;