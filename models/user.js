/*
 * user.js
 *
 * Distributed under terms of the MIT license.
 */
const mongoose = require('mongoose');
const { getDailyMinerBenefits, userFilter } = require('../utils/common')
const { findOne } = require('../utils/promiseHelper')
const { identity, compose, join, map, range, get, sumBy, memoize, max, sum, filter, pullAt, findIndex, every, curryRight } = require('lodash/fp')
const Schema = mongoose.Schema;
const { supportTokens } = require('../config');
const tokens = supportTokens || ['eos', 'eth', 'btc'];
const setTokens = (option) => {
  const fieldOption = {
    type: Number,
    min: 0,
    default: 0,
  };
  tokens.map(token => {
    option[`${token}Available`] = fieldOption
    option[`${token}Freeze`] = fieldOption
  })
  return option;
}

const getRandomAddress = () => {
  const get10bit = () => (0x1000000 + (Math.random()) * 0xffffff * 0xffff).toString(16).substr(0, 10);
  const getResult = compose(join(''), map(get10bit));
  return getResult(range(0, 4)).replace(/\./, 'd');
}

const UserSchema = new Schema(setTokens({
  // 头像链接地址
  avatar: {
    type: String,
    trim: true,
  },
  // 真实姓名
  name: {
    type: String,
    trim: true,
  },
  nickname: {
    type: String,
    trim: true,
  },
  // 手机区号
  areaCode: String,
  mobile: {
    type: String,
    // required: true,
  },
  rank: {
    type: Number,
    default: 1,
    min: 0
  },
  // 钱包余额
  amount: {
    type: Number,
    min: 0,
    default: 0,
  },
  usdtAmount: {
    type: Number,
    min: 0,
    default: 0
  },
  // 冻结余额
  amountFreeze: {
    type: Number,
    min: 0,
    default: 0,
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
  // 会员积分
  bonus: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 冻结E豆
  bonusFreeze: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 自己的邀请码
  invitorCode: {
    type: String,
  },
  // 输入的邀请码
  inputInvitorCode: {
    type: String,
  },
  invitor: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  // 当前获得邀请积分
  invitorBonus: {
    type: Number,
    min: 0,
    default: 0,
  },
  applyMerchant: {
    type: String,
    enum: ['applying', 'refuse', 'success'],
  },
  applyMerchantAt: {
    type: Date,
  },
  // 申请到的商家ID
  merchantId: {
    type: Schema.Types.ObjectId,
    ref: 'Merchant',
  },
  // 申请提交时候的商户信息
  merchant: {
    name: String,
    code: String,
    businessLicense: String,
    address: String,
    mainType: {
      type: Schema.Types.ObjectId,
      ref: 'MainType',
    }
  },
  IDCard: {
    type: String,
  },
  // 身份证正面
  front: {
    type: String,
  },
  back: {
    type: String,
  },
  // 手持证件照正面
  handheldFront: {
    type: String,
  },
  orders: {
    type: [Schema.Types.ObjectId],
    ref: 'Order',
  },
  bonusTickets: [{
    type: Schema.Types.ObjectId,
    ref: 'ApplyBonusTicket',
  }],
  // 所在城市
  location: {
    type: String,
  },
  // 备注
  comment: {
    type: String,
  },
  // 会员层级，具体内容确认不了
  // level: {
  //   type: String,
  // },
  gender: {
    type: String,
    enum: ['female', 'male', 'secret'],
    default: 'secret',
  },
  pwd: {
    type: String,
    required: true,
  },
  paypwd: {
    type: String,
    required: true,
  },
  parentUser: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  childUsers: {
    type: [Schema.Types.ObjectId],
    ref: 'User',
  },
  receivingAddress: {
    type: [Schema.Types.ObjectId],
    ref: 'ReceivingAddress',
  },
  authGroup: {
    platform: {
      type: String,
      // admin: 审核管理员, viewer反正就是能查看
      enum: ['merchantAdmin', 'admin', 'superAdmin', 'viewer', 'null'],
      default: 'null',
    },
    merchant: {
      type: String,
      // admin: 订单管理员
      enum: ['superAdmin', 'admin', 'merchantAdmin', 'null'],
      default: 'null',
    }
  },
  servingMerchant: {
    type: Schema.Types.ObjectId,
    ref: 'Merchant',
  },
  status: {
    type: String,
    enum: ['enabled', 'disabled'],
    default: 'enabled',
  },
  // 钱包状态
  walletStatus: {
    type: String,
    enum: ['enabled', 'disabled'],
    default: 'enabled',
  },
  applyKycAt: {
    type: Date,
  },
  handleKycAt: Date,
  kycStatus: {
    type: String,
    enum: ['unreviewed', 'reviewing', 'notPassed', 'passed'],
    default: 'unreviewed'
  },
  //会员层级默认是0
  vipLevel: {
    type: Number,
    default: 0,
  },
  // 购买时的过期时间
  vipExpireAt: Date,
  //假地址
  address: {
    type: String,
    default: getRandomAddress,
  },
  //矿机数量
  miners: {
    type: Number,
    default: 0,
    min: 0
  },
  //矿机收益
  minerBenefits: {
    type: Number,
    default: 0,
    min: 0
  },
  minerPoolBenefits: {
    type: Number,
    default: 0,
    min: 0
  },
  mineBenefits: {
    type: Number,
    default: 0,
    min: 0
  },
  email: {
    type: String,
    trim: true,
  },
  // 用户类型
  registBy: {
    type: String,
    enum: ['mobile', 'email']
  },
  // 收藏
  collectProducts: [{
    type: Schema.Types.ObjectId,
    ref: 'Product'
  }],
  // 是否有第一次提现EDOU,若是，则没提现过
  isNewEdouAvailableExtractOut: {
    type: Boolean,
    default: true,
  },
  // newestVersion: {
  //   type: String,
  // },
  // versionUrl: {
  //   type: String,
  //   default: '',
  // }
}), {
  timestamps: true
});

UserSchema.virtual('inviteNum').get(function () {
  return this.childUsers && this.childUsers.length;
})

//每日释放收益
UserSchema.virtual('dailyMinerBenefits').get(function () {
  return getDailyMinerBenefits(this.miners)
})

// 获取用户部分搜索子集
UserSchema.statics.getUserQueryOption = async function (params, userField = 'user') {
  if(Object.keys(params).length) {
    const option = params.user && params.user.length === 24 ? { _id: mongoose.Types.ObjectId(params.user)} : userFilter(params)
    const users = await this.find(option, '_id');
    return { [userField]: map('_id')(users) }
  }else {
    return Object.create(null)
  }
}

UserSchema.statics.getUserInfo = async function getUserInfo(userIds, fields = 'id nickname mobile email user areaCode') {
  return this.find({ _id: { $in: userIds } }, fields);
}

// 搜索Vip过期的
UserSchema.statics.getVipLevelExpired = async function() {
  return this.find({ vipLevel: { $gt: 0}, vipExpireAt: { $gte: new Date()}}, '_id vipLevel vipExpireAt');
}

UserSchema.statics.findOneNotNull = async function findOneNotNull(params) {
  return await findOne(params, this, '未找到用户');
}

UserSchema.statics.findOneByMobileOrEmail = function findOneByMobileOrEmail({ email, mobile, userId }, otherOption) {
  const option = mobile ? { mobile } : (userId ? { _id: mongoose.Types.ObjectId(userId) } : { email })
  return this.findOne(option, null, otherOption);
}

const getVipLevel = ((node) => {
  if (node) {
    const blockMiners = map('model.sumMiners')(node.children)
    const largestBlockMiners = max(blockMiners)
    const restBlockMiners = sum(blockMiners) - largestBlockMiners
    const getLevel1Length = compose(get('length'), filter(level => level === 1), map(getVipLevel))
    const isEveryoneHasMiners = every(node => node.model.miners)
    if (restBlockMiners >= get('config.mineBenefits.vip6.limit')(global)) {
      return 6
    } else if (restBlockMiners >= get('config.mineBenefits.vip5.limit')(global)) {
      return 5
    } else if (restBlockMiners >= get('config.mineBenefits.vip4.limit')(global)) {
      return 4
    } else if (restBlockMiners >= get('config.mineBenefits.vip3.limit')(global)) {
      return 3
    } else if (getLevel1Length(node.children) >= get('config.mineBenefits.vip2.limit')(global)) {
      return 2
    } else if (node.children.length >= get('config.mineBenefits.vip1.limit')(global) && isEveryoneHasMiners(node.children)) {
      return 1
    } else {
      return 0
    }
  } else {
    return 0
  }
})

// 获取实时等级
// UserSchema.virtual('realVipLevel').get(function () {
//   if (global.root && global.root.first && !this.vipLevel) {
//     const node = global.root.first(n => n.model.id == this.id)
//     const level = getVipLevel(node)
//     this.vipLevel = this.vipLevel || level
//     return level
//   }
//   return this.vipLevel
// })

module.exports = UserSchema;
