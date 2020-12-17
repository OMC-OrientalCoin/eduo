
const express = require('express');
const router = express.Router();
const grid = require('../../controllers/grid');
const { asyncHandler } = require('../../utils/promiseHelper')

router.post('/', asyncHandler(grid.create));
router.get('/list', asyncHandler(grid.selectAll));
router.put('/:gridId', asyncHandler(grid.update));

module.exports = router;