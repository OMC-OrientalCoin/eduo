const db = require('../models');
const { flatten, sumBy, curryRight, some, filter, get, pick, toNumber, assignIn, range, join, split, compact, identity, slice, map, set, compose, last } = require('lodash/fp');
const { getMerchantId, isAdmin, getObjectIds, getIds, getGridData, getCommaSplited, pickByAttrs, getAbsoluteStaticUrl, getLastTime, getJSONs, userFilter } = require('../utils/common');
const { throwFailedMessage, resizePicture, deleteAll, findOne } = require('../utils/promiseHelper');
const { SUCCESS_DELETE, SUCCESS_CREATE, SUCCESS_UPDATE } = require('../commons/respCommons');
const { Types } = require('mongoose')

const setCategoryChainLast = curryRight((value, params) => {
  return { 'categoryChain.2': value }
})

const getSearchQueryOption = (query) => {
  const setSearchWord = query.searchWord ? set('name', new RegExp(query.searchWord)) : identity;
  const setCategory = query.categoryId && query.includeChilds !== 'true' ? set('$or', [{ category: Types.ObjectId(query.categoryId) }, { 'categoryChain.2': Types.ObjectId(query.categoryId) }]) : identity;
  const setSupportBonus = (typeof query.supportBonus === 'string' && query.supportBonus === 'true') ? set('category', { $exists: true }) : identity;
  const setIsHot = query.isHot === 'true' ? set('isHot', true) : identity;
  const setIncludeChilds = query.includeChilds === 'true' ? set('categoryChain', Types.ObjectId(query.categoryId)): identity;
  return compose(setIncludeChilds, setIsHot, setCategory, setSearchWord, setSupportBonus)({ saleStatus: 'onShelves', productStatus: 'permit' });
}

const getQueryOption = (query) => {
  const setProductName = query.productName ? set('name', new RegExp(query.productName)) : identity;
  const setSaleStatus = query.saleStatus ? set('saleStatus', query.saleStatus) : identity;
  const setTime = query.startTime && query.endTime ? set('createdAt', { $gte: new Date(query.startTime), $lt: getLastTime(query.endTime) }) : identity;
  const setProductStatus = query.productStatus ? set('productStatus', query.productStatus) : identity;
  const setCategory = query.category ? set('categoryChain', Types.ObjectId(query.category)) : identity;
  const setId = query.id ? set('_id', Types.ObjectId(query.id)) : identity;
  const setIsHot = query.isHot === 'true' ? set('isHot', true) : query.isHot === 'false' ? set('isHot', false): identity;
  return compose(setIsHot, setId, setCategory, setProductStatus, setProductName, setSaleStatus, setTime)({});
}
const getResizePromises = compose(map(resizePicture), map(getAbsoluteStaticUrl))

const incompleteStatus = ['unpaid', 'paid', 'deliverying'];

