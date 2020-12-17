const mongoose = require('mongoose');
const Schema = mongoose.Schema;

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
}, {
  timestamps: true,
})

module.exports = Specification;