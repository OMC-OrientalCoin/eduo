const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CarouselModel = new Schema({
  name: {
    type: String,
  },
  sort: {
    type: Number,
    default: 1,
    min: 0,
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
  },
  imageUrl: {
    type: String,
    required: true,
  },
  //feature cyt
  instanceId: {
    type: Schema.Types.ObjectId
  },
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
  },
  isProduct: {
    type: Boolean,
    default: false
  },
  visible: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true,
})

module.exports = CarouselModel;