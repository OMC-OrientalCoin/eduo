const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ReceivingAddress = require('./receivingAddress');
const { getUnit } = require('../utils/common')
const { findOne } = require('../utils/promiseHelper');
const { get, sumBy, identity, set, compose, map, groupBy, mapValues } = require('lodash/fp')
const { supportTokens, supportBonus, supportAmount } = require('../config')
const tokens = supportTokens ? supportTokens: ['eos', 'eth', 'btc'];
const bonusField = supportBonus ? ['bonus']: [];
const amountField = supportAmount ? ['usdtAmount']: [];
const Product = require('./product')

const Order = new Schema({
  // 运费
  freight: {
    type: Number,
    min: 0,
    default: 0,
  },
  // 快递名称
  trackingCompany: {
    type: String,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  // 适用于商户的情况
  merchant: {
    type: Schema.Types.ObjectId,
    ref: 'Merchant',
  },
  receivingAddress: {
    type: ReceivingAddress,
  },
  // 物流单号
  trackingNum: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  orderDetail: [Product.OrderDetail],
  // 订单备注
  comment: {
    type: String,
  },
  // 评论
  comments: {
    type: [Product.Comment],
  },
  // 优惠券减免
  bonus: {
    type: Number,
    min: 0,
    default: 0,
  },
  // 完成订单获取到的积分
  earnBonus: {
    type: Number,
    min: 0,
    default: 0,
  },
  amount: {
    type: Number,
    min: 0,
  },
  actualPrice: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 已退款金额
  refundedAmount: {
    type: Number,
    min: 0,
  },
  // 退款交易
  refundTxs: {
    type: [Schema.Types.ObjectId],
    ref: 'Transaction'
  },
  reason: {
    type: String,
    enum: ['dontwant', 'productBroken', 'incorrect', 'wrapBroken', 'numIncorrect', 'others'],
  },
  payment: {
    type: String,
    enum: ['alipay', 'tenpay', ...amountField,  ...bonusField, ...tokens],
  },
  refundWay: {
    type: String,
    enum: ['money', 'product', 'money_product'],
  },
  // 退款描述
  description: {
    type: String,
  },
  // 退款凭证照片
  imageUrls: [String],
  // 退款账号
  account: String,
  // 退款渠道
  channel: {
    type: String,
    enum: ['alipay', 'tenpay', ...amountField, ...tokens],
  },
  status: {
    type: String,
    enum: ['unpaid', 'paid', 'deliverying', 'completed', 'refunding', 'refunded', 'rejectRefund', 'canceled', 'accepted', 'rejected'],
    default: 'unpaid',
  },
  // 适用于积分商城
  needDelivery: {
    type: Boolean,
    default: true,
  },
  // 收货人
  name: {
    type: String,
  },
  // 收货人联系方式
  mobile: {
    type: String,
  },
  completedAt: {
    type: Date,
  },
  paidAt: {
    type: Date,
  },
  refundAt: Date,
  closedAt: {
    type: Date,
  },
  // 自动取消时间
  autoClosedAt: {
    type: Date,
  },
  // 自动完成日期
  autoCompletedAt: {
    type: Date,
  },
  // 用户申领的优惠券ID
  ticket: {
    type: Schema.Types.ObjectId,
    ref: 'ApplyBonusTicket',
  },
  relatedTx: {
    type: Schema.Types.ObjectId,
    ref: 'Transaction'
  }
});

Order.virtual('supportBonus').get(function() {
  return !this.merchant;
})

// 总价（含运费）按人民币算的
Order.virtual('noDiscountPrice').get(function() {
  const cnyEdou = get('config.ticker.cny_edou')(global)
  const getBonusCny = this.payment === 'bonus' ? (price) => ((cnyEdou && (price / cnyEdou)) || price) : identity;
  const amount = sumBy(detail => detail.price * detail.num)(this.orderDetail)
  const totalAmount = amount + this.freight - this.bonus;
  return getBonusCny(totalAmount);
})


// 对应payment的结算单位
Order.virtual('allPrice').get(function() {
  const total =  this.amount + this.freight - this.bonus;
  const amount = getUnit(this.payment) === 'token' ? total * get(`config.ticker.${this.payment}_cny`)(global) : total;
  return amount;
})

Order.statics.findOneNotNull = async function findOneNotNull(params) {
  return await findOne(params, this, '未找到订单');
}

// mobile/name/order/merchantName/搜索
Order.statics.getOrderQueryOption = async function getOrderQueryOption(params, orderField = 'order') {
  let merchants = [], merchantOption = {};
  const setMobile = params.receivingMobile ? set('mobile', new RegExp(params.receivingMobile)) : identity;
  const setName = params.setName ? set('name', params.name): identity;
  const setParams = compose(setMobile, setName);
  if(params.merchantName) {
    merchants = await mongoose.model('Merchant').find({ name: new RegExp(params.merchantName)}, '_id');
    merchantOption = { merchant: map('_id')(merchants) }
  }
  if(Object.keys(params).length) {
    const option = params.order && params.order.length === 24 ? { _id: mongoose.Types.ObjectId(params.user)} : {}
    const orders = await this.find(setParams({ ...option, ...merchantOption }), '_id');
    return { [orderField]: map('_id')(orders) }
  }else {
    return Object.create(null);
  }
}

// /admin/order/getAllOrderInfo/sum
Order.statics.getNum = async function getNum(option, userId) {
  const txs = await this.find({ ...option, user: mongoose.Types.ObjectId(userId)}, 'status type payment');
  return compose(mapValues(get('length')), groupBy('status'))(txs);
}

module.exports = Order;
