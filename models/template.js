
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { findOne } = require('../utils/promiseHelper')

const Template = new Schema({
  merchant: {
    type: Schema.Types.ObjectId,
    ref: 'Merchant'
  },
  name: {
    type: String,
  },
  rule: {
    type: String,
    enum: ['count'],
    default: 'count'
  },
  // 配送区域和运费
  areaCost: [{
    areas: [String],
    first: Number,
    others: Number,
  }],
}, {
  timestamps: true,
})

Template.statics.findOneNotNull = async function findOneNotNull(params) {
  const result = await findOne(params, this, '未找到模板');
  return result;
}
module.exports = Template;