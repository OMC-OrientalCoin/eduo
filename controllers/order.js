
const { autoCompleteDeliveryingOrder, getCompleteOrderTransactionObjs, cancelDeliveryOrder } = require('../utils/orderHelper');
const db = require('../models');
const { Types, model } = require('mongoose');
const { notNull, notRole } = require('../utils/accessAuth')
const { throwFailedMessage, saveAll } = require('../utils/promiseHelper');
const { getUnit, getUserPayField, isAdmin, getGridData, getJSONs, getObjectIds, getLastTime, getExcelWorkbook, deleteProperties, getCommaSplited, createCompleteTx, pickByAttrs, getHost } = require('../utils/common');
const { mapValues, values, some, identity, slice, keys, filter, pick, set, get, compose, flatten, uniq, toNumber, trim, sortBy, map, sumBy, find, assignIn, compact, join, toString, split, toUpper } = require('lodash/fp');
const { getAlipaySdk, getCommonParams, formatUrl } = require('../utils/alipayHelper');
const { SUCCESS_PAY, SUCCESS_DELETE } = require('../commons/respCommons')
const { CLOSED, COMPLETED } = require('../commons/orderStatus');
const { sign } = require('alipay-sdk/lib/util');
const { supportTokens } = require('../config')
const { getTenpaySdk, refund: refundTenpay } = require('../utils/tenpayHelper');
const { refund: refundAlipay } = require('../utils/alipayHelper');
const VideoPart = require('../utils/videoPart')
const bcrypt = require('bcryptjs')
const AlipayFormData = require('alipay-sdk/lib/form').default;
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const XLSX = require('js-xlsx');
const PAID = 'paid';
const UNPAID = 'unpaid';
const REFUNDING = 'refunding';
const WAIT4RECEIPT = 'deliverying';
const REFUNDED = 'refunded';
const REJECTREFUND = 'rejectRefund';
const REJECTED = 'rejected';
const orderStatusMapping = {
  'unpaid': '待付款',
  'paid_usdtAmount': '待审核',
  'paid_bonus': '已支付',
  'rejected': '已驳回',
  'accepted': '待发货',
  'delivering': '已发货',
  'canceled': '已取消',
  'completed': '已完成'
}
const TOKENS = supportTokens || ['eth', 'btc', 'eos'];
const { accessHanlder } = require('../utils/accessAuth');
const schedule = require('node-schedule');
const moment = require('moment');
const headerMapping = {
  'id': '订单ID',
  'nickname': '买家用户名',
  'productName': '购买商品',
  'amount': '订单总额',
  'payment': '支付方式',
  name: '姓名',
  phone: '电话',
  address: '地址',
  zipCode: '邮编',
  createdAt: '下单时间',
  status: '订单状态',
}
const goodsBonusMapping = {
  usdtAmount: 'bonus',
  bonus: 'uccFreeze'
}

const getCnyCorrespondBonus = (cny) => {
  const bonus = cny * get('config.cnyBonus')(global);
  return bonus;
}

const getPointNumLen = (num) => {
  const getLen = compose(get('1.length'), split('.'), toString);
  return getLen(num);
}

const getAlipayUrl = (order, url) => {
  const alipaySdk = getAlipaySdk()
  const commonParams = getCommonParams({
    method: 'alipay.trade.app.pay',
    notifyUrl: url
  });
  const amount = order.allPrice || order.amount;
  if (!order) {
    throw ('没找到该订单！');
  } else {
    if (amount < 0.01 || amount > 100000000 || getPointNumLen(amount) > 3) {
      throw ('金额过大或小数点位数不对，请重新下单！');
    }
    let title = `${get('merchant.name')(order) ? get('merchant.name')(order) + '_' : ''}收款`;
    title = order.type === 'buyVip' ? `购买VIP${get('vip.name')(order)}` : title;
    const bizContent = {
      body: title,
      subject: title,
      outTradeNo: order.id,
      totalAmount: amount,
      productCode: 'QUICK_MSECURITY_PAY',
    }
    const resultParams = set('bizContent', bizContent)(commonParams);
    // return alipaySdk.exec('alipay.trade.app.pay', resultParams, {
    //   validateSign: true,
    // });
    const params = sign('alipay.trade.app.pay', resultParams, alipaySdk.config);
    const { url } = formatUrl('', params);
    return url;
  }
}

const getTenpayParams = async (order, url) => {
  const tenpaySdk = getTenpaySdk();
  const title = `${get('merchant.name')(order) ? get('merchant.name')(order) + '_' : ''}收款`;
  const amount = order.allPrice || order.amount;
  if (!order) {
    throw '没找到订单';
  } else if (some(o => o.status !== UNPAID)(get('orders')(order))) {
    throw '订单状态不是待付款'
  } 
  // else if (get('user')(order) != req.session.user._id) {
  //   throw '支付的不是当前用户订单';
  // }
  let result = await tenpaySdk.getAppParams({
    out_trade_no: order.id,
    body: title,
    total_fee: toNumber(amount.toFixed(2)) * 100,
    notify_url: url,
    // spbill_create_ip: host.indexOf(':') ? host.slice(0, host.indexOf(':')): host,
  });
  return result;
}

const getQueryOption = (query) => {
  const setStatus = query.status ? set('status', { $in: getCommaSplited(query.status) }) : identity;
  const setTime = query.startTime && query.endTime ? set('createdAt', { $gte: new Date(query.startTime), $lt: getLastTime(query.endTime) }) : identity;
  const setMerchantId = query.merchantId ? set('merchant', Types.ObjectId(query.merchantId)) : identity;
  const productNameOption = query.productName ? { 'orderDetail.name': new RegExp(query.productName) } : {};
  const setReceiveName = query.name ? set('name', query.name) : identity;
  const setPhone = query.phone ? set('mobile', query.phone) : identity;
  return compose(setPhone, setReceiveName, setStatus, setTime, setMerchantId)(productNameOption);
}

// 保留到小数点后两个
const getAmount = sumBy(p => {
  let price;
  const saleSpecication = p.saleSpecId && p.saleSpecification.id(p.saleSpecId)
  price = saleSpecication ? saleSpecication.price : p.price;
  return (price * p.num)
});

