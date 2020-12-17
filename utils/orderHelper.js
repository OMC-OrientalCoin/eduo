const db = require('../models');
const { getUnit, getUserPayField, createCompleteTx, getNodeById } = require('./common');
const { saveAll } = require('../utils/promiseHelper')
const { COMPLETED, CLOSED } = require('../commons/orderStatus')
const { pick, get } = require('lodash/fp')
const moment = require('moment')

const getCompleteOrderTransactionObjs = (order, db) => {
  const payment = order.payment;
  const user = order.user;
  let merchantTx;
  const newTransaction = new db.Transaction({
    payment: payment,
    status: 'accept',
    amount: order.allPrice,
    user: user._id,
    completedAt: new Date(),
    type: 'buyGoods',
    unit: getUnit(payment),
    isMinus: true,
  })
  if (order.merchant) {
    order.merchant[getUserPayField(payment)] += order.allPrice;
    merchantTx = createCompleteTx({
      ...pick(['payment', 'status', 'amount', 'type', 'unit', 'completedAt'])(newTransaction),
      merchant: get('_id')(order.merchant),
    }, db)
  }
  return [order, order.merchant, newTransaction, merchantTx];
}

const autoCompleteDeliveryingOrder = (order, db) => {
  return () => {
    if (!order.completedAt) {
      order.completedAt = new Date();
      // 修改成完成状态
      order.status = COMPLETED;
      saveAll(getCompleteOrderTransactionObjs(order, db));
    }
  }
}

const cancelDeliveryOrder = async (order, db) => {
  order = await db.Order.findById(order._id)
  if (order && !order.paidAt) {
    order.closedAt = new Date();
    order.status = CLOSED;
    return order.save();
  }
}

const clearExpiredVip = async (user, db) => {
  user = await db.User.findById(user._id);
  if (moment().isAfter(user.vipExpireAt)) {
    user.vipLevel = 0;
    try {
      const currentNode = getNodeById(user.id)
      if (currentNode) {
        currentNode.model.vipLevel = user.vipLevel
      }
    } catch (err) {
      console.log(`改动态树等级可能有点问题${err}`)
    }
    return user.save();
  }
}

const orderHelper = {
  getCompleteOrderTransactionObjs,
  autoCompleteDeliveryingOrder,
  cancelDeliveryOrder,
  clearExpiredVip,
}

module.exports = orderHelper