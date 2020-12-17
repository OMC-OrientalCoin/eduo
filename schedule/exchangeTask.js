const db = require('../models')
const { saveAll } = require('../utils/promiseHelper');
const { getNodeById, getYesterdayRange, createCompleteTx } = require('../utils/common')
const { compose, map, get, flatten, compact, filter, memoize, sumBy, max, min,  } = require('lodash/fp');
const LOEXHelper = require('../utils/loexHelper')
const { creatTreeModel } = require('../utils/treeHelper')
const { getDailyMinerPoolBenefits, getRealVipLevel, getVipBenefits } = require('../utils/userBenefits')

const exchangeTask = {
  /**
   * 每天下午5点转化
   */
  exchangeUCCCoinFromAvailable: async (db) => {
    let ucusdt
    try {
      const loexHelper = new LOEXHelper()
      const uccusdt = await loexHelper.getMarketByPair()
      if (uccusdt) {
        global.ucusdt = uccusdt
        ucusdt = uccusdt
        const config = await db.Config.findOne({ identity: 'bellchet58' })
        config.dailyUcUSDT = uccusdt
        global.config.dailyUcUSDT = uccusdt
        await config.save()
      }
    }catch(err) {
      console.error(err)
    }
    const users = await db.User.find({ uccAvailable: { $gt: 0 } }, 'id uccAvailable uccCoinAvailable')
    console.log('本次要兑换UCC的用户有', compose(map('id'))(users))
    const getObjs4Save = compose(flatten, compact, map(user => {
      const amount = user.uccAvailable
      const rate = (get('config.exchange.manualExchangeRate')(global) || (7 * ucusdt))
      const uccCoinAmount = user.uccAvailable / rate
      if (amount) {
        user.uccAvailable -= amount
        user.uccCoinAvailable += uccCoinAmount
        const tx = new db.Transaction({
          unit: 'token',
          status: 'accept',
          payment: 'uccCoinAvailable',
          amount: uccCoinAmount,
          user: get('_id')(user),
          completedAt: new Date(),
          type: 'exchangeUCCCoin',
          totalAmount: amount,
          rate,
          afterAmount: user.uccCoinAvailable,
        })
        const sideEffectTxUcc = createCompleteTx({ payment: 'uccAvailable', type: tx.type, user: get('_id')(user), amount, relatedTx: get('_id')(tx) }, db);
        return [user, tx, sideEffectTxUcc]
      }
    }))
    return saveAll(getObjs4Save(users))
  },

  /**
   * 每日记录
   */
  edouPriceDailyRecord: async (db) => {
    const [lastPrice, records] = await Promise.all([db.Change.findLastPrice(), db.Change.findTodayRange()])
    const newRecord = new db.Change({
      type: 'daily',
      high: compose(max, map('close'))(records),
      low: compose(min, map('close'))(records),
      open: lastPrice,
      close: get('config.ticker.cny_edouCoin')(global) || 0,
    })
    return await newRecord.save()
  }
}

module.exports = exchangeTask