const isTicketUsable = (ticket, products) => {
  if (!ticket) {
    return 0;
  }
  const getSuitableProducts = filter(p => (ticket.ticket.suitableProducts.indexOf(p._id) >= 0));
  const getSuitableAmount = compose(getAmount, getSuitableProducts)
  const amount = getSuitableAmount(products);
  // 不在时间范围内
  if (moment().isBefore(ticket.ticket.startTime) || moment().isAfter(ticket.ticket.endTime)) {
    return 0;
  } else if (ticket.ticket.condition && ticket.ticket.condition > amount) {
    return 0;
  } else {
    return ticket.ticket.bonus;
  }
}
const createNewOrder = ({ freight, userId, body, merchant, orderDetail, bonus, amount, ticket, detail }) => {
  const setTicket = ticket ? set('ticket', get('_id')(ticket)) : identity;
  // feature edou
  const cnyEdou = get('config.ticker.cny_edou')(global)
  const getBonusCny = body.payment === 'bonus' ? (price) => ((cnyEdou && (price / cnyEdou)) || price) : identity;
  const setPrice = map(detail => {
    detail.price = detail.salePrice || detail.price
    return detail;
  })
  const totalPrice = toNumber((amount + freight - bonus).toFixed(2));
  const newOrder = new db.Order(setTicket({
    freight,
    user: Types.ObjectId(userId),
    merchant: get('_id')(merchant),
    receivingAddress: {
      name: body.name,
      phone: body.mobile,
      address: body.receivingAddress,
      zipCode: body.zipCode,
    },
    orderDetail: setPrice(map(pick(['productId', 'num', 'saleSpecifaction', 'salePrice', 'name', 'thumbnail', 'price', 'earnBonus']))(detail)),
    comment: orderDetail.comment,
    // 还要计算优惠券的份额
    bonus,
    // 获取到商品款
    amount: getBonusCny(amount),
    actualPrice: getBonusCny(totalPrice),
    payment: body.payment,
    needDelivery: orderDetail.delivery === 'pickUp' ? false : true,
    name: body.name,
    mobile: body.mobile,
    // attention 这里和原分配机制不共存
    // earnBonus: sumBy('earnBonus')(detail) || getCnyCorrespondBonus(totalPrice),
    earnBonus: sumBy('earnBonus')(detail),
    autoClosedAt: moment().add(get('config.shopping.cancelTime')(global), 'minutes').toDate(),
  }))
  return newOrder;
}

// 判断产品套餐()是否大于30
const getNewOrder = ({ freight, userId, merchants, orderDetail, detail, body, ticket, bonus, products, customerOrders, user }) => {
  const merchant = merchants.find(m => m.id == orderDetail.id);
  // 金额
  let amount = 0;
  let productCache = Object.create(null);
  // 商家
  if (merchant) {
    merchant.salesVolumn += sumBy('num')(detail)
  }
  // 如果有优惠券，则改优惠券状态
  if (ticket) {
    ticket.usedTime = new Date();
  }
  try {
    // TODO 计算运费
    detail = detail.map(p => {
      let spec;
      // 这里注意防止改到同一个对象
      // 这个对象用于提供基本数据的
      // 这里删除saleSpecification为了防止保存时候出问题
      delete p.saleSpecification
      p = Object.assign(productCache[p.id] || {}, p);
      // 用于搜索历史购买记录个数
      const getHistoryProductNum = sumBy(compose(sumBy('num'), filter(d => d.productId == p.id), get('orderDetail')))
      // 这个对象用于修改数据保存的
      productCache[p.id] = Object.assign(products.find(prd => prd.id == p.id), p);
      const prdCache = productCache[p.id];
      spec = prdCache.saleSpecification.id ? prdCache.saleSpecification.id(p.saleSpecId) : prdCache.saleSpecification.find(sp => sp.id == p.saleSpecId)
      // 商户的库存不足
      const historyProductNum = getHistoryProductNum(customerOrders)
      const isSalesAmountEnough = (merchant && (p.amount < p.num || p.saleSpecId && (get('amount')(spec) < p.num))) || (!merchant && p.amount < p.num)
      const findAreaCost = (area) => find(cost => cost.areas.indexOf(area) >= 0)(p.template && p.template.areaCost);
      const { first = 0, others = 0 } = p.containsFreight ? {} : findAreaCost(body.area) || get('areaCost.0')(p.template);
      freight += p.containsFreight ? 0 : (p.num > 1 ? (first + (p.num - 1) * others) : first)
      if (process.env.NODE_ENV !== 'production') {
        console.log(`${p.name}的${p.num}运费(${first}, ${others})=${(p.num > 1 ? (first + (p.num - 1) * others) : first)}`)
      }
      if (isSalesAmountEnough) {
        throw `${p.name}库存不足`;
      } else if (merchant && p.perLimit && p.perLimit < p.num) {
        throw `${p.name}每次购买限制${p.perLimit}件商品`;
      } else if ((p.id == db.minerProductId && ((get('mineBenefits.burning.purchaseLimit')(global.config) <= historyProductNum) ||
        (get('mineBenefits.burning.purchaseLimit')(global.config) <= get('miners')(user)))) ||
        // 这边是非矿机的情况
        (p.countLimit && p.countLimit <= historyProductNum)
      ) {
        throw `${p.name}总计购买限制${get('mineBenefits.burning.purchaseLimit')(global.config) || p.countLimit}件商品`
      } else if (spec) {
        spec.salesVolumn += toNumber(p.num);
        spec.amount -= toNumber(p.num);
        amount += spec.price * toNumber(p.num);
        p.saleSpecifaction = spec.saleSpecifaction;
        // 这里和下面的setPrice一起避免改到原product的价格属性
        p.salePrice = spec.price;
      } else {
        // 积分，或者是正常没有规格的商户商品情况
        amount += p.price * toNumber(p.num)
      }
      prdCache.salesVolumn += p.num
      prdCache.amount -= p.num;
      return p;
    })
  } catch (err) {
    throw err
  }
  // 积分
  return [createNewOrder({ freight, userId, body, merchant, orderDetail, bonus, amount, ticket, detail }),
    merchant, ticket, ...values(productCache)];
}

const parentsMinersSum = (node) => {
  while (node.parent) {
    node = node.parent
    node.model.sumMiners += 1
  }
}

