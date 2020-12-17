/*
 * transaction.js
 * Copyright (C) 2018 bellchet58 <bellchet@hotmail.com>
 *
 * Distributed under terms of the MIT license.
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { flatten, map, compose } = require('lodash/fp')
const { getTodayRange } = require('../utils/common')
const { supportTokens, supportBonus, supportAmount } = require('../config')
const tokens = supportTokens ? supportTokens: ['eos', 'eth', 'btc'];
const bonusField = supportBonus ? ['bonus']: [];
const amountField = supportAmount ? ['usdtAmount', 'amount']: [];
const tokenCompleteFields = compose(flatten, map(t => ([`${t}Available`, `${t}Freeze`])))(tokens)
const Product = require('./product')

// 转出积分
const TransactionSchema = new Schema({
  unit: {
    type: String,
    enum: ['bonus', 'legal', 'token'],
  },
  // 兑换优惠券的时候没有这一选项
  status: {
    type: String,
    enum: ['applying', 'reject', 'accept'],
    required: true,
    default: 'applying'
  },
  payment: {
    type: String,
    enum: ['alipay', 'tenpay', ...tokens, ...bonusField, ...amountField, 'bonusFreeze', 'edouAvailable', 'amount'],
    required: true,
  },
  // 提现渠道
  channel: {
    type: String,
    enum: ['tenpay', 'alipay', 'edouAvailable', 'btc', 'eth'],
  },
  // 提现渠道对应填的数值,即请求原始值
  channelAmount: {
    type: Number,
  },
  // 提现账号
  account: {
    type: String,
  },
  // 提现时，E豆对应的金额
  cnyAmount: Number,
  // 积分数量/价格
  amount: {
    type: Number,
    min: 0,
    default: 0,
  },
  // 大部分做主体情况
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  // 可用作商户提现的
  merchant: {
    type: Schema.Types.ObjectId,
    ref: 'Merchant',
  },
  // 适用于发放邀请奖励积分的情况
  invitor: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  // 适用于发放邀请奖励积分的情况
  invitee: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: {
    type: Date,
  },
  type: {
    type: String,
    // buyGoods is positive and refund is negative when it is a merchant
    enum: ['rechargeIn', 'extractOut', 'refund', 'buyGoods', 'adminIn', 'adminOut',
      // 那就还是广告包都是自己的收益，不管买了几个翻了几倍，反正都是记录自己的收益。广告包节点收益是他作为区块主或者是父节点，底下的节点完成任务时显示的收益
      'buyBonusTicket', 'goodsBonus', 'registerBonus', 'signInBonus', 'transfer', 'dailyMiner', 'dailyMinerPool', 'dailyMine', 
      'edouExchange', 'watchVideoBonus', 'thumbup', 'donate', 'donateInvitorBonus', 'videoComment', 'goodsComment', 'buyGoodsRevert',
      'publishVideo', 'freezeBenefits', 'freeze', 'freezePayback', 'extractOutRevert', 'lottery', 'lotteryReward', 'buyVip', 'bonusPool'],
    required: true,
    index: true,
  },
  // 修改钱包信息带上
  walletField: {
    type: String,
    enum: [...amountField, ...bonusField, ...tokenCompleteFields],
  },
  // 地址,适用于
  from: {
    type: String,
  },
  // 地址
  to: {
    type: String,
  },
  hash: {
    type: String,
  },
  // 交易成功的图片URL
  hashPicture: {
    type: String
  },
  totalAmount: {
    type: Number,
    min: 0,
  },
  reason: {
    type: String,
  },
  // 不把available的值转移到Freeze上
  ignoreFreeze: {
    type: Boolean,
    default: false
  },
  serviceCharge: {
    type: Number
  },
  // 消耗的ETH手续费
  poundage: Number,
  fromUser: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  toUser: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  // 转化率,围绕50波动
  // donateInvitorBonus时为适用比例
  rate: {
    type: Number,
    min: 0
  },
  relatedTx: {
    type: Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  operator: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  afterAmount: {
    type: Number,
    min: 0
  },
  // 总奖池加后数值
  totalBonusPoolAfterAmount: {
    type: Number,
  },
  name: String,
  freeze: {
    limit: Number,
    days: Number,
    rate: Number,
    dividend: [Number],
  },
  // 购买VIP时有
  vip: {
    level: Number,
    name: String,
    limit: Number,
    percent: Number
  },
  // vip过期时间
  vipExpireAt: Date,
  // 剩余
  leftAmount: Number,
  // 当前收益，仅锁仓记录有
  currentBenefits: {
    type: Number,
    default: 0,
  },
  // 锁仓分红指数
  freezeDividendIndex: Number,
  // 提币返回
  note: String,
  isMinus: {
    type: Boolean,
    default: false,
  },
  releasedAt: Date,
  // 退款的具体商品信息
  orderDetail: {
    type: Product.OrderDetail,
  },
  order: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
  },
  ip: String,
  // 未完成申请的（申请中）,一般用于提现申请情况，completedAt不能说明被拒绝的情况
  // applying 的情况
  // incompleted: {
  //   type: Boolean,
  //   default: false,
  // }
});

TransactionSchema.virtual('freezeField').get(function() {
  const tokens = supportTokens || ['eos', 'eth', 'btc'];
  if([...tokens, 'amount'].indexOf(this.payment) >= 0) {
    return `${this.payment}Freeze`;
  }else if(['bonus'].indexOf(this.payment) >= 0) {
    return this.payment;
  }else {
    return null;
  }
})

TransactionSchema.virtual('isMerchant').get(function() {
  return !this.user;
})

TransactionSchema.virtual('availableField').get(function() {
  const tokens = supportTokens || ['eos', 'eth', 'btc'];
  if(tokens.indexOf(this.payment) >= 0) {
    return `${this.payment}Available`;
  }else if(['bonus', 'amount', 'usdt'].indexOf(this.payment) >= 0) {
    return this.payment === 'usdt' ? `${this.payment}Amount`: this.payment;
  }else {
    return this.payment;
  }
})

TransactionSchema.virtual('extractType').get(function() {
  return this.merchant ? 'merchant' : 'user';
})

TransactionSchema.statics.countTypeToday = async function(type, userId, select) {
  return this.countDocuments({ type, createdAt: getTodayRange(), user: userId });
}

TransactionSchema.statics.countTodayExtractOut = async function({ type = 'extractOut', status , user, payment = 'bonus' }, isMerchant) {
  const userOption = isMerchant ? { merchant: user._id } : { user: user._id};
  return this.countDocuments({ type, createdAt: getTodayRange(), ...userOption, payment })
}

TransactionSchema.statics.findFreezeTxs = async function(userIds) {
  return this.find({ type: 'freeze', leftAmount: { $gt: 0} , user: { $in: userIds }}).populate('user');
}

module.exports = TransactionSchema;
