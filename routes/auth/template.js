
const express = require('express');
const router = express.Router();
const template = require('../../controllers/template');
const { asyncHandler } = require('../../utils/promiseHelper')

router.post('/', asyncHandler(template.create));
router.get('/list', asyncHandler(template.selectAll));
router.put('/:templateId', asyncHandler(template.update));

module.exports = router;