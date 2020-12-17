const express = require('express');
const router = express.Router();
const productController = require('../controllers/product');

router.get('/list', productController.select);
router.get('/:productId', productController.selectById);

module.exports = router;