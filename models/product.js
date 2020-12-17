const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { last, meanBy, round, compose } = require('lodash/fp');
const { findOne } = require('../utils/promiseHelper')
const { getImageUrl, getThumbnailPath } = require('../utils/common');
const path = require('path');

const SaleSpecification = new Schema({
  firstSpecification: {
    type: String,
  },
  secondSpecification: {
    type: String,
  },
  thirdSpecification: {
    type: String,
  },
  price: {
    type: Number,
    min: 0.01,
    max: 100000000,
  },
  salesVolumn: {
    type: Number,
    min: 0,
    default: 0,
  },
  amount: {
    type: Number,
    min: 0,
    default: 0,
  }
})
const OrderDetail = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
  },
  num: {
    type: Number,
    min: 0,
  },
  // 销售规格
  saleSpecifaction: {
    type: String
  },
  thumbnail: String,
  // 矿机冷钱包余额
  earnBonus: {
    type: Number,
    min: 0,
  },
  name: String,
  price: {
    type: Number,
    min: 0,
  },
  // 申请退款的个数
  refundingNum: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 已退款的个数
  refundedNum: {
    type: Number,
    default: 0,
    min: 0
  }
})

const Comment = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  // 评价星
  stars: {
    type: Number,
    min: 1,
    max: 5
  },
  content: String,
  saleSpecification: String,
  imageUrls: [String],
  orderDetail: OrderDetail,
  order: {
    type: Schema.Types.ObjectId,
    ref: 'Order'
  }
}, {
    timestamps: true
  })
SaleSpecification.set('toObject', { virtuals: true })

SaleSpecification.set('toJSON', { virtuals: true })

Comment.set('toObject', { virtuals: true })

Comment.set('toJSON', { virtuals: true })

OrderDetail.set('toObject', { virtuals: true })

OrderDetail.set('toJSON', { virtuals: true })

SaleSpecification.virtual('saleSpecifaction').get(function () {
  return (this.firstSpecification || '') + (this.secondSpecification || '') + (this.thirdSpecification || '');
})

mongoose.model('Comment', Comment);
mongoose.model('OrderDetail', OrderDetail);

const Specification = new Schema({
  merchant: {
    type: Schema.Types.ObjectId,
    ref: 'Merchant',
  },
  name: {
    type: String,
    required: true,
  },
  details: [{
    type: String,
  }]
})
const Product = new Schema({
  // 缩略图的URL
  thumbnail: {
    type: String,
  },
  imageUrls: {
    type: [String],
  },
  name: {
    type: String,
    required: true,
    index: true,
  },
  // 所属商户，适用于商户商品的情况
  merchant: {
    type: Schema.Types.ObjectId,
    ref: 'Merchant',
  },
  // 适用于积分商城商品的情况
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category'
  },
  // 商户商品，顺序一二三级分类
  categoryChain: [{
    type: Schema.Types.ObjectId,
    ref: 'Category',
  }],
  // 商品简介
  info: String,
  // 详细介绍，也叫商品描述
  detailInfo: {
    type: String,
  },
  salesVolumn: {
    type: Number,
    default: 0,
    min: 0,
  },
  amount: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 上架、下架状态
  saleStatus: {
    type: String,
    enum: ['onShelves', 'offShelves', 'forceOffShelves'],
    default: 'offShelves',
  },
  // 平台方控制，商品状态
  productStatus: {
    type: String,
    enum: ['permit', 'forbid'],
    default: 'permit',
  },
  sort: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 每次购买限制
  perLimit: {
    type: Number,
  },
  // 用户总计最多购买限制
  countLimit: {
    type: Number,
  },
  // 是否含运费
  containsFreight: {
    type: Boolean,
    default: true,
  },
  // 运费模板ID
  template: {
    type: Schema.Types.ObjectId,
    ref: 'Template',
  },
  // 不含运费时，每X件
  each: {
    type: Number,
    min: 1
  },
  freight: {
    type: Number,
    min: 1,
  },
  specifications: [Specification],
  saleSpecification: [SaleSpecification],
  price: {
    type: Number,
    min: 0.01,
    max: 100000000,
  },
  earnBonus: {
    type: Number,
    default: 0,
  },
  inputBonusField: {
    type: String,
  },
  comments: {
    type: [Comment],
    select: false
  },
  // 是否热门
  isHot: {
    type: Boolean,
    default: false,
  },
  // 热门排序
  hotSort: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
    timestamps: true,
    // selectPopulatedPaths: false 
  });

Product.virtual('userRateNum').get(function () {
  return this.comments && this.comments.length;
})

Product.virtual('satisfaction').get(function () {
  return this.comments && this.comments.filter(c => c.stars >= 4).length * 100 / this.userRateNum;
})

Product.virtual('meanRate').get(function() {
  return this.comments && round(meanBy('stars')(this.comments));
})

Product.virtual('imageUrl').get(function () {
  return getThumbnailPath(getImageUrl((this.imageUrls && this.imageUrls[0]) || ''), 180);
});

Product.virtual('lastCategory', {
  // ref: 'Category',
  // localField: '_id',
  // foreignField: '_id',
  // justOne: true,
}).get(function () {
  return last(this.categoryChain);
});

Product.virtual('supportBonus').get(function () {
  return this.categoryChain && this.categoryChain.length === 1;
});

Product.virtual('unit').get(function () {
  return this.supportBonus ? 'bonus' : 'CNY';
})

Product.virtual('bonusField').get(function () {
  return this.supportBonus ? this.inputBonusField : 'bonus'
})
Product.statics.findOneNotNull = async function findOneNotNull(params) {
  return findOne(params, this, '未找到商品');
}


Product.Comment = Comment;
Product.OrderDetail = OrderDetail;
module.exports = Product;