/**
 * 格式化后台显示的订单
 * @param {*} order 
 */
const formatOrder = (order) => {
  order.products = order.orderDetail.map(detail => {
    detail.id = get('id')(detail.productId);
    detail.name = get('name')(detail.productId);
    // detail.saleSpecifaction = get('saleSpecifaction')(detail.productId);
    delete detail.productId;
    return detail;
  })
  order.user = pick(['_id', 'name', 'nickname'])(order.user);
  order.merchant = pick(['_id', 'name'])(order.merchant);
  delete order.orderDetail;
  return order;
}

const getSelectOrders = async (req, filterParams = null) => {
  const query = req.query;
  const searchWord = trim(query.searchWord);
  // 查找已付款的订单
  const setIsBonus = (query.isBonus === true || query.isBonus === 'true') ? set('payment', 'bonus') : ((query.isBonus === false || query.isBonus === 'false') ? set('payment', 'usdtAmount') : identity)
  let queryOption = setIsBonus(getQueryOption(query));
  const getResult = compose(map(formatOrder), getJSONs);
  let result, count;
  if (searchWord && searchWord.length === 24) {
    const order = await db.Order.findById(searchWord).populate('user merchant orderDetail.productId')
    result = [order]
  } else if (query.merchantName) {
    const merchants = await db.Merchant.find({ name: new RegExp(query.merchantName) }, '_id');
    [result, count] = await Promise.all([db.Order.find(queryOption, filterParams).populate('user merchant orderDetail.productId'), db.Order.countDocuments(queryOption)]);
  } else {
    // 获取所有orders
    let users, option;
    const params = pickByAttrs(query, ['mobile', 'email'])
    option = await db.User.getUserQueryOption(params);
    // users = await db.User.find({ nickname: new RegExp(query.searchWord) }, '_id');
    // const setUsers = query.searchWord ? set('user', { $in: map('_id')(users) }) : identity;
    // queryOption = (setUsers(queryOption));
    [result, count] = await Promise.all([db.Order.find({ ...option, ...queryOption }, filterParams, {
      skip: Math.max(toNumber(query.start), 0),
      limit: toNumber(query.limit),
      sort: {
        createdAt: -1
      }
    }).populate('user merchant orderDetail.productId'), db.Order.countDocuments(queryOption)]);
  }
  result = getResult(result);
  return { result, count }
}


const getParents = (user) => {
  const firstParent = global.root.first({ strategy: 'breadth' }, node => node.model.id == user.invitor);
  const parents = []
  let parent = firstParent;
  while (parent && parent.parent) {
    parent = parent && parent.parent;
    if (parent) {
      parents.push(parent)
    } else {
      break;
    }
  }
  return parents
}

const deliveryVipFreezeBonus = (user, relatedTx) => {
  const amount = 3500 * get('config.wallet.uccVipFreezeReleasePercent')(global) / 100
  if (user.uccVipFreeze >= amount) {
    user.uccAvailable += amount
    user.uccVipFreeze -= amount
    const sideEffectTxUcc = createCompleteTx({ payment: 'uccAvailable', type: `releaseFreeze`, user: get('_id')(user), amount, relatedTx: get('_id')(relatedTx) }, db);
    const sideEffectTxVip = createCompleteTx({ payment: 'uccVipFreeze', type: `releaseFreeze`, user: get('_id')(user), amount, relatedTx: get('_id')(relatedTx) }, db);
    return [user, sideEffectTxUcc, sideEffectTxVip];
  } else {
    return []
  }
}


// 如果是矿机，则添加冷钱包积分
// 在用户上添加当前矿机
const getPayTransactionObjs = (payment, user, order) => {
  if (user[getUserPayField(payment)] < order.allPrice) {
    return []
  } else {
    const newTransaction = new db.Transaction({
      payment,
      status: 'accept',
      amount: order.allPrice,
      user: user._id,
      completedAt: new Date(),
      type: 'buyGoods',
      unit: getUnit(payment),
      afterAmount: user[getUserPayField(payment)],
      isMinus: true,
    })
    let bonus = order.earnBonus || getCnyCorrespondBonus(order.actualPrice);
    // 积分商城的话，不发放积分
    // cyt feature 积分商品也送积分
    // cyt feature usdt产品套餐,奖励过渡积分
    let sideEffectTx;
    // if (payment === 'bonus') {
    //   bonus = order.earnBonus || 0
    //   user.uccFreeze += bonus
    //   const normalOrderMinersAmount = !get('merchant')(order) ? 1 : 0
    //   const minersAmount = get('orders.length')(order) || normalOrderMinersAmount || 0
    //   user.miners += minersAmount
    //   if (minersAmount) {
    //     let node = global.root.first(n => n.model.id == user.id)
    //     if (node) {
    //       node.model.miners += 1
    //       parentsMinersSum(node)
    //     }
    //   }
    //   newTransaction.operator = user._id;
    //   const sideEffectPayment = goodsBonusMapping[newTransaction.payment];
    //   sideEffectTx = createCompleteTx({ payment: sideEffectPayment, type: `goodsBonus`, user: get('_id')(user), amount: bonus, relatedTx: get('_id')(newTransaction), operator: user._id }, db);
    // }
    order = set('orders.0.relatedTx', newTransaction._id)(order);
    // cyt feature
    user[getUserPayField(payment)] -= (order.allPrice || order.actualPrice);
    return [user, newTransaction, order, sideEffectTx];
  }
}

const getOrdersPaid = async (orders) => {
  const paidOrders = await Promise.all([orders.map(o => {
    o.paidAt = new Date();
    o.status = PAID;
    return o.save();
  })]);
  return paidOrders
}

const getRefundTransactionObjs = ({ payment, user, order, tx}) => {
  const findOrderDetailByProductId = (id) => find(['productId', Types.ObjectId(id)])(order.orderDetail);
  const merchant = order.merchant;
  const payField = getUserPayField(payment);
  // if (user.bonus < order.earnBonus) {
  //   throw '用户积分不足，不允许退款'
  // }
  if (merchant[payField] < tx.amount) {
    throw `商户${payment}余额不足，不允许退款`
  }
  const orderDetail = findOrderDetailByProductId(get('orderDetail.productId')(tx));
  const num = get('orderDetail.num')(tx);
  orderDetail.refundingNum -= num;
  orderDetail.refundedNum += num;
  tx.status = 'accept'
  tx.afterAmount = user[payField];
  tx.unit = getUnit(payment);
  tx.completedAt = new Date();
  // user.bonus -= order.earnBonus;
  order.status = REFUNDED;
  order.completedAt = new Date();
  user[payField] += tx.amount;
  merchant[payField] -= tx.amount;
  return [tx, order, user, merchant];
}

