const db = require('../models');
const { last, set, groupBy, uniqBy, filter, pick, assignIn, map, uniq, flatten, compose, get, identity, toNumber, sumBy, find, sortBy, reverse } = require('lodash/fp');
const { Types } = require('mongoose')
const { pickByAttrs, getYesterdayRange, getJSONs, getGridData, getBeforeYesterdayRange, getLastTime, userFilter, getMerchantId } = require('../utils/common')
const { memoize } = require('lodash')
const { findOne, saveAll } = require('../utils/promiseHelper');
const { notSuperAdmin, notRole, notNull } = require('../utils/accessAuth')
const { SUCCESS_UPDATE, SUCCESS_CREATE } = require('../commons/respCommons')
const bcrypt = require('bcryptjs');
const ONSHELVES = 'onShelves';
const { supportTokens } = require('../config')

const pickSessionMerchantUserFields = pick(['id', '_id', 'authGroup', 'paypwd', 'mobile', 'merchantId', 'servingMerchant', 'user', 'category', 'walletStatus'])
const getProductNum = compose(get('length'), filter(p => p.saleStatus === ONSHELVES));

const getQueryOption = (query) => {
  const setSearchWord = query.searchWord ? set('name', new RegExp(query.searchWord)) : identity;
  const setTime = query.startTime && query.endTime ? set(query.kycStatus ? 'applyKycAt' : 'createdAt', { $gte: new Date(query.startTime), $lt: getLastTime(query.endTime) }) : identity;
  return compose(setSearchWord, setTime)({});
}
const merchantController = {

  // 前台获取所有商户
  selectAll: async (req, resp) => {
    const merchants = await db.Merchant.find({ ...getQueryOption(req.query), status: 'enabled' },
      'id name imageUrl productNum products salesVolumn address bonusTickets recommended')
      .populate('bonusTickets products');
    const mapSale = p => (p.saleSpecification && p.saleSpecification.length  ? p.saleSpecification: p);
    const getSpecSalesVolumn = compose(sumBy('salesVolumn'), flatten, map(mapSale));
    const getResult = compose(map(merchant => {
      merchant.bonusTickets = map(pick(['id', 'name', '_id']))(merchant.bonusTickets);
      merchant.productNum = getProductNum(merchant.products) || merchant.productNum;
      merchant.salesVolumn = getSpecSalesVolumn(merchant.products) || merchant.salesVolumn;
      delete merchant.products
      return merchant;
    }), getJSONs)
    resp.success(getResult(merchants));
  },
  // 后台获取所有商户
  select: async (req, resp) => {
    const merchantOption = userFilter(pick(['id', 'name'])(req.query));
    const userOption = await db.User.getUserQueryOption(pick(['user', 'nickname', 'email', 'mobile'])(req.query))
    const merchants = await db.Merchant.find({ ...userOption, ...merchantOption },
      'salesVolumn id name mainType telephone sort status imageUrl businessStartTime businessEndTime businessLicense code address recommended products user totalSaleAmount totalExtractOutAmount createdAt')
      .populate('mainType products user');
    const getResult = compose(map(merchant => {
      merchant.user = pick(['id', 'nickname', 'registBy', 'areaCode', 'mobile', 'email'])(merchant.user)
      merchant.productNum = getProductNum(merchant.products) || merchant.productNum;
      delete merchant.products
      return merchant;
    }), getJSONs)
    resp.success(getGridData(getResult(merchants)));
  },
  // 商家申请
  selectApply: async (req, resp) => {
    const applys = await db.User.find(assignIn({
      applyMerchant: 'applying',
    })(getQueryOption(req.query)),
      'id mobile name merchant mainType businessLicense createdAt applyMerchant applyMerchantAt').populate('merchant.mainType')
    const getResult = compose(map(apply => {
      apply.user = pick(['id', 'name', 'mobile', 'applyMerchant'])(apply)
      apply.mainType = apply.merchant.mainType;
      apply.businessLicense = apply.merchant.businessLicense
      apply.merchant = pick(['_id', 'name'])(apply.merchant);
      return apply;
    }), getJSONs)
    resp.success(getGridData(getResult(applys)));
  },
  selectExtractApply: async (req, resp) => {
    // 商户提现记录的情况
    const query = req.query;
    const offset = toNumber(query.start);
    const limit = toNumber(query.limit);
    const setTime = query.startTime && query.endTime ? set('createdAt', { $gte: new Date(query.startTime), $lt: getLastTime(query.endTime) }) : identity;
    let transactions;
    let count, userOption = {};
    const userParams = pickByAttrs(req.query, ['user', 'areaCode', 'mobile', 'email']);
    if(Object.keys(userParams).length > 0) {
      userOption = await db.User.getUserQueryOption(userParams);
    }
    const setMerchantName = query.merchantName ? set('name', query.merchantName): identity;
    const setSearchWord = query.searchWord && query.searchWord.length === 24 ? set('_id', Types.ObjectId(query.searchWord)): query.searchWord ? set('name', new RegExp(query.searchWord)) : identity;
    const setTxId = query.searchWord && query.searchWord.length === 24 ? set('_id', Types.ObjectId(query.searchWord)): identity;
    const merchants = !query.merchantID && await db.Merchant.find(setMerchantName(setSearchWord({})), '_id');
    const setOwner = query.searchWord && merchants.length ? set('merchant', { $in: map('_id')(merchants) }) : set('merchant', { $exists: true });
    const setUnit = query.unit ? set('unit', query.unit) : identity;
    const setChannel = query.channel ? set('channel', query.channel): identity;
    const setProcessTime = query.processStartTime && query.processEndTime ? set('completedAt', { $gte: new Date(query.processStartTime), $lt: new Date(query.processEndTime)}) : identity;
    const setStatus = query.status ? set('status', query.status): identity;
    let queryOption = setStatus(setTxId(setProcessTime(setChannel(setUnit(!query.merchantID ? setOwner(setTime({ type: 'extractOut' }))
      : setTime({ merchant: Types.ObjectId(query.merchantID), type: 'extractOut' }))))));
    queryOption = { ...queryOption, ...userOption};
    [transactions, count] = await Promise.all([db.Transaction.find((queryOption),
      null, {
        skip: offset,
        limit: limit,
        sort: {
          createdAt: -1,
        }
      }
    ).populate('merchant user'), db.Transaction.countDocuments(queryOption)]);
    const getResult = compose(map(transaction => {
      transaction.user = pick(['name'])(transaction.user);
      transaction.merchant = pick(['_id', 'id', 'name'])(transaction.merchant);
      return transaction;
    }), getJSONs);
    resp.success(getGridData(getResult(transactions), count));
  },
  selectById: async (req, resp) => {
    const merchantId = req.params.merchantId;
    const merchant = await db.Merchant.findById(merchantId,
      'id salesVolumn name imageUrl products bonusTickets address mainType telephone businessStartTime businessEndTime businessLicense fullName code')
      .populate('products products.category bonusTickets mainType');
    const getCategoryIds = compose(uniq, flatten, map('lastCategory'));
    const categories = merchant && merchant.products ? await db.Category.find({ _id: { $in: getCategoryIds(merchant && merchant.products) } }, 'id name sort level visible') : [];
    const merchantCategories = await db.MerchantCategory.findByCategoryIds(categories, merchantId);
    const findCategoryById = (id) => find(['category', Types.ObjectId(id)])(merchantCategories)
    const updateCategories = compose(reverse, sortBy(['sort']), map(category => {
      const params = pickByAttrs((findCategoryById(category.id)), ['sort', 'visible']);
      return assignIn({ sort: 0, visible: true, ...category })(params);
    }), getJSONs)
    const productNum = getProductNum(merchant.products);
    const setProductNum = productNum ? set('productNum', productNum) : identity;
    const mapSale = p => (p.saleSpecification && p.saleSpecification.length ? p.saleSpecification: p);
    const getSpecSalesVolumn = compose(sumBy('salesVolumn'), flatten, map(mapSale));
    resp.success(assignIn(merchant.toJSON(), setProductNum({ categories: updateCategories(categories), salesVolumn: getSpecSalesVolumn(merchant.products) || merchant.salesVolumn })));
  },

  applyMerchant: async (req, resp) => {
    let user = req.session.user;
    const applyMerchant = user.applyMerchant;
    if (notNull(user, 'merchant') && user.servingMerchant) {
      throw '该用户已是某商户管理员'
    } else if (applyMerchant && applyMerchant != 'refuse') {
      throw '该用户已申请商户'
    } else {
      const params = pick(['name', 'code', 'businessLicense', 'address', 'mainType'])(req.body);
      if (params.mainType) {
        params.mainType = Types.ObjectId(params.mainType)
      }
      user = await db.User.findById(user.id);
      user.merchant = params;
      user.applyMerchant = 'applying';
      user.applyMerchantAt = new Date();
      user = await user.save();
      resp.success('申请商户成功！');
    }
  },

  /**
   * 
   */
  create: async (req, resp) => {
    const [user, count] = await Promise.all([db.User.findOneNotNull(req.params.userId), db.Merchant.countDocuments()]);
    user.applyMerchant = 'success';
    user.applyMerchantAt = new Date();
    user.authGroup.merchant = 'superAdmin';
    const newMerchant = new db.Merchant({
      user: user._id,
      rank: count + 1,
    })
    user.merchantId = newMerchant._id;
    await saveAll([user, newMerchant]);
    resp.success(SUCCESS_CREATE);
  },

  //  根据ID获取商户统计数据
  statisticById: async (req, resp) => {
    const merchantId = req.params.merchantId;
    const [orders, merchant, yesterdayOrders, beforeYesterdayOrders, notDelivery] = await Promise.all([db.Order.find({
      merchant: Types.ObjectId(merchantId),
      status: { $ne: 'canceled' }
    }, 'amount user status freight bonus'),
    db.Merchant.findById(merchantId),
    // yesterdayOrders
    db.Order.find({
      merchant: Types.ObjectId(merchantId),
      createdAt: getYesterdayRange(),
      status: { $nin: ['canceled', 'unpaid'] },
    }, 'amount user freight bonus'),
    // beforeYesterdayOrders
    db.Order.find({
      merchant: Types.ObjectId(merchantId),
      createdAt: getBeforeYesterdayRange(),
      status: { $nin: ['canceled', 'unpaid'] },
    }, 'user'),
    db.Order.countDocuments({
      merchant: Types.ObjectId(merchantId),
      status: 'paid',
    })]);
    const uniqByUser = uniqBy(o => o.user && o.user.toHexString());
    const mapUser = map(o => o.user.toHexString());
    const beforeYesterdayBuyers = compose(map('user'), uniqByUser)(beforeYesterdayOrders);
    const getNewBuyer = compose(get('length'), uniqByUser, mapUser, filter(o => beforeYesterdayBuyers.indexOf(o.user) < 0));
    const getCustomerNum = compose(get('length'), uniqByUser, filter(o => o.status !== 'unpaid'))
    const tokensAvailable = supportTokens ? supportTokens.map(token => (`${token}Available`)): ['eosAvailable', 'btcAvailable', 'ethAvailable'];
    resp.success(assignIn(pick(['amount', ...tokensAvailable])(merchant), {
      orderNum: get('length')(orders),
      orderAmount: sumBy('allPrice')(orders),
      yesterdayOrderNum: get('length')(yesterdayOrders),
      yesterdayOrderAmount: sumBy('allPrice')(yesterdayOrders),
      yesterdayCustomerNum: getNewBuyer(yesterdayOrders),
      notDelivery,
      customerNum: getCustomerNum(orders),
    }));
  },

  //获取商家数据相关
  selectStatistic: async (req, resp) => {
    const query = req.query;
    const option = getQueryOption(query);
    const [merchants, count] = await Promise.all([db.Merchant.find(option, 'name id amount availableAmount extractedAmount', {
      skip: toNumber(query.start),
      limit: toNumber(query.limit),
    }), db.Merchant.countDocuments()]);
    const orders = await db.Order.find({ merchant: { $in: map('_id')(merchants) }, status: { $nin: ['unpaid', 'canceled'] } }, 'user merchant amount frieght bonus payment actualPrice');
    const getResult = compose(map(merchant => {
      const merchantOrders = orders.filter(o => o.merchant == merchant.id);
      return assignIn(merchant)({
        salesAmount: sumBy('actualPrice')(merchantOrders),
        orderNum: get('length')(merchantOrders),
        userNum: compose(get('length'), uniqBy(o => o.user.toHexString()))(merchantOrders),
      })
    }), getJSONs);
    resp.success(getGridData(getResult(merchants)), count);
  },

  // 买家信息获取
  selectBuyers: async (req, resp) => {
    const orders = await db.Order.find({ merchant: req.session.user._id, status: { $nin: ['canceled', 'unpaid'] } }, 'user amount createdAt').populate('user');
    const orderGroup = groupBy(order => {
      return order.user.id;
    })(orders);
    resp.success(getGridData(Object.keys(orderGroup).map((key) => {
      const user = get('0.user')(orderGroup[key]);
      // 可能获取ID有些问题
      return assignIn(pick(['id', 'nickname', 'mobile'])(user), {
        id: key,
        purchaseTimes: get('length')(orderGroup[key]),
        totalAmount: sumBy('amount')(orderGroup[key]),
        createdAt: compose(get('createdAt'), last)(orderGroup[key]),
      })
    })))
  },

  login: async (req, resp) => {
    const body = req.body;
    const user = await db.User.findOneByMobileOrEmail(body, {
      populate: 'merchantId servingMerchant'
    })
    if (!user || (!user.merchantId && !user.servingMerchant)) {
      throw '没找到管理员';
    } else {
      const merchant = user.merchantId || user.servingMerchant;
      if (merchant.status === 'disabled') {
        throw '该商户已被禁用';
      } else if (!bcrypt.compareSync(body.pwd, user.pwd)) {
        throw '密码不正确！';
      } else {
        const newMerchant = assignIn(merchant.toJSON())(pick(['authGroup', 'walletStatus'])(user));
        req.session.user = pickSessionMerchantUserFields(newMerchant);
        req.session.isMerchant = true;
        resp.success(newMerchant);
      }
    }
  },

  update: async (req, resp) => {
    if (notSuperAdmin(req.session.user, 'merchant')) {
      throw '没有权限！';
    } else {
      const merchant = await findOne(req.params.merchantId, db.Merchant, '没找到对应商户');
      const params = pickByAttrs(req.body, ['name', 'address', 'telephone', 'mainType', 'businessStartTime', 'businessEndTime', 'imageUrl', 'productId', 'code', 'businessLicense', 'fullName']);
      if (params.productId) {
        const product = await db.Product.findOneNotNull(params.productId);
        params.productId = get('_id')(product)
      }
      if (params.mainType) {
        const mainType = await db.MainType.findById(params.mainType);
        params.mainType = get('_id')(mainType);
      }
      Object.assign(merchant, params);
      await merchant.save();
      resp.success(SUCCESS_UPDATE);
    }
  },

  /**
   * 编辑商品分类
   */
  updateMerchantCategory: async (req, resp) => {
    const categoryId = req.params.categoryId;
    const merchantId = getMerchantId(req.session)
    const body = req.body;
    let [category, merchantCategory] = await Promise.all([db.Category.findOneNotNull(categoryId),
    db.MerchantCategory.findOne({ merchant: merchantId, category: Types.ObjectId(categoryId) })]);
    if(!merchantCategory) {
      merchantCategory = new db.MerchantCategory({
        merchant: merchantId,
        category: get('_id')(category),
        sort: body.sort,
        visible: body.visible,
      });
    } else {
      const params = pickByAttrs(req.body, ['sort', 'visible']);
      Object.assign(merchantCategory, params);
    }
    await merchantCategory.save()
    resp.success(SUCCESS_UPDATE)
  },

  // platform's merchantAdmin/ superAdmin
  updateByPlatform: async (req, resp) => {
    const merchant = await findOne(req.params.merchantId, db.Merchant, '没找到对应商户');
    const params = pickByAttrs(req.body, ['name', 'address', 'telephone', 'mainType', 'businessStartTime', 'businessEndTime', 'imageUrl', 'recommended', 'sort']);
    if (params.mainType) {
      const mainType = await db.MainType.findById(params.mainType);
      params.mainType = get('_id')(mainType);
    }
    Object.assign(merchant, params);
    await merchant.save();
    resp.success(SUCCESS_UPDATE);

  },

  toggleStatus: async (req, resp) => {
    let merchant = await findOne(req.params.merchantId, db.Merchant, '没找到对应商户');
    merchant.status = merchant.status === 'enabled' ? 'disabled' : 'enabled';
    merchant = await merchant.save();
    resp.success(`${merchant.status === 'enabled' ? '启用' : '禁用'}成功`);
  },


}

module.exports = merchantController;