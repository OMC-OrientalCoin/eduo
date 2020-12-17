const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { get } = require('lodash/fp')
const { getYesterdayRange } = require('../utils/common')
const { getLastTime} = require('../utils/common')

const Change = new Schema({
  // 支持负数
  amount: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    enum: ['donate', 'daily', 'extractOut', 'lotteryReward', 'setting'],
    default: 'donate'
  },
  symbol: {
    type: String,
    default: 'edou'
  },
  high: Number,
  low: Number,
  close: Number,
  open: Number,
  ip: String,
}, {
  timestamps: true,
})

Change.statics.findLastPrice = async function findLastPrice() {
  const change = await this.findOne({ type: 'daily' }, null, { sort: { 'createdAt': -1 } })
  return get('close')(change) || get('config.ticker.cny_edouCoin')(global) || 0
}

Change.statics.findTodayRange = async function findTodayRange () {
  return await this.find({ createdAt: getYesterdayRange(), symbol: 'edou'}, 'high low close open');
}

Change.statics.findNewestPrice = async function findNewestPrice () {
  const change = await this.findOne({}, null, { sort: { 'createdAt': -1 } })
  return get('close')(change) || get('config.ticker.cny_edouCoin')(global) || 0
}

Change.statics.getMarketChange = async function getMarketChange({ startTime, endTime }) {
  return this.aggregate().match({
    type: 'daily',
    createdAt: { $gte: new Date(startTime), $lt: getLastTime(endTime) },
  }).project({
    createdAt: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
    close: 1
  }).group({
    _id: '$createdAt',
    close: { $last: "$close" }
  }).exec();
}

module.exports = Change;