const rollbackBonusOrder = async (grandOrder) => {
  const order = await db.Order.findById(get('orders.0')(grandOrder)).populate('orderDetail.productId');
  const product = get('orderDetail.0.productId')(order);
  const num = get('orderDetail.0.num')(order);
  if (product) {
    if (product.salesVolumn >= num) {
      product.salesVolumn -= num;
    }
    product.amount += num;
  }
  await Promise.all([grandOrder && grandOrder.remove(), order && order.remove(), product && product.save()]);
}

const orderController = {

  getAlipayUrl,

  getTenpayParams,

  updateComment(req, resp, next) {
    if (!isAdmin(req.session.user)) {
      resp.failed('当前用户没有权限');
    } else {
      db.Order.findById(req.params.orderId).then(order => {
        order.comment = req.body.comment;
        return order.save();
      }).then(order => {
        resp.success(order);
      }).catch(next);
    }
  },

  selectByStatus: async (req, resp, next) => {
    const query = req.query;
    // TODO 这个payment可能有bonus
    // const setPayment = query.payment ? set('payment', query.payment) : set('payment', { $nin: 'bonus' });
    const setPayment = query.payment ? set('payment', query.payment) : identity;
    const orders = await db.Order.find(setPayment({
      user: Types.ObjectId(req.session.user._id),
    })).populate('orderDetail.productId merchant');
    const getResult = compose(map(order => {
      order.orderDetail = order.orderDetail.map(detail => {
        // price要按销售规格
        detail = assignIn(detail)(pick(['name', 'imageUrl'])(detail.product || detail.productId));
        detail.productId = get('id')(detail.productId)
        detail.price = detail.price || get('price')(detail.product || detail.productId)
        detail.name = detail.name || get('name')(detail.product || detail.productId)
        delete detail.product
        return detail
      })
      order.telephone = get('merchant.telephone')(order);
      order.merchant = pick(['name', 'id', '_id', 'businessLicense', 'businessStartTime', 'businessEndTime'])(order.merchant)
      return order;
    }), getJSONs);
    resp.success(getGridData(getResult(orders)));
  },
  
  selectByStatusLength: async(req, resp, next) => {
    const query = req.query;
    const setPayment = query.payment ? set('payment', query.payment) : identity;
    const setStatus = query.status ? set('status', getCommaSplited(query.status)): identity;
    const setStartTime = query.startTime ? set('createdAt', { $gte: new Date(query.startTime)}) : identity;
    const process = compose(setStartTime, setStatus, setPayment);
    const count = await db.Order.getNum(process({}), req.session.user._id);
    resp.success(count);
  },

  // 确认收货，修改成已完成的订单
  confirmReceipt: async (req, resp, next) => {
    let order = await db.Order.findById(req.params.orderId).populate('merchant user');
    if (!order) {
      throw ('找不到该订单！');
    } else if (req.session.user.id != order.user._id) {
      throw ('不是当前用户的订单，不能操作！');
    } else if (order.status !== WAIT4RECEIPT) {
      throw ('当前订单状态不是已发货');
    } else {
      order.completedAt = new Date()
      order.status = COMPLETED;
      [order] = await saveAll(getCompleteOrderTransactionObjs(order, db));
      resp.success(order);
    }
  },

  // 后台搜索
  select: async (req, resp, next) => {
    const { result, count = result.length } = await getSelectOrders(req)
    resp.success(getGridData(result, count))
  },

  export: async (req, resp, next) => {
    delete req.query.limit;
    delete req.query.start;
    const { result } = await getSelectOrders(req, { ...mapValues(v => 1)(headerMapping), orderDetail: 1, receivingAddress: 1, user: 1, products: 1 })
    const fileName = `订单结果${Date.parse(new Date())}.xlsx`
    const excelPath = path.resolve('./public', fileName);
    const mapExcelData = map(order => {
      order = { ...order, ...pick(['name', 'phone', 'address', 'zipCode'])(order.receivingAddress) };
      const payment = order.payment
      const tempStatus = `${order.status}_${payment}`
      order.nickname = get('user.nickname')(order);
      order.productName = get('products.0.name')(order);
      order.payment = order.payment === 'usdtAmount' ? 'USDT' : '消费积分';
      order.status = orderStatusMapping[tempStatus] || orderStatusMapping[order.status];
      return order;
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

  // 检查特定规格有无库存
  // 添加商家以及Product的销售量
  // 验证每次购买限制，验证总计最多购买限制
  create: async (req, resp, next) => {
    const body = req.body;
    const userId = req.session.user._id;
    const orderDetail = JSON.parse(body.orderDetail);
    const getProductIds = compose(getObjectIds, uniq, map('productId'), flatten, map('products'));
    const getMerchantIds = compose(getObjectIds, uniq, map('id'));
    const getBonusTicketsIds = compose(getObjectIds, uniq, map('bonusTicketId'));
    const saleSpecName = (saleSpect) => (saleSpect && ((saleSpect.firstSpecification || '') + (saleSpect.secondSpecification || '') + (saleSpect.thirdSpecification || '')))
    const getSingleFreight = product => (product.containsFreight ? 0 : (Math.round(product.num / product.each) * product.freight) || 0);
    const user = await db.User.findById(userId)
    const products = await db.Product.find({ _id: { $in: getProductIds(orderDetail) } }).populate('template')
    const merchants = await db.Merchant.find({ _id: { $in: getMerchantIds(orderDetail) } })
    const bonusTickets = await db.ApplyBonusTicket.find({ _id: { $in: getBonusTicketsIds(orderDetail) } });
    const customerOrders = await db.Order.find({ user: Types.ObjectId(userId), paidAt: { $exists: true } }, 'orderDetail merchant');
    const getCompleteProduct = (product) => {
      const theProduct = products.find(p => p.id == product.productId);
      return assignIn(theProduct)(product);
    }
    // 这里用ID可能搜不到
    const getDetail = p => {
      const completeProduct = getCompleteProduct(p);
      return (Object.assign(completeProduct, ({ productId: Types.ObjectId(p.productId), saleSpecification: compose(saleSpecName, find(s => s.id == p.saleSpecId), get('saleSpecification'))(completeProduct) })))
    }
    let objs;
    try {
      const getOrder = map(orderDetail => {
        const productsRequire = map(getCompleteProduct)(orderDetail.products)
        const detail = orderDetail.products.map(getDetail)
        const ticket = bonusTickets.find(b => b.id == orderDetail.bonusTicketId);
        const bonus = isTicketUsable(ticket, productsRequire);
        const freight = orderDetail.delivery === 'pickUp' ? 0 : sumBy(getSingleFreight)(productsRequire);
        if (get('usedTime')(ticket)) {
          throw '优惠券已被使用';
        }
        const [newOrder, ...others] = getNewOrder({ freight, userId, merchants, orderDetail, detail, body, ticket, bonus, products, customerOrders, user });
        // feature cyt2
        // if (!newOrder.merchant && body.payment !== 'bonus') {
        //   throw '订单中有积分商品和商户商品,是无效订单'
        // }
        return [newOrder, ...others];
      });
      objs = await saveAll(flatten(getOrder(orderDetail)));
      const orders = objs && objs.filter(o => get('length')(o.orderDetail));
      // 没支付的话取消订单
      orders.map(o => {
        schedule.scheduleJob(o.autoClosedAt, () => {
          cancelDeliveryOrder(o, db);
        })
      })
      const total = sumBy('actualPrice')(orders);
      const newPurchaseOrder = new db.PurchaseOrder(assignIn(pick(['receivingAddress', 'name', 'mobile', 'payment'])(body))({
        orders: getObjectIds(map('_id')(orders)),
        user: userId,
        actualPrice: total,
        earnBonus: sumBy('earnBonus')(orders)
      }));
      let purchaseOrder = await newPurchaseOrder.save();
      // 计算大订单的换算值
      purchaseOrder.allPrice = getUnit(purchaseOrder.payment) === 'token' ? total * get(`config.ticker.${purchaseOrder.payment}_cny`)(global) : total;
      purchaseOrder = await purchaseOrder.save();
      resp.success(purchaseOrder);
    } catch (err) {
      next(err)
    }
  },

  // 发货
  // 商户superAdmin,merchantAdmin,admin;平台superAdmin,merchantAdmin
  express(req, resp, next) {
    const body = req.body;
    if (!req.params.orderId) {
      resp.failed('请输入订单号！');
    } else if (body.needDelivery === 'true' && !body.trackingNum) {
      resp.failed('请输入物流单号！');
    } else {
      const sessionUser = req.session.user;
      const deliveryDays = get('config.shopping.deliveryDays')(global);
      db.Order.findById(req.params.orderId).then(order => {
        if (!order) {
          return throwFailedMessage('没找到订单');
        }
        const notAccessPlatform = order.supportBonus && (!notNull(sessionUser, 'platform') || !notRole(sessionUser, 'platform', 'admin'));
        const notAccessMerchant = !order.supportBonus && !notNull(sessionUser, 'merchant');
        if (notAccessPlatform && notAccessMerchant) {
          return throwFailedMessage('没有权限')
        } else if (!order.paidAt) {
          return throwFailedMessage('该订单还没有支付');
        } else if (order.closedAt) {
          return throwFailedMessage('该单已被取消！');
        }
        // else if (order.payment === 'usdtAmount' && order.status !== 'accepted') {
        //   return throwFailedMessage('该订单未通过审核')
        // }
        order.trackingCompany = body.trackingCompany;
        order.trackingNum = body.trackingNum;
        // 修改为待收货状态
        order.status = WAIT4RECEIPT;
        order.autoCompletedAt = moment().add(deliveryDays, 'days').toDate();
        return order.save();
      }).then((order) => {
        // 自动完成订单
        schedule.scheduleJob(order.autoCompletedAt, () => (autoCompleteDeliveryingOrder(order)))
        resp.success('订单已发货！');
      }).catch(next);
    }
  },
  pay: async (req, resp, next) => {
    const payment = req.params.payment;
    switch (payment) {
      case 'alipay':
        await orderController.payAliApp(req, resp, next);
        break;
      case 'tenpay':
        await orderController.payTen(req, resp, next);
        break;
      case 'unionpay':
        await orderController.payUnion(req, resp, next);
        break;
      case 'eos':
      case 'eth':
      case 'btc':
      case 'amount':
      case 'bonus':
        await orderController.commonPay(req, resp, next);
        break;
      default:
        await orderController.commonPay(req, resp, next);
        req.wsInstance.getWss().clients.forEach(ws => {
          if (ws.route.indexOf('subscribe') >= 0 && ws.params.action === 'create')
            ws.send('有新的订单, 请注意查看')
        })
    }
  },

  commonPay: async (req, resp, next) => {
    const grandOrder = await db.PurchaseOrder.findById(req.params.orderId).populate('orders');
    const normalOrder = await db.Order.findById(req.params.orderId)
    const user = await db.User.findById(req.session.user.id);
    let payment = req.params.payment;
    const paymentProp = TOKENS.indexOf(payment) >= 0 ? `${payment}Available` : payment;
    let parents = []
    try {
      if (!user) {
        throw '没找到用户';
      } else if (!grandOrder && !normalOrder) {
        throw '没找到订单';
      } else if (!req.body.paypwd) {
        throw '缺少支付密码';
      } else if (some(o => o.status !== UNPAID)(get('orders')(grandOrder)) && get('status')(normalOrder) != UNPAID) {
        throw '订单状态不是待付款'
      } else if (get('user')(grandOrder) != user.id && get('user')(normalOrder) != user.id) {
        throw '支付的不是当前用户订单';
      } else if (user[paymentProp] < get('allPrice')(grandOrder || normalOrder)) {
        throw `${payment === 'amount' ? '' : (payment === 'bonus' ? '积分' : toUpper(payment))}余额不足!`;
      } else if ((get('orders.0.orderDetail.0.productId')(grandOrder) || get('orderDetail.0.productId')(normalOrder)).toHexString() === db.minerProductId.toHexString() &&
        get('miners')(user) >= get('mineBenefits.burning.purchaseLimit')(global.config)) {
        throw `矿机总计购买限制${get('mineBenefits.burning.purchaseLimit')(global.config)}件`
      } else if (!bcrypt.compareSync(req.body.paypwd, user.paypwd)) {
        throw '支付密码不正确'
      }
    } catch (err) {
      payment === 'bonus' && await rollbackBonusOrder(grandOrder);
      throw err
    }
    let [uselessUser, relatedTx] = await saveAll(getPayTransactionObjs(payment, user, grandOrder || normalOrder));
    // 发放冻结钱包
    // if (payment === 'bonus' && get('earnBonus')(grandOrder || normalOrder)) {
    //   parents = await db.User.find({ '_id': { '$in': getObjectIds(getParents(user).map(parent => parent.model.id)) } });
    //   const getSaveObjs = compose(flatten, map(parent => deliveryVipFreezeBonus(parent, relatedTx)))
    //   await saveAll(getSaveObjs(parents));
    // }
    // 状态改为支付完成
    const orders = grandOrder ? grandOrder.orders : [normalOrder]
    await getOrdersPaid(orders);
    resp.success(SUCCESS_PAY)
  },

  // 腾讯支付，还不懂咋写
  // 添加交易记录
  payTen: async (req, resp, next) => {
    const grandOrder = await db.PurchaseOrder.findById(req.params.orderId).populate('merchant orders')
    const normalOrder = await db.Order.findById(req.params.orderId).populate('merchant');
    const order = grandOrder || normalOrder;
    const host = getHost(req);
    const result = await getTenpayParams(order, `http://${host}/order/pay/tenpay/receiveNotify`);
      resp.success(result);
    },

  /**
   * 银联支付代理
   */
  payUnion: async (req, resp, next) => {
    const javaPart = new VideoPart()
    const grandOrder = await db.PurchaseOrder.findById(req.params.orderId).populate('merchant orders')
    const normalOrder = await db.Order.findById(req.params.orderId).populate('merchant');
    const order = grandOrder || normalOrder;
    const title = `${get('merchant.name')(order) ? get('merchant.name')(order) + '_' : ''}收款`;
    if (!order) {
      throw '没找到订单';
    } else if (some(o => o.status !== UNPAID)(get('orders')(order))) {
      throw '订单状态不是待付款'
    } else if (get('user')(order) != req.session.user._id) {
      throw '支付的不是当前用户订单';
    }
    const params = {
      frontUrl: req.body.frontUrl,
      txnAmt: toString(toNumber(order.allPrice.toFixed(2)) * 100),
      // merId: getIds(order) || get('merchant.id')(order),
      orderDesc: title,
      orderId: order.id,
      txnTime: moment(order.createdAt).format('YYYYMMDDhhmmss'),
    }
    const result = await javaPart.pay(params)
    resp.success(result)
  },


  cancel: async (req, resp, next) => {
    const orderId = req.params.id;
    db.Order.findById(orderId).then(order => {
      if (order.user != req.session.user.id) {
        return throwFailedMessage('没有权限！');
      }
      if (order.closedAt) {
        return throwFailedMessage('该单已被关闭!');
      }
      order.closedAt = new Date();
      order.status = CLOSED;
      return order.save();
    }).then(async (order) => {
      // 这里可能对接微信支付宝的取消订单接口
      if (order.payment === 'alipay') {
        const alipaySdk = getAlipaySdk();
        const commonParams = getCommonParams({
          method: 'alipay.trade.close',
        })
        const bizContent = {
          outTradeNo: req.params.id,
        }
        const resultParams = set('bizContent', bizContent)(commonParams);
        alipaySdk.exec('alipay.trade.close', resultParams, {
          validateSign: true
        })
      } else if (order.payment === 'tenpay') {
        const tenpaySdk = getTenpaySdk()
        let result = await tenpaySdk.closeOrder({
          out_trade_no: req.params.id,
        });
      }
      resp.success('已取消订单！');
    }).catch(next);
  },

  payAliApp: async (req, resp, next) => {
    const grandOrder = await db.PurchaseOrder.findOne({ _id: Types.ObjectId(req.params.orderId) }).populate('merchant orders');
    const normalOrder = await db.Order.findById(req.params.orderId).populate('merchant');
    const order = grandOrder || normalOrder;
    const aliUrl = getAlipayUrl(order, `http://${getHost(req)}/order/pay/receiveNotify`);
      resp.success(aliUrl);
    },

  // 这次废弃
  payAliWeb(req, resp, next) {
    const alipaySdk = getAlipaySdk()
    const commonParams = getCommonParams({
      notifyUrl: `http://${getHost(req)}/order/pay/receiveNotify`,
      returnUrl: `http://localhost:8080/#/BuyGoods${req.params.orderId}`,
    });
    const getSynopsis = compose(join('\n'), compact, map('productId.synopsis'))
    db.Order.findOne({ _id: Types.ObjectId(req.params.orderId) }).populate('orderDetail.productId').then(order => {
      if (!order) {
        return throwFailedMessage('没找到该订单！');
      } else {
        const originalSubject = `${get('orderDetail.0.productId.name')(order)}${order.orderDetail.length > 1 ? `等${order.orderDetail.length}个商品` : ''}`;
        if (order.allPrice < 0.01 || order.allPrice > 100000000 || getPointNumLen(order.allPrice) > 3) {
          return throwFailedMessage('金额过大或小数点位数t不对，请重新下单！');
        }
        const bizContent = {
          body: getSynopsis(order.orderDetail),
          subject: originalSubject.slice(0, 256),
          outTradeNo: req.params.orderId,
          totalAmount: order.allPrice,
          productCode: 'QUICK_WAP_WAY',
        }
        const resultParams = set('bizContent', bizContent)(commonParams);
        const formData = new AlipayFormData();
        // 调用 setMethod 并传入 get，会返回可以跳转到支付页面的 url
        formData.setMethod('get');
        for (let k in resultParams) {
          formData.addField(k, resultParams[k]);
        }
        return alipaySdk.exec('alipay.trade.wap.pay', {}, {
          validateSign: true,
          formData: formData,
        });
      }
    }).then(result => {
      resp.success(result);
    }).catch(err => {
      next(err)
    })
  },

  // 添加交易记录
  receiveNotify: async (req, resp, next) => {
    const alipaySdk = getAlipaySdk();
    const body = req.body;
    if (alipaySdk.checkNotifySign(body)) {
      const orderId = body.out_trade_no;
      const totalAmount = body.total_amount;
      const sellerEmail = body.seller_email;
      const appId = body.app_id;
      const grandOrder = await db.PurchaseOrder.findById(orderId).populate('user orders');
      const normalOrder = await db.Order.findById(orderId).populate('user');
      const getOrderProp = (field) => (get(field)(grandOrder) || get(field)(normalOrder));
      if (totalAmount == getOrderProp('allPrice')) {
        await saveAll(getPayTransactionObjs(getOrderProp('payment'), getOrderProp('user'), grandOrder || normalOrder))
        const orders = grandOrder ? grandOrder.orders : [normalOrder];
        await getOrdersPaid(orders);
        resp.send('success');
      }
    }
  },

  tenpayReceiveNotify: async (req, resp, next) => {
    const body = req.weixin;
    const orderId = body.out_trade_no;
    const grandOrder = await db.PurchaseOrder.findById(orderId).populate('orders user');
    const normalOrder = await db.Order.findById(orderId).populate('user');
    const order = grandOrder || normalOrder;
    let msg;
    if ((order.allPrice) != body.total_fee) {
      msg = '金额不正确'
    }
    await saveAll(getPayTransactionObjs(get('payment')(order), get('user')(order), order))
    await getOrdersPaid(order.orders || [order]);
    res.reply(msg || '');
  },

  unionpayReceiveNotify: async (req, resp, next) => {
    const body = req.body;
    // const transaction = await db.Transaction.findById(body.orderId).populate('user');
    // const totalAmount = body.txnAmt;
    // if (totalAmount != transaction.amount) {
    //   msg = '金额不相等！';
    // }
    // transaction.type === 'rechargeIn' && await getRechargeTransactionObjs(transaction);
    // resp.success('success' || msg);
  },

  apply4Refund(req, resp, next) {
    db.Order.findById(req.params.orderId).then(order => {
      const findOrderDetailByProductId = (id) => find(['productId', Types.ObjectId(id)])(order.orderDetail);
      const cnyEdou = get('config.ticker.cny_edou')(global)
      const getBonusCny = order.payment === 'bonus' ? (price) => ((cnyEdou && (price / cnyEdou)) || price) : identity;
      let tx;
      if (!order) {
        return throwFailedMessage('没找到该订单！');
      } else if (order.supportBonus) {
        return throwFailedMessage('积分商城不支持退款！');
      } else if (order.user != get('session.user._id')(req)) {
        return throwFailedMessage('订单不属于当前用户！');
      } 
      // 因为允许多次退款了，所以可以不用管在申请中了
     // else if (order.status === REFUNDING) {
      //   return throwFailedMessage('当前订单已经在申请中!');
      // } 
      else if (order.status === COMPLETED || order.status === REJECTREFUND || order.status === REFUNDED || order.status === REFUNDING) {
        const params = pick(['reason', 'refundWay', 'description', 'imageUrls', 'account', 'channel', 'orderDetail'])(req.body);
        if (params.imageUrls) {
          params.imageUrls = getCommaSplited(params.imageUrls);
        }
        if (params.orderDetail) {
          const givenOrderDetail = JSON.parse(params.orderDetail);
          const num = get('num')(givenOrderDetail);
          const orderDetail = findOrderDetailByProductId(get('productId')(givenOrderDetail));
          const amount = getBonusCny(num * get('price')(givenOrderDetail) * order.actualPrice / order.noDiscountPrice).toFixed(2);
          tx = new db.Transaction({
            ...pick(['payment', 'user'])(order),
            // 计算实收总价与账面总价占比
            amount: toNumber(amount),
            type: 'refund',
            operator: order.user,
            orderDetail: new model('OrderDetail')(givenOrderDetail),
            order: order._id,
          })
          order.refundTxs.push(tx._id);
          // 新申请退款+已申请退款+已退款不能超过总数
          if (num + orderDetail.refundingNum + orderDetail.refundedNum > get('num')(orderDetail)) {
            return throwFailedMessage('订单退货数超过已购数');
          }
          orderDetail.refundingNum += num;
          delete params.orderDetail; 
        }
        order.status = REFUNDING
        Object.assign(order, params);
        return saveAll([order, tx]);
      } else {
        return throwFailedMessage('当前状态不能申请退款！');
      }
    }).then(([order, tx]) => {
      resp.success('申请退款成功！');
    }).catch(next);
  },

  /**
   * USDT产品，通过审核
   */
  acceptOrder: async (req, resp, next) => {
    const order = await db.Order.findById(req.params.orderId).populate('relatedTx user')
    if (!order) {
      throw '没找到该订单！'
    } else if (order.status != PAID) {
      throw '该订单未支付'
    } else if (order.payment !== 'usdtAmount') {
      throw '不是USDT产品订单'
    } else if (!order.user) {
      throw '该购买用户已不存在'
    } else {
      order.status = 'accepted';
      order.completedAt = new Date();
      // feature cyt usdt产品，发放过渡积分
      const user = order.user;
      const bonus = order.earnBonus
      if (order.payment != 'bonus') {
        if (!order.earnBonus) {
          order.earnBonus = bonus;
        }
        user.bonus += bonus;
      }
      const userId = req.session.user._id
      const relatedTx = order.relatedTx
      const sideEffectPayment = goodsBonusMapping[get('relatedTx.payment')(order)];
      let sideEffectTx = createCompleteTx({ payment: sideEffectPayment, type: `goodsBonus`, user: get('_id')(user), amount: bonus, relatedTx: get('_id')(order.relatedTx), operator: userId }, db);
      relatedTx.operator = userId
      await saveAll([order, sideEffectTx, user, relatedTx]);
      resp.success('已通过审核')
    }
  },

  /**
   * USDT产品，拒绝审核
   */
  rejectOrder: async (req, resp, next) => {
    const order = await db.Order.findById(req.params.orderId).populate('user relatedTx')
    if (!order) {
      throw '没找到该订单！'
    } else if (order.status != PAID) {
      throw '该订单未支付'
    } else if (order.payment !== 'usdtAmount') {
      throw '不是USDT产品订单'
    } else if (!order.user) {
      throw '该购买用户已不存在'
    } else {
      const userId = req.session.user._id
      const relatedTx = order.relatedTx
      const tx = createCompleteTx({ ...pick(['payment', 'amount', 'relatedTx'])(order), type: 'buyGoodsRevert', user: get('_id')(order.user), operator: userId }, db);
      const user = order.user;
      relatedTx.operator = userId
      user[order.payment] += order.amount;
      order.status = REJECTED;
      order.completedAt = new Date();
      await saveAll([tx, user, order, relatedTx]);
      resp.success('已拒绝审核')
    }
  },

  // 商户平台的admin/merchantAdmin/superAdmin
  rejectRefund: async (req, resp, next) => {
    const tx = await db.Transaction.findById(req.params.txId).populate('order');
    const order = get('order')(tx);
    const findOrderDetailByProductId = (id) => find(['productId', Types.ObjectId(id)])(order.orderDetail);
    if(!order) {
      throw '没找到该订单！';
    }else if(tx.type !== 'refund'){
      throw '非退款订单'
    }else if(tx.status !== 'applying') {
      throw '不在申请退款中'
    }else {
      order.status = REJECTREFUND;
      tx.status = 'reject';
      const orderDetail = findOrderDetailByProductId(get('orderDetail.productId')(tx));
      const num = get('orderDetail.num')(tx);
      orderDetail.refundingNum -= num;
      await saveAll([order, tx]);
      resp.success('成功拒绝退款申请')
    }
  },

  // 商户平台的admin/merchantAdmin/superAdmin
  // amount/eth/eos/btc退款实现
  refund: async (req, resp, next) => {
    const tx = await db.Transaction.findById(req.params.txId);
    let order = await db.Order.findById(get('order')(tx)).populate('merchant user');
    const url = `http://${getHost(req)}/wallet/refund/${order.payment}/receiveNotify`
    tx.operator = req.session.user._id;
    if (!order || tx.type !== 'refund') {
      throw ('没找到订单！');
    } else if (tx.status != 'applying') {
      throw ('该订单没有申请退款！');
    }
    // else if (order.payment === 'alipay' || order.payment === 'tenpay') {
    //   throw '支付宝或微信账单需要第三方手动转钱';
    // }
    // 腾讯退款
    else if (order.payment === 'tenpay') {
      const result = await refundTenpay(order, tx, {
        notify_url: url,
      });
      resp.success(result);
      // 支付宝退款（似乎是 同步）
    }else if(order.payment === 'alipay') {
      const result = await refundAlipay(order, tx);
      [newTransaction, order] = await saveAll(getRefundTransactionObjs({ payment: order.payment, user: order.user, order, tx }));
      resp.success(result);
    }else {
      [newTransaction, order] = await saveAll(getRefundTransactionObjs({ payment: order.payment, user: order.user, order, tx }));
      resp.success(order)
    }
  },


  // 查到order，查到tx
  // 分别改各自状态
  // 同时修改商户和用户余额(对应各自方式)
  refundTenpayReceiveNotify: async (req, resp, next) => {
    const info = req.weixin;
    const orderId = info.out_trade_no;
    const txId = info.out_refund_no;
    const totalFee = toString(info.total_fee);
    const refundFee = toString(info.refund_fee);
    let msg = '';
    const [order, tx] = await Promise.all([db.Order.findById(orderId).populate('merchant user'),
    db.Transaction.findById(txId).populate('user')]);
    if(!order || !tx) {
      msg = '没找到记录'
    }else if(totalFee == order.allPrice && refundFee == tx.amount) {
      msg = '退款额不正确';
    }else {
      [newTransaction, order] = await saveAll(getRefundTransactionObjs({ payment: order.payment, user: order.user.toHexString ? tx.user: order.user, order, tx }));
    }
    res.reply(msg);
  },

  // TODO 退款unionpay回调

  statistics(req, resp, next) {
    const getSeries = map('amount');
    const getXData = map('_id');
    db.Order.aggregate().match({
      paidAt: { $gte: new Date(req.query.startTime), $lt: getLastTime(req.query.endTime) }
    }).project({
      paidAt: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
      amount: 1
    }).group({
      _id: '$paidAt',
      amount: { $sum: "$amount" }
    }).exec().then(orders => {
      orders = sortBy(s => new Date(s._id))(orders);
      resp.success({
        chartData: {
          series: getSeries(orders),
          xData: getXData(orders),
          legend: orders.length ? ['订单销售额'] : [],
        }
      });
    }).catch(err => {
      next(err);
    })
  },

  destroy: async (req, resp, next) => {
    const orderId = req.params.id;
    const order = await db.Order.findById(orderId);
    if (order.user != req.session.user.id) {
      throw '删除的不是当前用户订单!';
    } else if (order.status !== COMPLETED && order.status !== REFUNDED && order.status !== CLOSED) {
      throw '当前订单状态不是已完成/已退款/已取消';
    } else {
      await order.remove()
      resp.success(SUCCESS_DELETE);
    }
  },

  rateComment: async (req, resp, next) => {
    const body = req.body;
    const orderDetail = JSON.parse(body.orderDetail);
    const order = await db.Order.findById(req.params.orderId);
    if (order.status !== COMPLETED) {
      throw '订单不是已完成的状态';
    }
    const product = await db.Product.findById(get('productId')(orderDetail)).select('+comments');
    if (!product) {
      throw '未找到商品';
    }
    const comment = new model('Comment')({
      user: req.session.user._id,
      stars: body.stars,
      content: body.content,
      imageUrls: getCommaSplited(body.imageUrls),
      order: get('_id')(order),
      saleSpecication: get('saleSpecifaction')(orderDetail),
      orderDetail,
    })
    product.comments.push(comment);
    order.comments.push(comment);
    await saveAll([product, order])
    resp.success('评价成功');
  },

  selectById: async (req, resp, next) => {
    const order = await db.Order.findById(req.params.orderId).populate('orderDetail.productId merchant');
    resp.success(order);
  }

};

module.exports = orderController;
