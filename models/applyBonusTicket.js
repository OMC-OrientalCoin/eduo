const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const BonusTicket = require('./bonusTicket');

const ApplyBonusTicket = new Schema({
  name: String,
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  // ticket: {
  //   id: {
  //     type: Schema.Types.ObjectId,
  //     ref: 'BonusTicket',
  //   },
  //   startTime: Date,
  //   endTime: Date,
  // },
  ticket: BonusTicket,
  usedTime: {
    type: Date,
  },
}, {
  timestamps: true,
})

module.exports = ApplyBonusTicket;