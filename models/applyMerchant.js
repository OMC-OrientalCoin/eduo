const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ApplyMerchant = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  operator: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  contract: String,
  imageUrls: [String],
  completedAt: Date,
  status: {
    type: String,
    enum: ['processed', 'unprocessed'],
    default: 'unprocessed'
  },
}, {
  timestamps: true,
})

module.exports = ApplyMerchant;