const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReceivingAddress = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  detailAddress: {
    type: String,
  },
  // 到第三级的地址
  address: {
    type: String,
  },
  zipCode: {
    type: String,
  },
  // 是否默认地址
  isDefault: {
    type: Boolean,
    default: false,
  }
});

module.exports = ReceivingAddress;