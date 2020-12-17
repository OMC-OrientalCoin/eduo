const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { findOne } = require('../utils/promiseHelper')
const { userFilter } = require('../utils/common')

const Category = new Schema({
  name: {
    type: String,
    required: true,
  },
  level: {
    type: Number,
    default: 1,
    min: 1,
  },
  // 缩略图
  imageUrl: {
    type: String,
  },
  sort: {
    type: Number,
    default: 1,
    min: 0,
  },
  belongingCategory: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
  },
  visibleIndex: {
    type: Boolean,
    default: true,
  },
  visibleNav: {
    type: Boolean,
    default: true,
  },
  visibleMerchant: {
    type: Boolean,
    default: true,
  },
  supportBonus: {
    type: Boolean,
    default: false,
  }
}, {
  timestamps: true,
})
// 获取用户部分搜索子集
Category.statics.getQueryOption = async function (params, field = 'category') {
  if(Object.keys(params).length) {
    const users = await this.find(userFilter(params), '_id');
    return { [field]: map('_id')(users) }
  }else {
    return Object.create(null)
  }
}

Category.statics.findOneNotNull = async function findOneNotNull(params) {
  const result = await findOne(params, this, '未找到分类');
  return result;
}
module.exports = Category;