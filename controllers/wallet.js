const db = require('../models');
const ZHTSMSHelper = require('../utils/zhtsms')
const { getAlipaySdk, getCommonParams, formatUrl } = require('../utils/alipayHelper');
const { getTenpaySdk } = require('../utils/tenpayHelper');
const { mapValues, pick, assignIn, map, startCase, set, toNumber, get, compose, identity, toLower, compact, filter, sumBy, toString, sortBy, toUpper } = require('lodash/fp')
const { random } = require('lodash')
const fs = require('fs')
const path = require('path')
const XLSX = require('js-xlsx');
const { getCommaSplited, getJSONs, getGridData, getLastTime, createCompleteTx: createTx, getExcelWorkbook, pickByAttrs, getHost} = require('../utils/common')
const bcrypt = require('bcryptjs');
const { findOne, saveAll, repeatRequest } = require('../utils/promiseHelper')
const { Types } = require('mongoose')
const { sign } = require('alipay-sdk/lib/util');
const { uccDecimals, erc20ContractAddress, commanderPK, commanderAddress } = require('../config')
const Web3Helper = require('../utils/web3')
const LOEXHelper = require('../utils/loexHelper')
const VideoPart = require('../utils/videoPart');
const Ebrgo = require('../utils/ebrgo')
const schedule = require('node-schedule')
const { getAlipayUrl, getTenpayParams } = require('./order')
const moment = require('moment')

const channelEnums = ['tenpay', 'alipay'];
const AMOUNT = 'amount';
const getSMSTemplate = (amount, action, success = true) => `【椿佑堂】您${amount}的${action}申请已被${success ? '通过' : '驳回'}，感谢您的使用`
const headerMapping = {
  'id': '交易ID',
  'userId': '会员ID',
  'nickname': '(转出)会员名称',
  'from': '转出地址',
  'to': '转入地址',
  payment: '变动种类',
  amount: '交易金额',
  serviceCharge: '手续费',
  createdAt: '交易日期',
  operator: '操作人',
  toUser: '转入会员名称',
}
const paymentMapping = {
  usdtAmount: 'USDT',
  uccCoinAvailable: 'UC',
  uccFreeze: '冷钱包积分',
  uccVipFreeze: '冻结积分',
  bonus: '消费积分',
  uccAvailable: '热钱包积分',
  equityBenefits: '股权积分'
}
const minusMapping = {
  'usdtAmount_buyGoods': '-',
  'uccCoinAvailable_exchangeUCCCoin': '',
  'uccFreeze_goodsBonus': '',
  'uccFreeze_dailyMiner': '-',
  'uccFreeze_dailyMinerPool': '-',
  'uccFreeze_dailyMine': '-',
  'uccFreeze_weeklyV6Dividend': '-',
  'uccVipFreeze_releaseFreeze': '-',
  'bonus_goodsBonus': '',
  'bonus_buyGoods': '-',
  'uccAvailable_releaseFreeze': '',
  'uccAvailable_exchangeUCCCoin': '-',
  'uccAvailable_dailyMiner': '',
  'uccAvailable_dailyMinerPool': '',
  'uccAvailable_dailyMine': '',
  'uccAvailable_weeklyV6Dividend': '',
  'equityBenefits_dailyMinerPool': '',
  'equityBenefits_dailyMine': '',
  'equityBenefits_weeklyV6Dividend': '',
}
const getMinusOrNot = (payment, type) => {
  return (num) => {
    switch (type) {
      case 'rechargeIn':
      case 'adminIn':
      case 'buyGoodsRevert':
      case 'extractOutRevert':
        return num;
      case 'adminOut':
      case 'extractOut':
      case 'transfer':
        return -num;
      default:
        return minusMapping[`${payment}_${type}`] ? -num : num;
    }
  }
}

const handleVipBought = async (tx, inputUser) => {
  const user = tx.user.toHexString ? inputUser : tx.user;
  const level = get('vip.level')(tx);
  if (level > user.vipLevel) {
    user.vipLevel = level
    user.vipExpireAt = moment().add(1, 'years').toDate();
  } else if (level === user.vipLevel) {
    user.vipExpireAt = moment(user.vipExpireAt).add(1, 'years').toDate();
  }
  tx.status = 'accept';
  tx.vipExpireAt = user.vipExpireAt;
  tx.completedAt = new Date();
  const results = await saveAll([user, tx]);
  schedule.scheduleJob(user.vipExpireAt, () => { clearExpiredVip(user, db); })
  return results
}

