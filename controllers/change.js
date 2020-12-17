
const db = require('../models');
const { SUCCESS_CREATE, SUCCESS_UPDATE } = require('../commons/respCommons');
const { pickByAttrs, getGridData, getCommaSplited, getLastTime } = require('../utils/common');
const { throwFailedMessage, saveAll } = require('../utils/promiseHelper');
const { toNumber, set, identity, compose, reverse, sortBy, get } = require('lodash/fp');
const { findAndCount } = require('../utils/queryHelper');
const { notSuperAdmin } = require('../utils/accessAuth')
const { Types } = require('mongoose')



const changeController = {

  /**
   * 后端打赏引起涨价的价格变动
   */
  edouPriceChange: async (req, resp, next) => {
    const body = req.body
    const amount = toNumber(body.amount) * get('ticker.cny_edou')(global.config)
    const originalPrice = get('ticker.cny_edouCoin')(global.config);
    const plusResult = originalPrice + amount;
    const newPrice = Math.max(plusResult, 0)
    if (amount <= 0) {
      throw '数值不正确'
    } else if (!plusResult) {
      throw '价格数值错误'
    } else {
      const config = await db.Config.getGlobalConfig();
      config.ticker.cny_edouCoin += amount;
      const change = new db.Change({
        amount,
        type: body.type,
        close: config.ticker.cny_edouCoin,
        ip: req.ip,
      })
      await saveAll([config, change])
      global.config.ticker.cny_edouCoin += amount;
      resp.success({ newPrice })
    }
  },

}

module.exports = changeController;