const db = require('../models');
const { Types } = require('mongoose')
const { notSuperAdmin } = require('../utils/accessAuth')
const { pickByAttrs } = require('../utils/common')
const { compose, set, get, pick } = require('lodash/fp')
const { supportTokens } = require('../config')
const LOEXHelper = require('../utils/loexHelper')
const MailHelper = require('../utils/mail')
const Ebrgo = require('../utils/ebrgo')
const VideoPart = require('../utils/videoPart')

const getMarketByPair = async () => {
  try {
    const loexHelper = new LOEXHelper()
    const ucusdt = await loexHelper.getMarketByPair()
    return ucusdt
  } catch (err) {
    return null
  }
}
const configController = {

  updateConfig: async (req, resp, next) => {
    const body = req.body;
    if (notSuperAdmin(req.session.user, 'platform')) {
      resp.failed('权限不足！');
    } else {
      const config = await db.Config.findOne({ identity: 'bellchet58' });
      const tokenAddresses = supportTokens ? supportTokens.map(token => (`${token}Address`)) : ['btcAddress', 'eosAddress', 'ethAddress'];
      const params = pickByAttrs(body, [...tokenAddresses, 'ethAddress', 'serviceCharge', 'ticker',
        'invitorBonus', 'banner', 'shopping', 'signInLimit', 'signInBonus', 'version', 'updateContent', 'customerServiceQQ', 'customerServiceMobile',
        'isVideoAudit', 'isBonusExtractOutAudit', 'isLegalExtractOutAudit', 'isEdouExtractOutAudit', 'isKycAudit', 'donate', 'upRules', 'downRules',
        'lottery', 'freeze', 'thumbup', 'comment', 'watchVideo', 'vips', 'masterPk', 'protocolContent', 'newerEdouAvailableAmount', 'extractOutDownPercent', 
      'alipayQrCode', 'tenpayQrCode', 'downloadQrCode', 'bonusReleaseThreshold']);
      // 获取到解析后的对象
      ['serviceCharge', 'ticker', 'banner', 'shopping', 'minerBenefits', 'minerPoolBenefits', 'mineBenefits', 'wallet', 'exchange',
        'donate', 'lottery', 'freeze', 'thumbup', 'comment', 'watchVideo', 'vips', 'protocolContent'].map(key => {
          if (params[key]) {
            params[key] = JSON.parse(params[key]);
          }
          if (key === 'banner' && params[key]) {
            params[key].categoryBar = params[key].categoryBar.map(c => {
              c.category = Types.ObjectId(c.category);
              return c;
            })
          }
        })
      if (params.masterPk) {
        // const ebrgo = new Ebrgo();
        global.masterPk = params.masterPk
        // try {
        //   const result = await ebrgo.setMasterPk(params.masterPk);
        // }catch(err) {
        //   console.log(`同步pk: ${err}`)
        // }
      }
      const params4Video = pickByAttrs(params, ['isVideoAudit', 'donate', 'upRules', 'thumbup', 'comment', 'watchVideo']);
      if(Object.keys(params4Video).length) {
        const video = new VideoPart()
        try {
          const result = await video.configSync(params4Video);
        }catch(err) {
          console.log(`同步video设置: ${err}`)
        }
      }
      Object.assign(config, params);
      await config.save();
      global.config = config;
      resp.success(config);
    }
  },

  getGeneralConfig: async (req, resp, next) => {
    const config = await db.Config.findOne({
      identity: 'bellchet58',
    }, { protocolContent: 0 }).populate('banner.categoryBar.category banner.bannerId')
    const setBannerName = set('banner.bannerName', (get('banner.bannerId.name')(config)));
    const setBannerId = set('banner.bannerId', get('banner.bannerId._id')(config));
    const loexHelper = new LOEXHelper()
    let ucusdt
    try {
      ucusdt = await loexHelper.getMarketByPair()
    } catch (err) {
      console.error(err.message)
    }
    const setAutoExchangeRate = set('exchange.autoExchangeRate', (get('config.dailyUcUSDT')(global) || ucusdt) * 7)
    const getRespData = compose(setAutoExchangeRate, setBannerId, setBannerName)
    resp.success(getRespData(config.toJSON()));
  },

  async getProtocol(req, resp, next) {
    const config = await db.Config.findOne({ identity: 'bellchet58' }, { protocolContent: 1 });
    resp.success(get('protocolContent')(config))
  },

  async getVersion(req, resp, next) {
    const config = await db.Config.getGlobalConfig();
    resp.success(pick(['version', 'updateContent'])(config));
  },

  async getLevelPercent(req, resp, next) {
    const vipLevel = req.params.vipLevel;
    resp.success((get(`config.vips.vip${vipLevel}.percent`)(global) || get('config.donate.toUser')(global)));
  }

}

module.exports = configController;