// feature edou: 交易后添加奖池
const getDonateObjs4Save = ({ inputTx, amount, fromUser, toUser, payment, type, config }) => {
  if (fromUser && type === 'donate') {
    // TODO plan B的涨价规则，这里算出总打赏金额后用于更新价格
    // const fluctuationAmount = totalAmount * get('config.donate.fluctuation')(global);
    const absAmount = Math.abs(amount);
    // const totalAmount = absAmount * 100 / (get('config.donate.toUser')(global));
    const totalAmount = absAmount * 100 / (get(`config.vips.vip${toUser && toUser.vipLevel}.percent`)(global) || get('config.donate.toUser')(global));
    if(fromUser[payment] - totalAmount < 0) {
      throw `用户${payment}不足`;
    } else {
      fromUser[payment] -= totalAmount;
      const fromTx = createCompleteTx({
        ...pick(['payment', 'toUser', 'type'])(inputTx),
        fromUser: get('_id')(fromUser),
        amount: totalAmount,
        afterAmount: fromUser[payment],
        user: get('_id')(fromUser),
        isMinus: true,
        operatorId: get('_id')(fromUser),
      })
      const invitor = toUser.invitor;
      let invitorTx, releaseTx;
      const vipPercent = (get(`config.vips.vip${invitor && invitor.vipLevel}.percent`)(global) || get('config.donate.invitorBonusPercent')(global)) / 100;
      // 邀请奖励
      if (invitor && vipPercent) {
        const invitorBonus = absAmount * vipPercent;
        invitor[payment] += invitorBonus;
        invitorTx = createCompleteTx({
          payment: fromTx.payment,
          amount: invitorBonus,
          afterAmount: invitor[payment],
          toUser: invitor,
          user: get('_id')(invitor),
          type: `${type}InvitorBonus`,
          rate: vipPercent,
          relatedTx: fromTx._id
        })
      } 
      const bonusReleaseThreshold = get('bonusReleaseThreshold')(config);
      config.totalBonusPool += totalAmount;
      if(bonusReleaseThreshold && config.totalBonusPool >= bonusReleaseThreshold) {
        const rate =  (get(`config.vips.vip${fromUser && fromUser.vipLevel}.percent`)(global) || get('config.donate.toUser')(global)) / 100 || 0;
        const bonusAmount = bonusReleaseThreshold * rate;
        if (bonusAmount) {
          fromUser[payment] += bonusAmount;
          config.totalBonusPool -= bonusReleaseThreshold;
          releaseTx = createCompleteTx({
            payment: fromTx.payment,
            type: 'bonusPool',
            amount: bonusAmount,
            afterAmount: fromUser[payment],
            totalBonusPoolAfterAmount: config.totalBonusPool,
            user: get('_id')(fromUser),
            relatedTx: get('_id')(inputTx),
          })
        }
      }
      return [fromTx, fromUser, invitor, invitorTx, releaseTx, config]
    }
  } else {
    return []
  }
}
const getQueryOption = (query) => {
  const types = getCommaSplited(query.type)
  const setType = query.type ? set('type', { $in: types }) : identity
  const setId = query.id ? set('_id', Types.ObjectId(query.id)) : identity
  const setTime = query.startTime && query.endTime ? set('createdAt', { $gte: new Date(query.startTime), $lt: getLastTime(query.endTime) }) : identity;
  const setPayment = query.payment ? set('payment', { $in: getCommaSplited(query.payment) }) : identity;
  const setExtract = query.incompleted ? set('status', 'applying') : identity;
  const setCompleteTime = query.processStartTime && query.processEndTime ? set('completedAt', { $gte: new Date(query.processStartTime), $lt: new Date(query.processEndTime) }) : identity;
  const setStatus = query.status ? set('status', query.status) : identity;
  const setChannel = query.channel ? set('channel', query.channel) : identity;
  const setSearchWord = query.searchWord && query.searchWord.length === 24 ? set('_id', Types.ObjectId(query.searchWord)) : identity;
  const baseOption = query.vipLevel ? { 'vip.level': toNumber(query.vipLevel) } : {};
  const productNameOpion = query.productName ? { 'orderDetail.name': new RegExp(query.productName) } : {};
  const setExpireTime = query.vipExpireStartTime && query.vipExpireEndTime ? set('vipExpireAt', { $gte: new Date(query.vipExpireStartTime), $lt: getLastTime(query.vipExpireEndTime) }) : identity;
  const setIsMinus = query.isMinus && (query.isMinus === 'true' || query.isMinus === 'false') ? set('isMinus', query.isMinus === 'true'): identity;
  return compose(setIsMinus, setExpireTime, setSearchWord, setChannel, setStatus, setCompleteTime, setType, setId, setTime, setPayment, setExtract)({ ...baseOption, ...productNameOpion });
}

const rejectTx = async (newOrder, user, { field = 'edouAvailable', operatorId } = Object.create(null)) => {
  const transaction = newOrder;
  newOrder.status = 'reject';
  newOrder.completedAt = new Date();
  user[field] += newOrder.totalAmount
  const tx = createCompleteTx({ payment: transaction.payment, type: `${transaction.type}Revert`, isMinus: true, user: get('_id')(transaction.user), amount: transaction.totalAmount, relatedTx: get('_id')(transaction), operator: operatorId });
  return saveAll([user, newOrder, tx])
}

const createCompleteTx = (params) => {
  return createTx(params, db)
}

const getRechargeTransactionObjs = async (transaction) => {
  const user = transaction.user;
  const field = transaction.payment;
  user[field] += transaction.amount;
  transaction.status = 'accept';
  transaction.completedAt = new Date();
  transaction.afterAmount = user[field];
  return await saveAll([user, transaction]);
}

const getTotalAmount = (field, { amount, isMerchant, inputTotalAmount }) => {
  let totalAmount;
  if (field === AMOUNT) {
    if (isMerchant) {
      totalAmount = amount + get('config.serviceCharge.merchant')(global);
    } else {
      totalAmount = amount + get('config.serviceCharge.user')(global);
    }
  } else {
    totalAmount = amount * get('config.serviceCharge.transfer')(global) / 100;
  }
  return totalAmount > inputTotalAmount ? totalAmount : inputTotalAmount;
}

/**
 * 降价规则
 * @param {*} newOrder E豆提现tx
 */
const downChange = async (newOrder) => {
  const divide = newOrder.type === 'extractOut' ? get('config.downRules')(global) :
    get('config.lottery.downRuleB')(global);
  if (newOrder.status === 'accept' && divide && (newOrder.type === 'extractOut' || newOrder.type === 'lotteryReward')) {
    const percent = newOrder.type === 'extractOut' ? get('config.extractOutDownPercent')(global) / 100 || 1 :
      get('config.lottery.downRuleA')(global) / 100 || 0
    const amount = newOrder.cnyAmount * percent;
    const changeAmount = - (amount / divide);
    const config = await db.Config.getGlobalConfig();
    console.log(`变化前cny_edouCoin:`, config.ticker.cny_edouCoin);
    if (config.ticker.cny_edouCoin + changeAmount >= 0) {
      config.ticker.cny_edouCoin += changeAmount;
      const change = new db.Change({
        amount: changeAmount,
        type: newOrder.type,
        close: config.ticker.cny_edouCoin
      })
      const result = await saveAll([config, change]);
      global.config.ticker.cny_edouCoin += changeAmount;
      console.log(`变化后cny_edouCoin:`, config.ticker.cny_edouCoin);
      return result;
    } else {
      return []
    }
  }
}

const getAlipayAppUrl = async (transaction, user, { notify_url }) => {
  const alipaySdk = getAlipaySdk()
  const commonParams = getCommonParams({
    method: 'alipay.trade.app.pay',
    notifyUrl: notify_url
  });
  const bizContent = {
    body: `${get('mobile')(user)}用户充值`,
    subject: `${get('mobile')(user)}用户充值`,
    outTradeNo: transaction.id,
    totalAmount: transaction.amount,
    productCode: 'QUICK_MSECURITY_PAY',
  }
  const resultParams = set('bizContent', bizContent)(commonParams);
  const params = sign('alipay.trade.app.pay', resultParams, alipaySdk.config);
  const { url } = formatUrl('', params);
  return url;
}

