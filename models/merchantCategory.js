const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { map } = require('lodash/fp')

const MerchantCategory = new Schema({
  merchant: {
    type: Schema.Types.ObjectId,
    ref: 'Merchant'
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category'
  },
  sort: {
    type: Number,
    default: 0
  },
  // 商户主页显示
  visible: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true,
})

MerchantCategory.statics.findOneNotNull = async function findOneNotNull(params) {
  return await findOne(params, this, '未找到商品分类');
}

MerchantCategory.statics.findByCategoryIds = async function findByCategoryIds(categories, merchantId) {
  const categoryOption = categories.length ? { category: { $in: map('_id')(categories)}} : {}
  return await this.find({ ...categoryOption, merchant: merchantId.toHexString ? merchantId : mongoose.Types.ObjectId(merchantId)}, 'sort visible category')
}

module.exports = MerchantCategory;