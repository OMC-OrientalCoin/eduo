const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const News = new Schema({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
  },
  sort: {
    type: Number,
    default: 1,
  },
  // 阅读量
  read: {
    type: Number,
    default: 0,
    min: 0,
  },
  visible: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true,
});

module.exports = News;