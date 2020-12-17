// 基本仅用于购买情况的备份
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { supportTokens, supportBonus, supportAmount } = require('../config')
const tokens = supportTokens ? supportTokens: ['eos', 'eth', 'btc'];
const bonusField = supportBonus ? ['bonus']: [];
const amountField = supportAmount ? ['usdtAmount']: [];

const PurchaseOrderSchema = new Schema({
  receivingAddress: String,
  name: String,
  mobile: String,
  payment: {
    type: String,
    enum: ['alipay', 'tenpay', ...tokens, ...bonusField, ...amountField],
  },
  orders: [{
    type: Schema.Types.ObjectId,
    ref: 'Order'
  }],
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  allPrice: {
    type: Number,
    min: 0,
  },
  actualPrice: {
    type: Number,
    min: 0,
  },
  earnBonus: {
    type: Number,
    min: 0,
  }
}, {
  timestamps: true,
})

module.exports = PurchaseOrderSchema