const db = require('../models');
const { assignIn, get, compose, set, startCase, identity } = require('lodash/fp');
const { pickByAttrs } = require('../utils/common');
const accessAuth = require('../utils/accessAuth');
const { SUCCESS_CREATE, SUCCESS_UPDATE } = require('../commons/respCommons')

const getQueryOption = (params) => {
  const setVisible = params.type ? set(`visible${startCase(params.type)}`, true) : identity;
  const setSupportBonus = set('supportBonus', (params.supportBonus == 'true') ? true : false)
  return compose(setSupportBonus, setVisible)({});
}
const categoryController = {
  select: async (req, resp) => {
    const categories = await db.Category.find(getQueryOption(req.query));
    resp.success(categories);
  },
  create: async (req, resp) => {
    const body = req.body;
    const category = await db.Category.findById(body.belongingCategory);
    if (get('level')(category) >= 3) {
      throw '商品分类不能超过3级'
    }
    const newCategory = new db.Category(assignIn({
      belongingCategory: get('_id')(category),
      level: (get('level')(category) || 0) + 1,
    })(pickByAttrs(body, ['name', 'visibleIndex', 'visibleNav', 'visibleMerchant', 'sort', 'imageUrl', 'supportBonus'])));
    await newCategory.save();
    resp.success(SUCCESS_CREATE);
  },

  update: async (req, resp) => {
    const categoryId = req.params.categoryId;
    const body = req.body;
    const category = await db.Category.findById(categoryId);
    const params = pickByAttrs(body, ['name', 'visibleIndex', 'visibleNav', 'visibleMerchant', 'sort', 'imageUrl', 'supportBonus']);
    if (body.belongingCategory) {
      const belongingCategory = await db.Category.findById(body.belongingCategory);
      if (belongingCategory.level >= 3) {
        throw '商品分类不能超过3级'
      } else {
        params.belongingCategory = belongingCategory._id;
        params.level = belongingCategory.level + 1;
      }
    }
    Object.assign(category, params);
    await category.save();
    resp.success(SUCCESS_UPDATE);
  }
}

module.exports = categoryController;