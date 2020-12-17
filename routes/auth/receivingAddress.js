const express = require('express');
const router = express.Router();
const addressController = require('../../controllers/receivingAddress');

router.put('/:addressId', addressController.update);
router.delete('/:addressId', addressController.destroy);
router.post('/', addressController.create);
router.get('/my', addressController.select);
router.post('/updateAddressStatus', addressController.setDefault);

module.exports = router;