// 获取到腾讯支付的url
const getTenpayAppUrl = async (transaction, user, option) => {
  const tenpaySdk = getTenpaySdk();
  const title = `${get('mobile')(user)}用户充值`;
  delete option.frontUrl;
  let result = await tenpaySdk.getAppParams(assignIn({
    out_trade_no: transaction.id,
    body: title,
    total_fee: toNumber(transaction.amount.toFixed(2)) * 100,
  })(option));
  return result;
}

const getUnionpayAppUrl = async (transaction, user, option) => {
  const javaPart = new VideoPart();
  const title = `${get('mobile')(user)}用户充值`;
  const result = await javaPart.pay({
    frontUrl: option.frontUrl,
    txnAmt: toString(toNumber(transaction.amount.toFixed(2)) * 100),
    orderDesc: title,
    orderId: transaction.id,
    txnTime: moment(transaction.createdAt).format('YYYYMMDDhhmmss'),
  })
  return result;
}

const clearFreeze = async (user, amount, freezeField) => {
  if (user[freezeField] >= amount) {
    user[freezeField] -= amount
    return await user.save();
  }
}

//cyt feature 自动提现
const extractOutUc = async (newOrder, user, operatorId) => {
  const web3Helper = new Web3Helper(erc20ContractAddress, uccDecimals);
  try {
    const hash = await web3Helper.getERC20Tx({ amount: newOrder.amount, toAddress: newOrder.to, privateKey: global.masterPk || commanderPK })
    newOrder.hash = hash
    await newOrder.save()
  } catch (err) {
    await rejectTx(newOrder, user, { operatorId })
    throw err
  }
  // 这边erc20转出
  if (newOrder.hash) {
    await repeatRequest(async () => {
      const result = await web3Helper.getERC20TxByHash(newOrder.hash)
      // 操作之前减过了，应该不用减了吧
      // await clearFreeze(user, newOrder.totalAmount, 'uccCoinAvailable')
      newOrder.completedAt = new Date()
      newOrder.status = 'accept'
      return await newOrder.save()
    }, async () => {
      return await rejectTx(newOrder, user, { operatorId })
    }, Object.create(null))
  }
  return newOrder.hash
}

const transFreeze2Available = async (user, amount, { freezeField, availableField, totalAmount }) => {
  const total = totalAmount || amount;
  if (freezeField && user[freezeField] && user[freezeField] >= total) {
    // feature edou bonus这里不用减冻结
    // user[freezeField] -= total;
    user[availableField] += amount;
    await user.save();
  } else {
    user[availableField] += amount;
    await user.save();
  }
}
const getWalletList = async (req, filterParams = null) => {
  const query = req.query;
  const offset = toNumber(query.start);
  const limit = toNumber(query.limit);
  const allUsers = await db.User.find({}, '_id')
  let getSearchWord = set('user', { $in: map('_id')(allUsers) });
  const setOrder = req.orderIds ? set('order', { $in: req.orderIds }) : identity;
  let result, count;
  const params = pickByAttrs(query, ['nickname', 'areaCode', 'mobile', 'email', 'user']);
  if (query.searchWord || Object.keys(params).length) {
    const containsTransfer = query.type && query.type.indexOf('transfer') >= 0
    // const users = await db.User.find({ $or: compact([{ name: new RegExp(query.searchWord) }, { nickname: new RegExp(query.searchWord) }, query.searchWord.length === 24 && { _id: Types.ObjectId(query.searchWord) }]) }, '_id');
    // const targetUsersId = map('_id')(users)
    const option = await db.User.getUserQueryOption(params);
    const targetUsersId = option.user;
    const setTransferToUser = containsTransfer ? set('$or', [{ user: { $in: targetUsersId } }, { toUser: { $in: targetUsersId } }]) :
      // set('user', { $in: targetUsersId })
      option.user.length ? set('user', { $in: option.user }) : identity;
    getSearchWord = setTransferToUser;
  }
  const option = setOrder(getSearchWord(getQueryOption(req.query)));
  const processRecords = compose(map((tx) => {
    tx.operator = pick(['id', 'nickname', 'mobile'])(tx.operator)
    tx.toUser = pick(['nickname', 'id'])(tx.toUser)
    tx.user = pick(['id', 'name', 'nickname', 'mobile'])(tx.user)
    tx.order = pick(['receivingAddress', 'merchant'])(tx.order);
    tx.order.merchant = pick(['id', 'name'])(tx.order.merchant);
    return tx
  }), getJSONs)
  const [records, recordCount] = await Promise.all([db.Transaction.find(option, filterParams, {
    skip: offset,
    limit,
    sort: {
      createdAt: -1,
    }
  }).populate('user operator toUser order'), db.Transaction.countDocuments(option)]);
  await Promise.all(map(tx => tx.populate('order.merchant').execPopulate())(records))
  result = processRecords(records);
  count = recordCount
  return { result, count }
}

