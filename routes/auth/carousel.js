const express = require('express');
const router = express.Router();
const carouselController = require('../../controllers/carousel');
const { asyncHandler } = require('../../utils/promiseHelper')

router.get('/list', asyncHandler(carouselController.select));
router.put('/:carouselId', asyncHandler(carouselController.update));

module.exports = router;