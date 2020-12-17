const db = require('../models');
const { TRANSFER_SUCCESS, FAILED, SUCCESS_UPDATE, SUCCESS_DELETE, SUCCESS_CREATE } = require('../commons/respCommons');
const { isAdmin, getGridData, pickByAttrs, getIds, getAbsoluteStaticUrl, getJSONs, getLastTime } = require('../utils/common');
const { trim, map, assignIn, compose, sortBy, identity, set, reverse, get } = require('lodash/fp');
const { Types } = require('mongoose');
const { throwFailedMessage, saveAll, deleteAll, resizePicture } = require('../utils/promiseHelper');
const { findAndCount } = require('../utils/queryHelper');
const { notSuperAdmin } = require('../utils/accessAuth')

const getQueryOption = (query) => {
  const setSearchWord = query.searchWord ? (query.searchWord.length === 24? set('_id', Types.ObjectId(query.searchWord)) : set('name', new RegExp(query.searchWord)) ): identity;
  const setTime = query.startTime && query.endTime ? set('createdAt', { $gte: new Date(query.startTime), $lt: getLastTime(query.endTime) }) : identity;
  const setVisible = query.visible === 'true' ? set('visible', true) : identity;
  return setVisible(setTime(setSearchWord({})));
}

const carouselController = {

  select: async (req, resp, next) => {
    const carousels = await db.Carousel.find(getQueryOption(req.query)).populate('category');
    const getResult = compose(map(carousel => {
      carousel.categoryName = get('category.name')(carousel);
      carousel.category = get('category._id')(carousel);
      return carousel;
    }), reverse, sortBy('sort'), getJSONs);
    resp.success(getGridData(getResult(carousels)));
  },

  create: async (req, resp) => {
    const body = req.body;
    if (notSuperAdmin(req.session.user, 'platform')) {
      resp.failed('当前用户没有创建权限');
    } else {
      const product = await db.Product.findOne({ '_id': Types.ObjectId(body.product) })
      const category = await db.Category.findOne({ '_id': Types.ObjectId(body.category) })
      const newCarousel = db.Carousel({
        product: get('_id')(product),
        category: get('_id')(category),
        imageUrl: body.imageUrl,
        sort: body.sort,
        name: body.name,
        isProduct: !! product,
        visible: body.visible
      });
      if (!category && !product) {
        throw '请检查ID'
      } else {
        const [carousel, resize] = await Promise.all([newCarousel.save(), resizePicture(getAbsoluteStaticUrl(newCarousel.imageUrl))]);
        resp.success(SUCCESS_CREATE);
      }
    }
  },

  update: async (req, resp, next) => {
    const body = req.body;
    if (notSuperAdmin(req.session.user, 'platform')) {
      resp.failed('当前用户没有权限');
    } else {
      const carousel = await db.Carousel.findById(req.params.carouselId);
      if (!carousel) {
        throw '没找到轮播图'
      } else {
        const params = pickByAttrs(body, ['category', 'imageUrl', 'sort', 'name', 'product', 'visible']);
        if (body.product) {
          const product = await db.Product.findOne({ '_id': Types.ObjectId(body.product) })
          if (!product) {
            throw '请检查ID'
          } else {
            params.product = get('_id')(product)
          }
        }
        if (params.category) {
          const category = await db.Category.findById(params.category);
          if (!category) {
            throw '没找到对应分类！'
          } else {
            params.category = category._id
          }
        }
        Object.assign(carousel, params);
        if (params.imageUrl) {
          await Promise.all([carousel.save(), resizePicture(getAbsoluteStaticUrl(carousel.imageUrl))])
        } else {
          await carousel.save()
        }
        resp.success(SUCCESS_UPDATE)
      }
    }
  },

  // destroy(req, resp, next) {
  //   const ids = getIds(req.body.carouselIds);
  //   Promise.all([db.Carousel.find({
  //     _id: ids
  //   }), db.Product.find({ carousel: ids })]).then(([carousels, products]) => {
  //     products.map(p => { p.carousel = null });
  //     return Promise.all([deleteAll(carousels), saveAll(products)]);
  //   }).then(([del, upd]) => {
  //     resp.success(SUCCESS_DELETE);
  //   }).catch(next);
  // },


};

module.exports = carouselController;