const walletController = {

  getAlipayAppUrl,

  getTenpayAppUrl,

  getUnionpayAppUrl,

  transfer: async (req, resp, next) => {
    const body = req.body
    let { to, amount, serviceCharge, totalAmount, payment = 'edouAvailable', type } = req.body
    if ((!totalAmount || totalAmount < 0 || !amount || amount < 0)) {
      throw '数值必须正数！';
    } else if (!body.paypwd) {
      throw '缺少交易密码'
    }
    const userId = Types.ObjectId(req.session.user._id);
    const [user, toUser] = await Promise.all([db.User.findById(userId), db.User.findOneByMobileOrEmail(body)]);
    const userAmount = user[payment] || user[`${payment}Available`];
    if (!toUser) {
      throw '没有找到对应的用户'
    } else if(user.kycStatus !== 'passed') {
      throw '请先通过实名认证';
    } else if (get('id')(toUser) == userId.toHexString()) {
      throw '不能给自己转账'
    } else if (totalAmount > (userAmount)) {
      throw `当前余额小于总费用`
    } else if (!bcrypt.compareSync(body.paypwd, get('paypwd')(user))) {
      throw '交易密码不正确！';
    }
    const newOrder = new db.Transaction({
      type: type || 'transfer',
      unit: 'token',
      payment,
      amount: amount,
      user: userId,
      totalAmount,
      serviceCharge,
      from: get('address')(user),
      to: get('address')(toUser),
      toUser: get('_id')(toUser),
      completedAt: new Date(),
      status: 'accept',
      operator: userId,
      isMinus: true
    })
    user[`${payment}`] -= toNumber(totalAmount);
    toUser[`${payment}`] += toNumber(amount);
    newOrder.afterAmount = user[payment];
    await saveAll([newOrder, user, toUser])
    resp.success('转账成功')
  },

  // 生成法币/积分充值
  createLegalRecharge: async (req, resp, next) => {
    const body = req.body;
    const userId = Types.ObjectId(req.session.user._id);
    const cnyEdou = get('config.ticker.cny_edou')(global);
    const newOrder = new db.Transaction({
      type: 'rechargeIn',
      unit: 'legal',
      payment: body.payment || 'amount',
      cnyAmount: body.payment === 'bonus' ? body.amount : undefined,
      amount: body.payment === 'bonus' ? toNumber(body.amount) / cnyEdou : body.amount,
      channel: body.channel,
      user: userId,
      rate: body.payment === 'bonus' ? cnyEdou : undefined
    })
    const host = getHost(req);
    const notifyUrl = `http://${host}/wallet/recharge/${body.channel}/receiveNotify`;
    const user = await db.User.findById(userId);
    const transaction = await newOrder.save();
    const result = await walletController[`get${startCase(body.channel)}AppUrl`](transaction, user, {
      notify_url: notifyUrl,
      frontUrl: body.frontUrl
    });
    resp.success(result);
  },

  /**
   * 生成处理充值xxxAmount的记录,用于手动审核
   */
  createTokenAmountRecharge: async (req, resp, next) => {
    const body = req.body;
    const userId = Types.ObjectId(req.session.user._id);
    if (!body.hash) {
      throw '缺少交易哈希'
    }
    const count = await db.Transaction.countDocuments({ type: 'rechargeIn', hash: body.hash })
    let txAmount
    let fromExternalAddress
    if (count) {
      throw 'hash已被用于充值'
    } else if (body.hash) {
      const web3Helper = new Web3Helper()
      const { amount, to, from } = await web3Helper.getERC20TxByHash(body.hash)
      fromExternalAddress = from
      if (!amount || !to) {
        throw '该转账还未到账，请稍后再试'
      } else if (toLower(to) === toLower(get('config.ethAddress')(global))) {
        txAmount = amount
      }
    }
    const newOrder = new db.Transaction({
      type: 'rechargeIn',
      unit: 'token',
      payment: body.payment === 'usdt' ? 'usdtAmount' : body.payment,
      amount: txAmount || body.amount,
      user: userId,
      from: body.from || fromExternalAddress,
      to: get(`ethAddress`)(global.config),
      hash: body.hash
    })
    const transaction = await newOrder.save();
    await transaction.save();
    resp.success('成功生成充币记录,确认后生效')
  },

  createTokenRecharge: async (req, resp, next) => {
    const body = req.body;
    // if (!body.hashPicture) {
    //   throw '缺少转账图片'
    // }
    const user = await findOne(req.session.user.id, db.User, '没找到用户');
    const newOrdr = new db.Transaction(({
      type: 'rechargeIn',
      unit: 'token',
      payment: body.payment === 'usdt' ? 'usdtAmount' : body.payment || 'edouAvailable',
      amount: body.amount,
      from: body.from || user.address,
      to: get(`${body.payment === 'edouAvailable' ? 'ethAddress' : body.payment}Address`)(global.config),
      user: get('_id')(user),
      hashPicture: body.hashPicture,
      hash: body.hash,
    }));
    const transaction = await newOrdr.save();
    // feature cyt 2.0冻结资金另作他用
    // user[transaction.freezeField] += transaction.amount;
    await user.save();
    resp.success('成功生成数字货币充币记录')
  },

  // 法币回调
  // 添加用户amount,修改transaction状态status accept/reject
  receiveRechargeAlipayNotify: async (req, resp, next) => {
    const alipaySdk = getAlipaySdk();
    const body = req.body;
    if (alipaySdk.checkNotifySign(body)) {
      const transactionId = body.out_trade_no;
      const totalAmount = body.total_amount;
      // const sellerEmail = body.seller_email;
      // const appId = body.app_id;
      const transaction = await db.Transaction.findById(transactionId).populate('user');
      if (transaction && totalAmount == transaction.amount) {
        transaction.type === 'rechargeIn' && await getRechargeTransactionObjs(transaction);
        resp.send('success');
      } else {
        resp.send('failed');
      }
    }
  },

  // 法币回调
  // 添加用户amount,修改transaction状态status accept/reject
  receiveRechargeTenpayNotify: async (req, resp, next) => {
    const body = req.weixin;
    const transactionId = body.out_trade_no;
    const totalAmount = body.total_fee;
    // const sellerEmail = body.seller_email;
    // const appId = body.app_id;
    const transaction = await db.Transaction.findById(transactionId).populate('user');
    let msg;
    if (totalAmount != transaction.amount) {
      msg = '金额不相等！';
    }
    transaction.type === 'rechargeIn' && await getRechargeTransactionObjs(transaction);
    resp.reply(msg || '');
  },

  // 法币回调
  receiveRechargeUnionpayNotify: async (req, resp, next) => {
    const body = req.body;
    const transaction = await db.Transaction.findById(body.orderId).populate('user');
    const totalAmount = body.txnAmt;
    if (totalAmount != transaction.amount) {
      msg = '金额不相等！';
    }
    transaction.type === 'rechargeIn' && await getRechargeTransactionObjs(transaction);
    resp.success('success' || msg);
  },

  // feature-edou weixin和alipay保持现状, 原型上EDOU时为EDOU数值，是BTC/ETH则各为自己的值
  // 添加最小额度和最大额度上限
  // 提现手续费
  createExtract: async (req, resp, next) => {
    const body = req.body;
    const serviceChargeRate = get('config.serviceCharge.user')(global) / 100
    // feature edou，这个值用RMB的
    const edouCoinRate = get('config.ticker.cny_edouCoin')(global);
    const originalAmount = toNumber(body.amount);
    // 这里指扣除对应payment的扣的值
    const rateMapping = {
      btc: get('config.ticker.edou_btc')(global),
      eth: get('config.ticker.edou_eth')(global),
      edouAvailable: edouCoinRate,
    }
    const getPaymentAmount = (body, originalAmount) => {
      const { payment, channel } = body;
      if (payment === 'edouAvailable') {
        switch (channel) {
          case 'tenpay':
          case 'alipay':
            return (originalAmount / (edouCoinRate || 1));
          case 'edouAvailable':
            return originalAmount;
          case 'btc':
          case 'eth':
            return rateMapping[channel] * originalAmount;
        }
      } else {
        return originalAmount
      }
    }
    const amount = getPaymentAmount(body, originalAmount)
    let totalAmount = (1 + serviceChargeRate) * amount || toNumber(body.totalAmount)
    let field = channelEnums.indexOf(body.payment) >= 0 ? AMOUNT : body.payment;
    totalAmount = getTotalAmount(field, { amount, inputTotalAmount: totalAmount, isMerchant: body.isMerchant });
    const merchantBottom = get('config.serviceCharge.merchantBottom')(global);
    const merchantTop = get('config.serviceCharge.merchantTop')(global);
    const userBottom = get('config.serviceCharge.userBottom')(global);
    const userTop = get('config.serviceCharge.userTop')(global)
    const isAll = body.isAll ? true : false
    if (!isAll && (!totalAmount || totalAmount < 0 || !amount || amount < 0)) {
      throw '数值必须正数！';
    } else if (body.isMerchant && (amount < merchantBottom || amount > merchantTop)) {
      throw `数值不在商家额度范围(${merchantBottom}-${merchantTop})内`;
    } else if (!isAll && (amount < userBottom || amount > userTop)) {
      throw `数值不在用户额度范围(${userBottom}-${userTop})内`;
    }
    // cyt featurev2 提现要交易密码
    // else if (!body.paypwd && !body.isMerchant && (body.payment === 'bonus' || body.payment === 'edouAvailable')) {
    //   throw '缺少交易密码'
    // }
    let user;
    const setFromTo = body.to ? compose(set('from', body.from), set('to', body.to)) : identity;
    const setOwner = set(body.isMerchant ? 'merchant' : 'user', req.session.user._id);
    if (body.isMerchant) {
      user = await db.Merchant.findById(req.session.user.id).populate('user');
    } else {
      user = await db.User.findById(req.session.user._id);
    }
    const kycStatus = (body.isMerchant && get('user.kycStatus')(user)) || get('kycStatus')(user);
    if (!user) {
      throw '没找到用户，请重新登录'
    }else if(body.payment === 'edouAvailable' && kycStatus !== 'passed') {
      throw '请通过实名认证'
    }
    // feature edou 如果是E豆提现，限制一天一次
    if (body.payment === 'bonus') {
      const todayExtractOuts = await db.Transaction.countTodayExtractOut({ user }, body.isMerchant);
      if (todayExtractOuts >= 1) {
        throw '每天只能申请提现一次'
      }
    }
    const userAmount = user[body.payment] || user[`${body.payment}Available`] || 0;
    totalAmount = isAll ? userAmount : totalAmount
    const actualAmount = totalAmount / (1 + get('config.serviceCharge.user')(global) / 100)
    const serviceCharge = get('config.serviceCharge.user')(global) * actualAmount / 100
    if (!totalAmount) {
      throw '必须为正数!'
    } else if (totalAmount > (userAmount)) {
      throw `当前余额小于总费用`
    }
    // cyt featurev2 提现要交易密码
    // else if (body.payment !== 'amount' && !bcrypt.compareSync(body.paypwd, get('user.paypwd')(user) || get('paypwd')(user))) {
    //   throw '交易密码不正确！';
    // }
    else {
      const edouBonusRate = get('config.ticker.cny_edou')(global);
      // const edouCoinCny = (edouCoinRate || 1) * (originalAmount || actualAmount)
      const getPaymentCnyAmount = (body) => {
        const { payment, channel } = body;
        if (payment === 'edouAvailable') {
          switch (channel) {
            case 'tenpay':
            case 'alipay':
              return originalAmount;
            case 'edouAvailable':
            case 'btc':
            case 'eth':
              return edouCoinRate * amount;
          }
        } else if (payment === 'bonus') {
          return (edouBonusRate || 1) * (amount || actualAmount)
        } else {
          return undefined;
        }
      }
      const newOrder = new db.Transaction(compose(setFromTo, setOwner)({
        payment: body.payment,
        account: body.account,
        amount: amount || actualAmount,
        totalAmount,
        serviceCharge: serviceCharge || body.serviceCharge,
        type: 'extractOut',
        channel: body.channel || (channelEnums.indexOf(body.payment) >= 0 ? body.payment : undefined),
        unit: body.unit || 'legal',
        ignoreFreeze: body.ignoreFreeze,
        cnyAmount: getPaymentCnyAmount(body),
        name: body.name,
        rate: body.payment === 'bonus' ? edouBonusRate : body.payment === 'edouAvailable' ? rateMapping[body.channel] : undefined,
        channelAmount: originalAmount,
        isMinus: true,
        to: body.to,
        status: (!get('config.isBonusExtractOutAudit')(global) && body.payment === 'bonus') ||
          (!get('config.isEdouExtractOutAudit')(global) && body.payment === 'edouAvailable') ||
          (!get('config.isLegalExtractOutAudit')(global) && body.payment === 'amount') ? 'accept' : 'applying',
      }));
      newOrder.completedAt = newOrder.status === 'accept' ? new Date() : undefined;
      // cyt feature field ucc => uccCoin
      // field = newOrder.ignoreFreeze ? `${field}Coin` : field
      if (field === AMOUNT) {
        user[field] -= totalAmount;
      } else if (user[field]) {
        user[field] -= totalAmount
      }
      // feature edou 提现过一次后不显示新人专享
      if (body.payment === 'edouAvailable' && user.isNewEdouAvailableExtractOut) {
        user.isNewEdouAvailableExtractOut = false;
      }
      newOrder.afterAmount = user[field];
      await saveAll([user, newOrder]);
      //cyt feature 自动提现
      resp.success('提现申请成功');
      // TODO 改位置到通过后
      // 提现成功则改变价格，仅E豆提现
      newOrder.status === 'accept' && await downChange(newOrder);
    }
  },

  createTokenExtract: async (req, resp, next) => {
    req.body.unit = 'token';
    req.body.payment = req.body.payment === 'edou' ? 'edouAvailable' : req.body.payment;
    await walletController.createExtract(req, resp, next);
  },

  getMyTransactions: async (req, resp, next) => {
    const query = req.query;
    const types = getCommaSplited(query.type)
    const setTypes = types.length ? set('type', { $in: types }) : identity
    const userId = req.session.user._id
    const setUnit = query.unit ? set('unit', query.unit) : identity
    const searchTransfer = types.indexOf('transfer') >= 0 ? set('$or', [{ user: Types.ObjectId(userId) }, { toUser: Types.ObjectId(userId) }])
      : set('user', Types.ObjectId(userId))
    // const searchTransfer = set('$or', [{ user: Types.ObjectId(userId) }, { toUser: Types.ObjectId(userId) }])
    const ignoreRejectedOption = query.ignoreRejected === 'false' ? Object.create(null) : { status: { $ne: 'reject' } }
    const setPayment = query.payment ? set('payment', { $in: getCommaSplited(query.payment) }) : identity;
    const records = await db.Transaction.find(setPayment(setTypes(setUnit(searchTransfer(ignoreRejectedOption)))), null, {
      sort: { createdAt: -1 }
    }).populate('invitor');
    const getResult = compose(map(record => {
      record.status = record.status === 'accept' ? 'completed' : record.status;
      return record;
    }), getJSONs)
    resp.success(getResult(records));
  },

  getWalletList: async (req, resp, next) => {
    const { result, count = result.length } = await getWalletList(req)
    resp.success(getGridData(result, count));
  },

  getRefundList: async (req, resp, next) => {
    const orders = await db.Order.getOrderQueryOption(pick(['merchantName', 'name', 'receivingMobile', 'order'])(req.query))
    req.orderIds = orders.length ? map('_id')(orders) : undefined;
    req.query.type = 'refund';
    const { result, count = result.length } = await getWalletList(req)
    resp.success(getGridData(result, count));
  },

  getBonusPoolList: async (req, resp, next) => {
    req.query.type = 'bonusPool';
    const { result, count = result.length } = await getWalletList(req, 'user amount type payment createdAt');
    resp.success(getGridData(result, count))
  },

  exportList: async (req, resp, next) => {
    delete req.query.limit;
    delete req.query.start;
    const { result } = await getWalletList(req, { ...mapValues(v => 1)(headerMapping), user: 1, type: 1 })
    const dataCategory = (req.query.type && req.query.type.indexOf(',') >= 0) || !req.query.type ? '数据管理' : req.query.type
    const fileName = `${dataCategory}结果${Date.parse(new Date())}.xlsx`
    const excelPath = path.resolve('./public', fileName);
    const mapExcelData = map(tx => {
      tx = { ...tx, ...pick(['nickname'])(tx.user) };
      tx.userId = get('user.id')(tx)
      tx.operator = get('operator.nickname')(tx)
      tx.amount = getMinusOrNot(tx.payment, tx.type)(tx.amount)
      tx.toUser = get('toUser.nickname')(tx)
      tx.payment = paymentMapping[tx.payment]
      return tx;
    })
    XLSX.writeFile(getExcelWorkbook(headerMapping, mapExcelData(result)), excelPath);
    resp.download(excelPath, fileName, (err) => {
      if (err) {
        next(err);
      } else {
        fs.unlink(excelPath, (err) => err && console.error(err))
      }
    })
  },

  // 通过（商家/用户）提现申请/转入/转出
  // platform's admin/superAdmin
  acceptTransaction: async (req, resp) => {
    const smsHelper = new ZHTSMSHelper()
    const body = req.body;
    const ebrgo = new Ebrgo()
    let transaction = await db.Transaction.findById(req.params.transactionId).populate('user merchant');
    const action = transaction.type === 'extractOut' ? '提现' : '充值';
    const coin = transaction.type === 'extractOut' ? 'UCC' : 'USDT';
    transaction.operator = req.session.user._id;
    if (!transaction) {
      throw '没找到对应申请'
    } else if (transaction.status !== 'applying') {
      throw '不是申请中的状态'
    }
    // 提现. 原来是自动的，现在改手动了 cyt v3
    if (transaction.type === 'extractOut') {
      // 商户统计里需要已提取的余额
      if (transaction.extractType === 'merchant' && transaction.payment === AMOUNT) {
        await transFreeze2Available(transaction[transaction.extractType], transaction.amount, { freezeField: transaction.freezeField, availableField: 'extractedAmount', totalAmount: transaction.totalAmount })
      }
      await clearFreeze(transaction[transaction.extractType], transaction.totalAmount, transaction.freezeField);
      // 自动提币
      // try {
      //   await extractOutUc(transaction, transaction.user, req.session.user._id)
      // } catch (err) {
      //   await smsHelper.getSMS({ mobile: get('mobile')(transaction.user), message: getSMSTemplate(transaction.amount, `${coin}${action}`, false) })
      //   throw err
      // }
      // 自动Ebrgo打款
      // try {
      //   const result = transaction.payment === 'edouAvailable' && await ebrgo.erc20transfer(transaction);
      //   transaction.hash = get('hash')(result);
      // } catch (err) {
      //   await rejectTx(transaction, transaction.user, { operatorId: req.session.user._id })
      // }
      // TOKEN转入
    } else if (transaction.type === 'rechargeIn') {
      await transFreeze2Available(transaction[transaction.extractType], transaction.totalAmount || transaction.amount,
        { freezeField: transaction.payment === 'usdtAmount' ? null : transaction.freezeField, availableField: transaction.availableField })
    }
    transaction.status = 'accept';
    transaction.completedAt = new Date();
    await transaction.save();
    transaction.status === 'accept' && transaction.payment === 'edouAvailable' && await downChange(transaction);
    resp.success(`同意${action}成功!`);
    // await smsHelper.getSMS({ mobile: get('mobile')(transaction.user), message: getSMSTemplate(transaction.amount, `${coin}${action}`) })
  },

  // platform's admin/superAdmin
  rejectTransaction: async (req, resp) => {
    const smsHelper = new ZHTSMSHelper()
    const reason = req.body.reason
    const transaction = await db.Transaction.findById(req.params.transactionId).populate('user merchant');
    transaction.operator = req.session.user._id;
    if (transaction.status !== 'applying') {
      throw '不是申请中的状态'
    }
    // 提现
    if (transaction.type === 'extractOut') {
      // feature cyt v3 退款也要 记录
      const tx = createCompleteTx({ payment: transaction.payment, type: `${transaction.type}Revert`, user: get('_id')(transaction.user), amount: transaction.totalAmount, relatedTx: get('_id')(transaction), operator: req.session.user._id });
      // 这里只顾cyt的不兼容了艹
      await Promise.all([transFreeze2Available(transaction[transaction.extractType], transaction.totalAmount, { freezeField: transaction.freezeField, availableField: transaction.availableField }), tx.save()]);
      // TOKEN转入
    }//这边排除是充值USDT换USDT余额的情况
    else if (transaction.type === 'rechargeIn' && (transaction.payment !== 'usdt' || transaction.payment !== 'usdtAmount')) {
      await clearFreeze(transaction.user, transaction.totalAmount || transaction.amount, transaction.freezeField);
    }
    transaction.reason = reason
    transaction.status = 'reject';
    transaction.completedAt = new Date();
    await transaction.save();
    const action = transaction.type === 'extractOut' ? '提现' : '充值';
    const coin = transaction.type === 'extractOut' ? 'UCC' : 'USDT';
    resp.success(`拒绝${action}成功!`);
    const result = await smsHelper.getSMS({ mobile: get('mobile')(transaction.user), message: getSMSTemplate(transaction.amount, `${coin}${action}`, false) })
  },

  /**
   * bonus => edou E豆划转Edou
   */
  exchange: async (req, resp) => {
    const body = req.body;
    const user = await db.User.findById(req.session.user._id)
    const amount = toNumber(body.amount);
    const rate = get('config.ticker.cny_edou')(global) && get('config.ticker.cny_edouCoin')(global) / get('config.ticker.cny_edou')(global);
    const edouCoinAmount = rate && (amount / rate)
    const kycStatus = (get('user.kycStatus')(user)) || get('kycStatus')(user);
    if(kycStatus !== 'passed') {
      throw '请通过实名认证'
    }
    if (amount && rate) {
      user.bonus -= amount;
      user.edouAvailable += edouCoinAmount;
      const bonusTx = new db.Transaction({
        unit: 'token',
        status: 'accept',
        payment: 'bonus',
        amount: amount,
        user: get('_id')(user),
        completedAt: new Date(),
        type: 'edouExchange',
        afterAmount: user.bonus,
        rate,
        isMinus: true,
      })
      const edouTx = createCompleteTx({
        payment: 'edouAvailable',
        amount: edouCoinAmount,
        type: bonusTx.type,
        user: get('_id')(user),
        operator: get('_id')(user),
        afterAmount: user.edouAvailable,
        rate,
        relatedTx: bonusTx._id
      })
      await saveAll([user, bonusTx, edouTx])
      resp.success(user)
    } else {
      throw '积分余额不足'
    }
  },

  /**
   * 矿机数据管理获取
   */
  minerStatistics: async (req, resp, next) => {
    const query = req.query
    const queryOption = { ...getQueryOption(query), payment: { $in: ['uccAvailable', 'equityBenefits'] }, type: { $in: ['dailyMiner', 'dailyMinerPool', 'dailyMine', 'weeklyV6Dividend'] } }
    const txs = await db.Transaction.find(queryOption, 'amount payment type')
    const minerBenefitsFilter = filter(tx => tx.payment === 'uccAvailable' && tx.type === 'dailyMiner')
    const minerPoolBenefitsFilter = filter(tx => tx.payment === 'uccAvailable' && tx.type === 'dailyMinerPool')
    const mineBenefitsFilter = filter(tx => tx.payment === 'uccAvailable' && (tx.type === 'dailyMine' || tx.type === 'weeklyV6Dividend'))
    resp.success({
      minerBenefits: sumBy('amount')(minerBenefitsFilter(txs)),
      minerPoolBenefits: sumBy('amount')(minerPoolBenefitsFilter(txs)),
      mineBenefits: sumBy('amount')(mineBenefitsFilter(txs)),
      equityBenefits: sumBy('amount')(filter(['payment', 'equityBenefits'])(txs))
    })
  },

  /**
   * 锁仓
   */
  freeze: async (req, resp, next) => {
    const body = req.body;
    const freezes = get('config.freeze')(global);
    const freezeIndex = toNumber(body.index);
    const freeze = freezes && freezes[freezeIndex];
    const userId = req.session.user._id;
    const user = await db.User.findOneNotNull(userId);
    if (!freeze) {
      throw '找不到对应的锁仓产品'
    } else if (user.bonus < freeze.limit) {
      throw '积分不足'
    }
    user.bonus -= get('limit')(freeze);
    user.bonusFreeze += get('limit')(freeze);
    const tx = createCompleteTx({
      payment: 'bonus',
      type: `freeze`,
      user: userId,
      amount: get('limit')(freeze),
      operator: userId,
      freeze,
      leftAmount: (freeze.limit * freeze.rate * freeze.days / 100),
      afterAmount: user.bonus,
      releasedAt: moment().add(freeze.days, 'days').toDate(),
      isMinus: true,
    })
    await saveAll([user, tx]);
    resp.success('锁仓成功')
  },

  /**
   * 价格走势
   * @param {*} req 
   * @param {*} resp 
   * @param {*} next 
   */
  market: async (req, resp, next) => {
    const changes = await db.Change.getMarketChange(req.query);
    const sortedChanges = sortBy(c => new Date(c._id))(changes);
    resp.success({
      chartData: {
        series: map('close')(sortedChanges),
        xData: map('_id')(sortedChanges),
        legend: changes.length ? ['EDOU'] : [],
      }
    })
  },

  /**
   * 抽奖
   * @param {*} req 
   * @param {*} resp 
   * @param {*} next 
   */
  lottery: async (req, resp, next) => {
    const userId = req.session.user._id;
    const [length, user] = await Promise.all([db.Transaction.countTypeToday('lottery', userId),
    db.User.findOneNotNull(userId)]);
    const times = get('config.lottery.times')(global)
    const limit = get('config.lottery.limit')(global)
    const min = get('config.lottery.min')(global)
    const max = get('config.lottery.max')(global)
    if (length >= times) {
      throw `每日抽奖最多每天可抽${times}次`;
    } else if (user.bonus < limit) {
      throw '积分余额不足';
    } else {
      const amount = random(min, max)
      user.bonus -= limit;
      const tx = createCompleteTx({
        payment: 'bonus',
        type: `lottery`,
        user: userId,
        amount: limit,
        operator: userId,
        afterAmount: user.bonus,
        lotteryReward: amount,
        isMinus: true,
      })
      user.bonus += amount;
      const cnyEdou = get('config.ticker.cny_edou')(global)
      const getBonusCny = (price) => ((cnyEdou && (price / cnyEdou)) || price);
      const rewardTx = createCompleteTx({
        payment: 'bonus',
        type: `lotteryReward`,
        user: userId,
        amount,
        operator: userId,
        afterAmount: user.bonus,
        relatedTx: tx._id,
        cnyAmount: getBonusCny(amount)
      })
      tx.relatedTx = rewardTx._id;
      await Promise.all([saveAll([user, tx, rewardTx]), downChange(rewardTx)]);
      resp.success(pick(['amount'])(rewardTx))
    }
  },

  /**
   * 充值回调, erc20, edou
   */
  ebrgoIn: async (req, resp, next) => {
    const body = req.body;
    const address = body.intoAddress;
    const amount = toNumber(body.intoNumber);
    const user = await db.User.findOne({ address: { $in: [address, toLower(address), toUpper(address)] } })
    if (amount > 0 && user) {
      user.edouAvailable += amount;
      const tx = createCompleteTx({
        payment: 'edouAvailable',
        type: `rechargeIn`,
        user: get('_id')(user),
        amount,
        operator: get('_id')(user),
        afterAmount: user.edouAvailable,
        hash: get('hash')(body),
      })
      await saveAll([user, tx])
    }
    resp.json({ code: 10000 })
  },

  /**
   * 提币回调
   */
  ebrgoOut: async (req, resp, next) => {
    const body = req.body;
    const tx = await db.Transaction.findById(body.orderid).populate('user');
    if (tx) {
      tx.status = 'accept';
      tx.completedAt = new Date();
      tx.poundage = body.poundage;
      tx.note = body.note;
      await tx.save();
    }
    resp.json({ code: 10000 })
  },

  /**
   * 购买VIP，用得两种支付
   */
  buyVip: async (req, resp, next) => {
    const body = req.body;
    const level = toNumber(body.level);
    const user = await db.User.findOneNotNull(req.session.user._id);
    const vip = get(`config.vips.vip${level}`)(global)
    const userId = user._id;
    const cnyEdou = get('config.ticker.cny_edou')(global)
    const getBonusCny = body.payment === 'bonus' ? (price) => ((cnyEdou && (price / cnyEdou)) || price) : identity;
    let result;
    if (level < user.vipLevel) {
      throw '不可降级购买';
    } else {
      const tx = new db.Transaction({
        unit: 'legal',
        payment: body.payment,
        amount: getBonusCny(get('limit')(vip)),
        user: userId,
        type: 'buyVip',
        operator: userId,
        isMinus: true,
        vip: { ...vip, level }
      })
      if (body.payment === 'amount' || body.payment === 'bonus') {
        if (user[body.payment] >= tx.amount) {
          user[body.payment] -= tx.amount;
          tx.afterAmount = user[body.payment];
          await saveAll([user, tx]);
          result = await handleVipBought(tx, user);
        } else {
          throw `用户${body.payment}余额不足`
        }
      } else {
        result = body.payment === 'alipay' ? getAlipayUrl(tx, `${getHost(req)}/tx/alipay/receiveNotify`) :
          await getTenpayParams(tx, `${getHost(req)}/tx/tenpay/receiveNotify`)
        await tx.save();
      }
      resp.success(result);
    }
  },

  receiveAlipayNotify: async (req, resp, next) => {
    const alipaySdk = getAlipaySdk();
    const body = req.body;
    console.log('buy vip incoming alipay', JSON.stringify(body));
    if (alipaySdk.checkNotifySign(body)) {
      const orderId = body.out_trade_no;
      const totalAmount = body.total_amount;
      const sellerEmail = body.seller_email;
      const appId = body.app_id;
      const tx = await db.Transaction.findById(orderId).populate('user')
      if (totalAmount == get('amount')(tx)) {
        const results = await handleVipBought(tx);
        resp.send('success');
      }
    }
  },

  tenpayReceiveNotify: async (req, resp, next) => {
    const body = req.weixin;
    const orderId = body.out_trade_no;
    console.log('buy vip incoming tenpay', JSON.stringify(body));
    const tx = await db.Transaction.findById(orderId).populate('user');
    let msg;
    if ((get('amount')(tx)) != body.total_fee) {
      msg = '金额不正确'
    }
    const results = await handleVipBought(tx);
    res.reply(msg || '');
  },

  /**
   * 创建资产变动
   * TODO 要明确有限制一天次数的是否满足条件，目前要求Java部分处理这部分
   */
  manualCreateTx: async (req, resp, next) => {
    const availableTypes = ['publishVideo', 'videoComment', 'donate', 'thumbup', 'watchVideoBonus'];
    const body = req.body;
    const amount = toNumber(body.amount);
    const payment = 'bonus';
    let fromUser, toUser, tx, config;
    if (availableTypes.indexOf(body.type) < 0) {
      throw '非限定的变动类型';
    } else if (Math.abs(amount) === Infinity || !amount) {
      throw '数值不正确'
    }
    if (body.from) {
      try {
        fromUser = await db.User.findById(body.from);
      } catch (err) { }
    }
    [toUser, config] = await Promise.all([db.User.findById(body.to).populate('invitor'),
    db.Config.getGlobalConfig()])
    if (!toUser) {
      throw '未找到用户'
    } else if (!fromUser && body.type === 'donate') {
      throw '打赏缺少参数';
    }
    if (toUser[payment] + amount >= 0) {
      toUser[payment] += amount;
      tx = createCompleteTx({
        payment,
        amount,
        afterAmount: toUser[payment],
        toUser,
        fromUser: get('_id')(fromUser),
        user: get('_id')(toUser),
        type: `${body.type}`,
        operatorId: get('_id')(fromUser),
        ip: req.ip
      })
      const [fromTx, ...others] = getDonateObjs4Save({
        inputTx: tx, amount, fromUser, toUser, payment, type: body.type,
        config
      })
      tx.relatedTx = get('_id')(fromTx);
      await saveAll([fromTx, ...others, toUser, tx]);
    } else {
      throw `${body.type}用户${payment}不足`
    }
    // 若是打赏时，给被推荐人发放
    resp.success(tx);
  }

}


module.exports = walletController;