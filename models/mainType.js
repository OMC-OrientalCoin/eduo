const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MainType = new Schema({
  name: {
    type: String,
    required: true,
  },
  visible: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true
})

module.exports = MainType