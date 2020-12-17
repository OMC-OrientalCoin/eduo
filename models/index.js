/*
 * index.js
 *
 * Distributed under terms of the MIT license.
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const findOrCreate = require('mongoose-findorcreate');
const bcrypt = require('bcryptjs');
const schedule = require('node-schedule');

const UserSchema = require('./user');
const { sumBy, compose, map, range, sortBy, get, assignIn, pick, flatten } = require('lodash/fp');
const ApplyBonusTicketSchema = require('./applyBonusTicket');
const BonusTicketSchema = require('./bonusTicket');
const CategorySchema = require('./category');
const ConfigSchema = require('./config');
const MainTypeSchema = require('./mainType');
const MerchantSchema = require('./merchant');
const PurchaseOrderSchema = require('./purchaseOrder');
const UserSignInSchema = require('./userSignIn');
const TransactionSchema = require('./transaction.js');
const CarouselSchema = require('./carousel');
const NewsSchema = require('./news');
const OrderSchema = require('./order');
const ProductSchema = require('./product');
const ReceivingAddressSchema = require('./receivingAddress');
const FeedbackSchema = require('./feedback');
const GridSchema = require('./grid')
const TemplateSchema = require('./template')
const ChangeSchema = require('./change')
const MerchantCategorySchema = require('./merchantCategory')
const ApplyMerchantSchema = require('./applyMerchant');
const { init, initCategories } = require('../utils/treeHelper');
const { merchant, system } = require('../config');
const { autoCompleteDeliveryingOrder, cancelDeliveryOrder, clearExpiredVip } = require('../utils/orderHelper')
const { saveAll } = require('../utils/promiseHelper')
const { freezeBonus, deliveryDailyMiner, deliveryDynamicBenefits, deliveryV6DividendWeekly, deliveryDailyMine, refactOrder } = require('../schedule/deliveryTask');
const { exchangeUCCCoinFromAvailable, edouPriceDailyRecord } = require('../schedule/exchangeTask')
const { getYesterdayRange, getPwd } = require('../utils/common')

const db = Object.create(null);

[TransactionSchema, UserSchema, CarouselSchema, NewsSchema, OrderSchema, ProductSchema, ReceivingAddressSchema,
  ApplyBonusTicketSchema, BonusTicketSchema, CategorySchema, ConfigSchema, MainTypeSchema, MerchantSchema, PurchaseOrderSchema, UserSignInSchema,
  FeedbackSchema, GridSchema, TemplateSchema, ChangeSchema, MerchantSchema, ApplyMerchantSchema].map(schema => {
    schema.virtual('id').get(function () {
      return this._id.toHexString();
    });
    schema.set('toObject', {
      virtuals: true,
    });
    schema.set('toJSON', {
      virtuals: true,
    });
    schema.plugin(findOrCreate);
  });

db.mongoose = mongoose;
db.Schema = mongoose.Schema;
db.User = mongoose.model('User', UserSchema);
db.Transaction = mongoose.model('Transaction', TransactionSchema);
db.Carousel = mongoose.model('Carousel', CarouselSchema);
db.News = mongoose.model('News', NewsSchema);
db.Order = mongoose.model('Order', OrderSchema);
db.Product = mongoose.model('Product', ProductSchema);
db.ReceivingAddress = mongoose.model('ReceivingAddress', ReceivingAddressSchema);
db.ApplyBonusTicket = mongoose.model('ApplyBonusTicket', ApplyBonusTicketSchema);
db.BonusTicket = mongoose.model('BonusTicket', BonusTicketSchema);
db.Category = mongoose.model('Category', CategorySchema);
db.Config = mongoose.model('Config', ConfigSchema);
db.MainType = mongoose.model('MainType', MainTypeSchema);
db.Merchant = mongoose.model('Merchant', MerchantSchema);
db.PurchaseOrder = mongoose.model('PurchaseOrder', PurchaseOrderSchema);
db.UserSignIn = mongoose.model('UserSignIn', UserSignInSchema);
db.Change = mongoose.model('Change', ChangeSchema);
db.Template = mongoose.model('Template', TemplateSchema);
db.Grid = mongoose.model('Grid', GridSchema);
db.Feedback = mongoose.model('Feedback', FeedbackSchema)
db.MerchantCategory = mongoose.model('MerchantCategory', MerchantCategorySchema);
db.ApplyMerchant = mongoose.model('ApplyMerchant', ApplyMerchantSchema);

const usdtProductId = mongoose.Types.ObjectId('5dc28cab22ca17b3317c8245')
const minerProductId = mongoose.Types.ObjectId('5dc28cab22ca17b3317c8246')

db.minerProductId = minerProductId

const initDatas = async () => {
  // 初始化数据库
  if (!global.isInitialed) {
    const salt = bcrypt.genSaltSync(10);
    const commonPwd = getPwd('ABCabc123', salt);
    const testUser = new db.User({
      name: 'test',
      nickname: 'test',
      mobile: '11111111111',
      pwd: commonPwd,
      paypwd: getPwd('123456', salt),
      authGroup: {
        platform: 'superAdmin',
        merchant: 'superAdmin',
      },
      newestVersion: '1.0.0',
      versionUrl: '',
      activeStatus: 'activated',
    });
    const superUser = new db.User({
      name: get('name')(system),
      nickname: get('name')(system),
      mobile: get('mobile')(system),
      pwd: getPwd(get('pwd')(system), salt),
      paypwd: getPwd(get('paypwd')(system), salt),
      authGroup: {
        platform: 'superAdmin',
        merchant: 'superAdmin',
      },
      merchant: pick(['name', 'code', 'businessLicense', 'address'])(merchant),
      applyMerchant: 'success',
      applyMerchantAt: new Date(),
      activeStatus: 'activated',
    })
    const expiredVipLevelUsers = await db.User.getVipLevelExpired();
    // 重启时加上清理计时器
    expiredVipLevelUsers.map(u => {
      schedule.scheduleJob(u.vipExpireAt, () => clearExpiredVip(u, db));
    })
    Promise.all([db.User.findOne({ mobile: '11111111111' }),
    db.Config.findOne({ identity: 'bellchet58' }),
    db.User.find({}, { id: 1, invitorCode: 1, inputInvitorCode: 1 }),
    db.Order.find({ status: 'deliverying', autoCompletedAt: { $gte: new Date() } }).populate('user merchant'),
    db.Order.find({ status: 'unpaid', autoClosedAt: { $gte: new Date() } }),
    db.Merchant.findOne({ code: get('code')(merchant) }),
    db.User.findOne({ mobile: get('mobile')(system) }),
    // 搜多USDT兑换过渡积分的商品
    db.Category.findOne({ supportBonus: true }),
    db.Order.find({ createdAt: getYesterdayRange(), status: 'paid', 'orderDetail.productId': minerProductId })]).then(([tester, config, users, incompletedOrders, unpaidOrders, singleMerchant, su, bonusCategory, lastMinerOrders]) => {
      if (!tester) {
        tester = testUser;
      }
      if (!config) {
        config = new db.Config({
          identity: 'bellchet58',
        })
      }
      if (!su) {
        su = superUser
      }
      if (!singleMerchant) {
        singleMerchant = new db.Merchant((pick(['name', 'code', 'businessLicense', 'address'])(merchant)));
      }
      if (!bonusCategory) {
        bonusCategory = new db.Category({
          name: '过渡积分',
          supportBonus: true,
        })
      }
      // 自动收货
      incompletedOrders.map(order => {
        schedule.scheduleJob(order.autoCompletedAt, () => (autoCompleteDeliveryingOrder(order, db)()))
      })
      // 自动取消
      unpaidOrders.map(order => {
        schedule.scheduleJob(order.autoClosedAt, () => (cancelDeliveryOrder(order, db)))
      })
      return Promise.all([tester && tester.save(), config && config.save(),
      su && su.save(), singleMerchant && singleMerchant.save(),
      bonusCategory && bonusCategory.save(), lastMinerOrders]);
    }).then(([testUser, config, su, singleMerchant, bonusCategory, lastMinerOrders]) => {
      testUser.invitorCode = testUser.id.slice(-6);
      if (su) {
        su.invitorCode = su.id.slice(-6);
        su.merchantId = get('_id')(singleMerchant);
      }
      if (singleMerchant) {
        singleMerchant.user = get('_id')(su)
      }
      global.lastDayMiners = compose(sumBy('num'), flatten, map('orderDetail'))(lastMinerOrders)
      singleMerchant.user = get('_id')(su);
      global.config = config;
      init(db);
      initCategories(db);
      console.log('数据库初始化成功！');
      global.isInitialed = true;
      const freezeJob = schedule.scheduleJob('0 0 * * *', () => freezeBonus(db).catch(console.error));
      // const dynamicJob = schedule.scheduleJob('5 0 * * *', () => deliveryDynamicBenefits(db).catch(console.error));
      // 用于更新价格数据
      // const exchanegJob = schedule.scheduleJob('0 17 * * *', () => exchangeUCCCoinFromAvailable(db).catch(console.error))
      // 发放矿场收益（不含v6平级收益）
      // schedule.scheduleJob('30 16 * * *', () => deliveryDailyMine(db).catch(console.error))
      // 用于发放每周分红
      // schedule.scheduleJob('59 23 * * 0', () => deliveryV6DividendWeekly(db).catch(console.error))
      const priceDailyRecord = schedule.scheduleJob('0 0 * * *', () => edouPriceDailyRecord(db).catch(console.error))
      // freezeBonus(db);
      // deliveryDailyMiner(db)
      // deliveryDynamicBenefits(db)
      // deliveryDailyMine(db)
      // deliveryV6DividendWeekly(db)
      // exchangeUCCCoinFromAvailable(db)
      // remind(db)
      return saveAll([testUser, su, singleMerchant])
    }).catch(err => {
      console.log(err);
    })
  }
}


try {
  initDatas();
} catch (err) {
  console.log(err)
}

module.exports = db;
