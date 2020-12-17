const db = require('../models');
const { saveAll } = require('../utils/promiseHelper');
const { updateModelVipLevel, getNodeById, getYesterdayRange, getWeekRange, getObjectIds, getDailyMinerBenefits, createCompleteTx } = require('../utils/common')
const { compose, map, get, flatten, compact, filter, memoize, sumBy, groupBy, isNumber, set, find, slice } = require('lodash/fp');
const { creatTreeModel } = require('../utils/treeHelper')
const { getDailyMinerPoolBenefits, getRealVipLevel, getVipBenefits } = require('../utils/userBenefits')
const moment = require('moment')

const getGroupedOrders = groupBy(order => order.user && order.user.toHexString())
const getValidMiners = compose(get('length'), filter(order => get('orderDetail.0.earnBonus')(order)))
const getParents = (user) => {
  const firstParent = global.root.first({ strategy: 'breadth' }, node => node.model.id == user.invitor);
  const parents = []
  let parent = firstParent;
  parent && parents.push(firstParent);
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
/**
 * @return { totalAmount, orders4Save, allOrders } totalAmount: 累计总额, orders4Save: 期间改变的矿机订单对象, allOrders: 变更后的所有矿机订单
 * @param {*} orders 订单
 * @param {*} uccFreeze 用户可供用于扣减的总额
 * @param {*} totalBenfits 计算矿池、矿场等要用，为总的可供分发的量。如果指定的话，会沿按时间由旧到新的顺序依次扣减，直到扣减完
 */
const getOrderAmountObjs = (orders, uccFreeze, totalBenfits) => {
  let totalAmount = 0;
  let limitTotalAmount = uccFreeze;
  let limitTotalBenefits = totalBenfits === undefined ? 0 : totalBenfits
  const allOrders = []
  const filterUndefined = filter(num => typeof num !== 'undefined')
  const getOrderMinerBonus = compose(compact, map(order => {
    // 剩余的发放量
    const minerOrder = get('orderDetail.0')(order);
    const num = get('num')(minerOrder);
    const amount = Math.min.apply(null, filterUndefined([get('earnBonus')(minerOrder), isNumber(limitTotalBenefits) ? limitTotalBenefits: getDailyMinerBenefits(num), limitTotalAmount]))
    if (amount > 0 && minerOrder) {
      minerOrder.earnBonus -= amount
      limitTotalAmount -= amount
      totalAmount += amount
      //
      if(limitTotalBenefits > 0) {
        limitTotalBenefits  -=  amount
      }
      allOrders.push(order)
      return order;
    } else {
      allOrders.push(order)
      return null
    }
  }))
  const orders4Save = getOrderMinerBonus(orders);
  return { totalAmount, orders4Save, allOrders }
}

// 发放锁仓奖励，包括自己和上两级的
const deliveryFreezeBenefits = (releaseEndTxs, allUsers, db) => {
  const findUserById = memoize((id) => find(['id', id])(allUsers));
  let users4Save = [];
  const getBenefitsObjs4Save = compose(compact, flatten, map(tx => {
    let user = find(['id', tx.user.id])(users4Save)
    let paybackTx;
    const isNew = !user;
    user = user || tx.user;
    const selfAmount = get('freeze.limit')(tx) + tx.currentBenefits
    // 本体部分的发放
    if(user.bonusFreeze - selfAmount >= 0) {
      user.bonus += selfAmount;
      user.bonusFreeze -= selfAmount;
      paybackTx = createCompleteTx({
        payment: 'bonus',
        type: `freezePayback`,
        user: user._id,
        amount: selfAmount,
        operator: user._id,
        relatedTx: tx._id,
        afterAmount: user.bonus,
      }, db)
      isNew && users4Save.push(user);
    }
    const parentsIds = compose(map('model.id'), slice(0, 2))(getParents(user));
    // 上级的发放
    const getBenefitsTxs = (parentsIds) => {
      return parentsIds && compact(parentsIds.map((parentId, index) => {
        let parentUser = find(['id', parentId])(users4Save)
        const isParentNew = !parentUser
        parentUser = parentUser || findUserById(parentId);
        const amount = tx.currentBenefits * get(`freeze.dividend.${index}`)(tx) / 100;
        if (amount && parentUser) {
          parentUser.bonus += amount;
          const benefitsTx = createCompleteTx({
            payment: 'bonus',
            type: `freezeBenefits`,
            user: parentUser._id,
            amount,
            operator: parentUser._id,
            relatedTx: tx._id,
            afterAmount: parentUser.bonus,
            freezeDividendIndex: index,
          }, db)
          isParentNew && users4Save.push(parentUser)
          return benefitsTx;
        }
      }))
    }
    return [...users4Save, paybackTx, ...getBenefitsTxs(parentsIds)];
  }))
  return saveAll(getBenefitsObjs4Save(releaseEndTxs));
}

const deliveryTask = {
  deliveryDailyMiner: async (db) => {
    if (get('config.isBenefitsDelivery')(global) && !moment().isBetween(get('config.deliveryStartDate')(global), get('config.deliveryEndDate')(global))) {
      const minerUsers = await db.User.find({ uccFreeze: { $gt: 0 }, miners: { $gt: 0 } })
      const orders = await db.Order.find({ user: { $in: map('_id')(minerUsers) }, payment: 'bonus', paidAt: { $exists: true } }, 'paidAt user payment type status orderDetail')
      const groupedOrders = getGroupedOrders(orders)
      console.log('本次要发放矿机收益有', map('id')(minerUsers))
      const getObjs4Save = compose(flatten, compact, map(user => {
        const { totalAmount, orders4Save, allOrders } = getOrderAmountObjs(groupedOrders[user.id], user.uccFreeze);
        const amount = totalAmount
        if (amount) {
          user.uccFreeze -= amount;
          user.uccAvailable += amount;
          user.minerBenefits += amount;
          // 更新一下各用户miners的值
          user.miners = getValidMiners(allOrders);
          const tx = new db.Transaction({
            unit: 'token',
            status: 'accept',
            payment: 'uccAvailable',
            amount,
            user: get('_id')(user),
            completedAt: new Date(),
            type: 'dailyMiner'
          })
          const sideEffectTx = createCompleteTx({ payment: 'uccFreeze', type: tx.type, user: get('_id')(user), amount, relatedTx: get('_id')(tx) }, db);
          return [user, tx, sideEffectTx, ...orders4Save]
        }
      }))
      const results = await saveAll(getObjs4Save(minerUsers))
      const users = await db.User.find({}, 'id childUsers invitor miners nickname mobile vipLevel').populate('invitor childUsers')
      global.root = (creatTreeModel(users));
      return results
    }
  },
  deliveryDynamicBenefits: async (db) => {
    const users = await db.User.find({}, 'id childUsers invitor miners nickname mobile vipLevel').populate('invitor childUsers')
    global.root = (creatTreeModel(users));
    // const orders = await db.Order.find({ createdAt: getYesterdayRange(), status: 'paid', 'orderDetail.productId': db.minerProductId })
    // const getLastDayMiners = compose(sumBy('num'), flatten, map('orderDetail'))
    // global.lastDayMiners = getLastDayMiners(orders)
    await saveAll(users.map(user => {
      const node = getNodeById(user.id)
      user.dailyMinerPoolBenefits = getDailyMinerPoolBenefits.call(user, node)
      return user
    }))
    if (get('config.isBenefitsDelivery')(global) && !moment().isBetween(get('config.deliveryStartDate')(global), get('config.deliveryEndDate')(global))) {
      await deliveryTask.deliveryDailyMinerPool(db)
      const newestUsers = await db.User.find({}, 'id childUsers invitor miners nickname mobile vipLevel').populate('invitor childUsers')
      global.root = (creatTreeModel(newestUsers));
    }
  },
  deliveryDailyMinerPool: async (db) => {
    // const minerUsers = await db.User.find({ "childUsers.0": { "$exists": true } })
    const minerUsers = await db.User.find({}, 'id childUsers equityBenefits dailyMinerPoolBenefits uccFreeze uccAvailable minerPoolBenefits invitor miners nickname mobile vipLevel')
    const orders = await db.Order.find({ user: { $in: map('_id')(minerUsers) }, payment: 'bonus', paidAt: { $exists: true } }, 'user payment type status orderDetail paidAt')
    const groupedOrders = getGroupedOrders(orders)
    console.log('本次要发放矿池收益有', compose(map('id'), filter('dailyMinerPoolBenefits'))(minerUsers))
    const getObjs4Save = compose(flatten, compact, map(user => {
      // 矿机订单发放对应值
      const { totalAmount, orders4Save, allOrders } = getOrderAmountObjs(groupedOrders[user.id], user.uccFreeze, user.dailyMinerPoolBenefits);
      const amount = totalAmount
      if (amount) {
        const equityBenefitsAmount = amount * get('config.wallet.equityBenefits.dailyMinerPool')(global) / 100
        const deliveryAmount = amount - equityBenefitsAmount
        user.uccFreeze -= amount
        user.uccAvailable += deliveryAmount
        user.minerPoolBenefits += deliveryAmount
        user.equityBenefits += equityBenefitsAmount
        user.miners = getValidMiners(allOrders);
        const tx = new db.Transaction({
          unit: 'token',
          status: 'accept',
          payment: 'uccAvailable',
          amount: deliveryAmount,
          user: get('_id')(user),
          completedAt: new Date(),
          type: 'dailyMinerPool'
        })
        const sideEffectTx = createCompleteTx({ payment: 'uccFreeze', type: tx.type, user: get('_id')(user), amount, relatedTx: get('_id')(tx), afterAmount: user.uccFreeze }, db);
        const equityBenefitsTx = createCompleteTx({ payment: 'equityBenefits', type: tx.type, user: get('_id')(user), amount: equityBenefitsAmount, relatedTx: get('_id')(tx), afterAmount: user.equityBenefits }, db);
        return [user, tx, sideEffectTx, equityBenefitsTx, ...orders4Save]
      }
    }))
    return saveAll(getObjs4Save(minerUsers))
  },
  deliveryDailyMine: async (db) => {
    let [users, minerUsers] = await Promise.all([db.User.find({}, 'id equityBenefits childUsers invitor miners nickname mobile vipLevel realVipLevel dailyMineBenefits mineBenefits uccFreeze uccAvailable').populate('invitor childUsers'),
    db.User.find({ "childUsers.0": { "$exists": true } })])
    const orders = await db.Order.find({ user: { $in: map('_id')(minerUsers) }, payment: 'bonus', paidAt: { $exists: true } }, 'paidAt user payment type status orderDetail')
    const groupedOrders = getGroupedOrders(orders)
    global.root = (creatTreeModel(users));
    console.log('本次要发放矿场收益有', compose(map('id'), filter('dailyMineBenefits'))(minerUsers))
    // 更新一下树中的vip等级
    const memoizeGetNodeById = memoize(getNodeById)
    const memoizeGetVipLevel = memoize(getRealVipLevel)
    users = await saveAll(users.map(user => {
      const node = memoizeGetNodeById(user.id)
      user.realVipLevel = memoizeGetVipLevel.call(user, node)
      updateModelVipLevel(node, user.realVipLevel)
      return user
    }))
    minerUsers = await saveAll(minerUsers.map(user => {
      const node = memoizeGetNodeById(user.id)
      user.dailyMineBenefits = getVipBenefits.call(user, node)
      return user
    }))
    if (get('config.isBenefitsDelivery')(global) && !moment().isBetween(get('config.deliveryStartDate')(global), get('config.deliveryEndDate')(global))) {
      const getObjs4Save = compose(flatten, compact, map(user => {
        // const amount = Math.min(user.dailyMineBenefits, user.uccFreeze)
        // 矿机订单发放对应值
        const { totalAmount, orders4Save, allOrders } = getOrderAmountObjs(groupedOrders[user.id], user.uccFreeze, user.dailyMineBenefits);
        const amount = totalAmount
        if (amount) {
          const equityBenefitsAmount = amount * get('config.wallet.equityBenefits.dailyMine')(global) / 100
          const deliveryAmount = amount - equityBenefitsAmount
          user.uccFreeze -= amount
          user.uccAvailable += deliveryAmount
          user.mineBenefits += deliveryAmount
          user.equityBenefits += equityBenefitsAmount
          user.miners = getValidMiners(allOrders);
          const tx = new db.Transaction({
            unit: 'token',
            status: 'accept',
            payment: 'uccAvailable',
            amount: deliveryAmount,
            user: get('_id')(user),
            completedAt: new Date(),
            type: 'dailyMine'
          })
          const sideEffectTx = createCompleteTx({ payment: 'uccFreeze', type: tx.type, user: get('_id')(user), amount, relatedTx: get('_id')(tx) }, db);
          const equityBenefitsTx = createCompleteTx({ payment: 'equityBenefits', type: tx.type, user: get('_id')(user), amount: equityBenefitsAmount, relatedTx: get('_id')(tx), afterAmount: user.equityBenefits }, db);
          return [user, tx, sideEffectTx, equityBenefitsTx, ...orders4Save]
        }
      }))
      const results = await saveAll(getObjs4Save(minerUsers))
      const newestUsers = await db.User.find({}, 'id childUsers invitor miners nickname mobile vipLevel').populate('invitor childUsers')
      global.root = (creatTreeModel(newestUsers));
      return results
    }
  },
  /**
   * 获取到周内新增矿机数
   * 矿机数 * 每台收益 * 1% 作为分红总额
   * 确定所有符合条件（直推中有v6）的v6用户
   * 把收益平均分给每个人
   * user的mineBenefits和uccAvailable增加
   * 每周一晚0点发放分红
   */
  deliveryV6DividendWeekly: async (db) => {
    const getLastWeekMiners = compose(sumBy('num'), flatten, map('orderDetail'))
    const memoizeGetVipLevel = memoize(getRealVipLevel)
    let [lastWeekOrder, users, minerUsers] = await Promise.all([db.Order.find({ createdAt: getWeekRange(), paidAt: { $exists: true }, 'orderDetail.productId': db.minerProductId }),
    db.User.find({}, 'id childUsers invitor miners nickname mobile uccAvailable mineBenefits vipLevel uccFreeze equityBenefits').populate('childUsers'),
    db.User.find({ "childUsers.0": { "$exists": true } })])
    const orders = await db.Order.find({ user: { $in: map('_id')(minerUsers) }, payment: 'bonus', paidAt: { $exists: true } }, 'paidAt user payment type status orderDetail')
    const groupedOrders = getGroupedOrders(orders)
    global.root = (creatTreeModel(users));
    await saveAll(users.map(user => {
      const node = getNodeById(user.id)
      user.realVipLevel = memoizeGetVipLevel.call(user, node)
      updateModelVipLevel(node, user.realVipLevel)
      return user
    }))
    if (get('config.isBenefitsDelivery')(global) && !moment().isBetween(get('config.deliveryStartDate')(global), get('config.deliveryEndDate')(global))) {
      const getV6Length = compose(get('length'), filter(n => (n.model.vipLevel >= 6 || n.model.realVipLevel >= 6)), get('children'))
      const v6Nodes = global.root.all(node => (node.model.vipLevel >= 6 || node.model.realVipLevel >= 6) && getV6Length(node))
      const v6Ids = map('model.id')(v6Nodes)
      console.log('本次要发放v6分红有', v6Ids)
      const validV6Users = users.filter(u => v6Ids.indexOf(u.id) >= 0)
      const validV6Length = validV6Users.length
      const totalV6Benefits = getDailyMinerBenefits(getLastWeekMiners(lastWeekOrder), false) * 1 / 100
      if (validV6Length && totalV6Benefits) {
        const dividendUcc = totalV6Benefits / validV6Length
        const getObjs4Save = compose(flatten, compact, map(user => {
          // 矿机订单发放对应值
          const { totalAmount, orders4Save, allOrders } = getOrderAmountObjs(groupedOrders[user.id], user.uccFreeze, dividendUcc);
          const amount = totalAmount
          if (amount) {
            const equityBenefitsAmount = amount * get('config.wallet.equityBenefits.weeklyV6Dividend')(global) / 100
            const deliveryAmount = amount - equityBenefitsAmount
            user.uccFreeze -= amount
            user.uccAvailable += deliveryAmount
            user.mineBenefits += deliveryAmount
            user.equityBenefits += equityBenefitsAmount
            user.miners = getValidMiners(allOrders);
            const tx = new db.Transaction({
              unit: 'token',
              status: 'accept',
              payment: 'uccAvailable',
              amount: deliveryAmount,
              user: get('_id')(user),
              completedAt: new Date(),
              type: 'weeklyV6Dividend'
            })
            const sideEffectTx = createCompleteTx({ payment: 'uccFreeze', type: tx.type, user: get('_id')(user), amount, relatedTx: get('_id')(tx) }, db);
            const equityBenefitsTx = createCompleteTx({ payment: 'equityBenefits', type: tx.type, user: get('_id')(user), amount: equityBenefitsAmount, relatedTx: get('_id')(tx), afterAmount: user.equityBenefits }, db);
            return [user, tx, sideEffectTx, equityBenefitsTx, ...orders4Save]
          }
        }))
        const results = await saveAll(getObjs4Save(validV6Users))
        const newestUsers = await db.User.find({}, 'id childUsers invitor miners nickname mobile vipLevel').populate('invitor childUsers')
        global.root = (creatTreeModel(newestUsers));
        return results
      }
    }
  },
  /**
   * v2 => v3 order的结构性改造
   */
  refactOrder: async (db) => {
    const users = await db.User.find({ uccFreeze: { $gt: 0 } }, '_id uccFreeze mobile');
    if (users.length) {
      const allOrders = await db.Order.find({ user: { $in: map('_id')(users) }, 'orderDetail.productId': db.minerProductId, paidAt: { $exists: true } }, 'paidAt orderDetail user paidAt');
      const groupedOrders = groupBy('user')(allOrders)
      const getObjs4Save = compose(compact, flatten, map(user => {
        let freezeAmount = user.uccFreeze
        if (user.uccFreeze < 0) {
          debugger
        }
        const orders = groupedOrders[user._id]
        const setEarnBonus = map(o => {
          if (user.uccFreeze > 0 && typeof get('orderDetail.0.earnBonus')(o) === 'undefined') {
            const amount = Math.min(user.uccFreeze, 10500);
            user.uccFreeze -= amount
            const setEarnBonus = set('orderDetail.0.earnBonus', amount)
            o = setEarnBonus(o)
            return o
          }
        })
        return [...setEarnBonus(orders), user]
      }));
      const results = await saveAll(getObjs4Save(users));
      return results
    }
  },

  /**
   * 发放冻结部分E豆，锁仓奖励
   * 每日筛选有leftAmount,进行发放 bonusFreeze，若bonusFreeze结果为0时，转移本金和收益到bonus上。
   */
  freezeBonus: async (db) => {
    const users = await db.User.find({}, '_id bonusFreeze bonus mobile');
    if (users.length) {
      const txs = await db.Transaction.findFreezeTxs(map('_id')(users));
      const groupedTxs = groupBy(tx => tx.user.id)(txs);
      const getObjs4Save = compose(compact, flatten, map(user => {
        const userTxs = groupedTxs[user.id];
        if (userTxs) {
          const setReleaseBonus = map(tx => {
            const amount = Math.min(get('freeze.limit')(tx) * get('freeze.rate')(tx) / 100, tx.leftAmount);
            user.bonusFreeze += amount;
            tx.leftAmount -= amount;
            tx.currentBenefits += amount;
            if (tx.leftAmount === 0) {
              tx.releasedAt = new Date();
            }
            return tx
          })
          return [...setReleaseBonus(userTxs), user];
        } else {
          return []
        }
      }));
      const results = getObjs4Save(users);
      const releaseEndTxs = filter(tx => tx.leftAmount === 0)(results);
      const result = await Promise.all([deliveryFreezeBenefits(releaseEndTxs, users, db), saveAll(results)]);
      console.log('发放下本体和上级奖励', JSON.stringify(result))
      return results;
    }
  },


}

module.exports = deliveryTask

