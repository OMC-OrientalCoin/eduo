const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Merchant = new Schema({
  name: {
    type: String,
    // required: true,
  },
  // 商家公司名称
  fullName: String,
  // 统一信用代码
  code: {
    type: String,
    // required: true,
  },
  // 营业执照图片URL
  businessLicense: {
    type: String,
  },
  // 商户LOGO
  imageUrl: {
    type: String,
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product'
  },
  // 轮播图
  imageUrls: [String],
  address: {
    type: String,
  },
  mainType: {
    type: Schema.Types.ObjectId,
    ref: 'MainType',
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  salesVolumn: {
    type: Number,
    min: 0,
    default: 0,
  },
  // 累计销售额
  totalSaleAmount: {
    type: Number,
    min: 0,
    default: 0,
  },
  // 累计提现额
  totalExtractOutAmount: {
    type: Number,
    min: 0,
    default: 0,
  },
  // 涉及到的分类从category里查
  products: [{
    type: Schema.Types.ObjectId,
    ref: 'Product'
  }],
  bonusTickets: [{
    type: Schema.Types.ObjectId,
    ref: 'BonusTicket',
  }],
  telephone: {
    type: String,
  },
  businessStartTime: {
    type: Date,
  },
  businessEndTime: {
    type: Date,
  },
  recommended: {
    type: Boolean,
    default: false,
  },
  rank: {
    type: Number,
    default: 1,
    min: 1,
  },
  // 待提现人民币
  amount: {
    type: Number,
    default: 0,
    min: 0,
  },
  bonus: {
    type: Number,
    default: 0,
    min: 0,
  },
  extractedAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  eosAvailable: {
    type: Number,
    min: 0,
    default: 0,
  },
  ethAvailable: {
    type: Number,
    min: 0,
    default: 0,
  },
  btcAvailable: {
    type: Number,
    min: 0,
    default: 0,
  },
  amountFreeze: {
    type: Number,
    default: 0,
    min: 0,
  },
  eosFreeze: {
    type: Number,
    min: 0,
    default: 0,
  },
  ethFreeze: {
    type: Number,
    min: 0,
    default: 0,
  },
  btcFreeze: {
    type: Number,
    min: 0,
    default: 0,
  },
  status: {
    type: String,
    enum: ['enabled', 'disabled'],
    default: 'enabled',
  },
  sort: {
    type: Number,
    default: 0,
  }
}, {
  timestamps: true
})

Merchant.virtual('productNum').get(function() {
  return this.products && this.products.length;
})

Merchant.virtual('availableAmount').get(function() {
  return this.amount;
})

module.exports = Merchant;