const productController = {

  // 带搜索功能
  select: async (req, resp, next) => {
    const query = req.query;
    const queryOption = getSearchQueryOption(query);
    const offset = toNumber(query.start);
    const limit = toNumber(query.limit);
    const [products, count] = await Promise.all([db.Product.find(queryOption, 'id name category detailInfo price createdAt updatedAt saleStatus imageUrls thumbnail amount unit merchant earnBonus salesVolumn', {
      skip: offset,
      limit: limit,
      sort: {
        createdAt: -1,
      }
    }), db.Product.countDocuments(queryOption)]);
    resp.success(getGridData(products, count));
  },

  // 平台
  selectAll: async (req, resp) => {
    const query = req.query;
    const merchants = await db.Merchant.find({ name: new RegExp(query.merchantName) }, '_id');
    const baseQueryOption = query.merchantId ? { merchant: Types.ObjectId(query.merchantId) } : (query.merchantName ? {
      merchant: { $in: map('_id')(merchants) }
      // 这里只返回商户的
    } : { merchant: { $exists: true }})
    const products = await db.Product.find(assignIn(baseQueryOption)(getQueryOption(query))).populate('categoryChain merchant')
    const orders = await db.Order.find({ 'orderDetail.productId': { $in: map('_id')(products) }, status: { $in: incompleteStatus } }, '_id');
    const getResult = compose(map(product => {
      const getNum = compose(get('length'), filter(some(['orderDetail.productId', product._id])));
      product.incompleteNum = getNum(orders)
      product.category = pick(['name', '_id'])(last(product.categoryChain));
      product.merchant = pick(['name', '_id'])(product.merchant);
      delete product.categoryChain
      return product;
    }), getJSONs)
    resp.success(getGridData(getResult(products)));
  },

  // 平台 积分部分
  selectBonus: async (req, resp) => {
    const query = req.query;
    // const categories = await db.Category.find({ name: new RegExp(query.searchWord)}, '_id');
    // const setCategory = categories.length ? set('category', { $in: map('_id')(categories) }): identity;
    const setName = query.searchWord ? set('name', new RegExp(query.searchWord)) : identity;
    const setSaleStatus = query.saleStatus ? set('saleStatus', query.saleStatus) : identity;
    const products = await db.Product.find(setName(setSaleStatus({})), 'id name thumbnail sort saleStatus salesVolumn amount price detailInfo categoryChain merchant');
    // TODO 这里一个分歧点只留下一级分类的
    // const getResult = filter(p => p.categoryChain.length == 1)
    const getResult = filter(p => !p.merchant)
    resp.success(getGridData(getResult(products)));
  },


  select4Merchant: async (req, resp) => {
    const merchantId = getMerchantId(req.session);
    const products = await db.Product.find(assignIn({
      merchant: merchantId && merchantId.toHexString ? merchantId : Types.ObjectId(merchantId),
    })(getQueryOption(req.query))).populate('categoryChain merchant');
    const getResult = compose(map(product => {
      product.category = pick(['_id', 'name'])(last(product.categoryChain));
      product.merchant = pick(['_id', 'name'])(product);
      delete product.categoryChain
      return product;
    }), getJSONs)
    resp.success(getGridData(getResult(products)));
  },

  selectById: async (req, resp, next) => {
    const mapSale = p => (p.saleSpecification && p.saleSpecification.length ? p.saleSpecification: p);
    const getSpecSalesVolumn = compose(sumBy('salesVolumn'), flatten, map(mapSale));
    const product = await db.Product.findById(req.params.productId).select('+comments').populate('merchant comments.user template');
    const merchantProducts = await db.Product.find({ _id: { $in: get('merchant.products')(product)}}, 'salesVolumn saleSpecification');
    const formatCommentUser = (product) => {
      product.comments = product.comments && product.comments.map(comment => {
        comment.user = pick(['nickname', 'avatar'])(comment.user)
        return comment;
      })
      return product
    }
    if (!product) {
      throw ('商品不存在！');
    } else {
      resp.success(set('merchant.salesVolumn', getSpecSalesVolumn(merchantProducts) || get('merchant.salesVolumn')(product))(formatCommentUser(product.toJSON())));
    }
  },

  // 商户merchantAdmin/superAdmin
  create: async (req, resp, next) => {
    const body = req.body;
    const imageUrls = getCommaSplited(body.imageUrls);
    const params = pickByAttrs(body, ['name', 'price', 'detailInfo', 'salesVolumn', 'amount', 'saleStatus', 'sort', 'thumbnail', 'perLimit', 
    'countLimit', 'containsFeight', 'each', 'freight', 'saleSpecifications', 'template', 'info']);
    const merchant = await db.Merchant.findById(getMerchantId(req.session));
    if (body.specifications) {
      const specifications = JSON.parse(body.specifications);
      params.specifications = specifications.map(s => {
        s.merchant = get('_id')(merchant)
        return s;
      })
    }
    if(params.template) {
      const template = await db.Template.findOneNotNull(params.template);
      params.template = template._id
    }
    if (body.saleSpecification) {
      params.saleSpecification = JSON.parse(body.saleSpecification);
    }
    const categoryChain = getIds(body.categoryChain)
    const newProduct = new db.Product(assignIn({
      imageUrls,
      categoryChain,
      merchant: merchant._id,
    })(params));
    const [product] = await Promise.all([newProduct.save(), getResizePromises(imageUrls)])
    merchant.products.push(product._id);
    await merchant.save()
    resp.success(SUCCESS_CREATE);
  },

  // 平台superAdmin,merchantAdmin
  create4Bonus: async (req, resp) => {
    const body = req.body;
    const imageUrls = getCommaSplited(body.imageUrls);
    let category
    if(body.ignoreCategory) {
      category = await db.Category.findOne({ name: '过渡积分' })
    }else {
      category = await findOne(body.categoryId, db.Category, '没找到分类');
    }
    const categoryNode = global.categoryRoot.first(n => n.model.id == category.id);
    // 去掉根节点为null的
    // getPath是返回ID吗？
    const categoryChain = getObjectIds(map('model.id')(categoryNode.getPath().slice(1)));
    const getParams = pick(['name', 'price', 'categoryId', 'detailInfo', 'salesVolumn', 'amount', 'supportBonus', 'saleStatus', 'sort', 'thumbnail', 'info']);
    const newProduct = new db.Product(assignIn({
      imageUrls,
      category: category._id,
      categoryChain,
    })(getParams(body)));
    await newProduct.save();
    resp.success(SUCCESS_CREATE);
  },

  // 平台superAdmin,merchantAdmin
  update: async (req, resp, next) => {
    const body = req.body;
    const product = await findOne(req.params.productId, db.Product, '没有找到商品');
    if (product.merchant != getMerchantId(req.session)) {
      throw '编辑的商户商品不是自己的';
    }
    const params = pickByAttrs(body, ['name', 'price', 'categoryChain', 'imageUrls', 'detailInfo', 'salesVolumn', 'amount', 'saleStatus', 'sort', 'thumbnail', 'perLimit', 'countLimit', 'containsFreight', 'each', 'freight', 'specifications', 'saleSpecification', 'template', 'info']);
    if (params.categoryChain) {
      params.categoryChain = getObjectIds(getCommaSplited((params.categoryChain)));
    }
    if(params.template) {
      const template = await db.Template.findOneNotNull(params.template);
      params.template = template._id;
    }
    if (params.imageUrls) {
      params.imageUrls = getCommaSplited(params.imageUrls);
      await getResizePromises(params.imageUrls);
    }
    if (body.specifications) {
      const specifications = JSON.parse(body.specifications);
      params.specifications = specifications.map(s => {
        s.merchant = getMerchantId(req.session);
        return s;
      })
    }
    if (body.saleSpecification) {
      params.saleSpecification = JSON.parse(body.saleSpecification);
    }
    Object.assign(product, params);
    await product.save();
    resp.success(SUCCESS_UPDATE)
  },

  // 平台superAdmin,merchantAdmin
  update4Bonus: async (req, resp) => {
    const productId = req.params.productId;
    const body = req.body;
    const getParams = pick(['name', 'price', 'categoryId', 'detailInfo', 'salesVolumn', 'amount', 'supportBonus', 'saleStatus', 'sort', 'thumbnail']);
    const product = await findOne(productId, db.Product, '没找到商品');
    const params = getParams(body);
    if (body.imageUrls) {
      params.imageUrls = getCommaSplited(body.imageUrls);
      await getResizePromises(params.imageUrls);
    }
    if(!body.ignoreCategory && params.categoryId) {
      const category = await findOne(params.categoryId, db.Category, '没找到分类');
      params.categoryChain = [get('_id')(category)];
    }
    Object.assign(product, params);
    await product.save();
    resp.success(SUCCESS_UPDATE);
  },

  // 由商户来删
  // 商户merchantAdmin,superAdmin
  // 验证对应所属商户关系
  destroy: async (req, resp, next) => {
    const product = await findOne(req.params.productId, db.Product, '没找到商品');
    if (product.merchant != getMerchantId(req.session)) {
      throw '删除的商户商品不是自己的'
    }
    await product.remove()
    resp.success(SUCCESS_DELETE);
  },

  // 平台merchantAdmin/superAdmin
  toggleProductStatus: async (req, resp) => {
    const productId = req.params.productId;
    const product = await findOne(productId, db.Product, '没找到商品');
    product.productStatus = product.productStatus === 'permit' ? 'forbid' : 'permit';
    await product.save()
    resp.success('操作成功！');
  },

  /**
   * 添加热门
   */
  addHot: async (req, resp) => {
    const product = await db.Product.findOneNotNull(req.params.productId);
    const params = pickByAttrs(req.body, ['isHot', 'hotSort']);
    Object.assign(product, params);
    await product.save()
    resp.success(SUCCESS_UPDATE);
  },

  /**
   * 收藏
   * @param {*} req 
   * @param {*} resp 
   */
   collect: async (req, resp, next) => {
    const productId = Types.ObjectId(req.params.productId);
    const user = await db.User.findOneNotNull(req.session.user._id);
    const product = user.collectProducts.indexOf(productId) >= 0;
    if(product) {
      const result = await db.User.updateOne({ _id: req.session.user._id }, { $pull: { collectProducts: productId}})
    }else {
      const p = await db.Product.findById(productId);
      user.collectProducts.push(p._id);
      await user.save()
    }
    resp.success(product ? '已取消收藏': '添加收藏成功');
  },

  /**
   * 获取我的收藏列表
   * @param {*} req 
   * @param {*} resp 
   * @param {*} next 
   */
  async collectList(req, resp, next) {
    const user = await db.User.findById(req.session.user._id).populate('collectProducts');
    resp.success(getGridData(user.collectProducts));
  }


}

module.exports = productController;