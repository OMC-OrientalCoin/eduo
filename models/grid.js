const mongoose = require('mongoose');
const { findOne } = require('../utils/promiseHelper')
const Schema = mongoose.Schema;

const Grid = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  name: String,
  sort: {
    type: Number,
    default: 0
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category'
  },
  imageUrl: String,
  visible: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
})

Grid.statics.findOneNotNull = async function findOneNotNull(params) {
  return await findOne(params, this, '未找到宫格');
}

module.exports = Grid;