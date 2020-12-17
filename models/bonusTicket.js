const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BonusTicketModel = new Schema({
  name: {
    type: String,
    required: true,
  },
  // 满足多少才能用
  condition: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 减的值
  bonus: {
    type: Number,
    min: 0,
    required: true,
  },
  // 需要积分
  required: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalAmount: {
    type: Number,
    min: 0,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  merchant: {
    type: Schema.Types.ObjectId,
    ref: 'Merchant',
  },
  suitableProducts: [{
    type: Schema.Types.ObjectId,
    ref: 'Product'
  }],
  // 使用开始时间
  startTime: {
    type: Date,
    default: Date.now,
  },
  // 使用截止时间
  endTime: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = BonusTicketModel;