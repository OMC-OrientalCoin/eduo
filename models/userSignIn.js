const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSignIn = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
})

module.exports = UserSignIn;