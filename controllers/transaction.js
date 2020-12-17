
const db = require('../models');
const { TRANSFER_SUCCESS, FAILED } = require('../commons/respCommons');
const { getGridData } = require('../utils/common');
const { throwFailedMessage, saveAll } = require('../utils/promiseHelper');
const { map, toNumber, get } = require('lodash/fp');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt } = require('../utils/crypto');
const { stringify } = require('querystring');
const axios = require('axios');
const secret = 'zhetroll'

const getBonusTransactionObjs = (fromUser, to, amount) => {
  const transaction = new db.Transaction({
    from: fromUser.phone,
    to: to,
    amount: amount,
  });
  if (fromUser.bonus >= amount) {
    fromUser.bonus -= amount;
  }
  return [transaction, fromUser];
}

const transactionController = {
  // 修改成手機號轉賬
  // trans(req, resp, next) {
  //   const body = req.body;
  //   const amount = toNumber(body.bonus);
  //   const params = {
  //     // 实际是交易所中的uid
  //     coin_name: 'IOTDC',
  //     member_id: body.toPhone,
  //     change_type: '1',
  //     code: 'bellchet58',
  //     addr: body.toPhone,
  //     value: amount,
  //   };
  //   if (amount && amount <= 0) {
  //     resp.failed('金额必须为正数!');
  //   } else if (body.validCode !== req.session.validCode) {
  //     resp.failed('校验码不正确！');
  //   } else if (!bcrypt.compareSync(body.userPassword, req.session.user.pwd)) {
  //     resp.failed('密码不正确！');
  //   } else {
  //     db.User.findById(req.session.user.id).then((fromUser) => {
  //       if (!(fromUser)) {
  //         return throwFailedMessage('找不到用户！');
  //       }
  //       if (amount < fromUser.bonus) {
  //         // 与交易平台进行交互
  //         return axios.post('http://dcexchange.belewtech.com/backend/member/member/update-balance', stringify(params)).then(resp => {
  //           if (get('data')(resp) == 'done') {
  //             return saveAll(getBonusTransactionObjs(fromUser, body.toPhone, amount));
  //           } else {
  //             return throwFailedMessage(get('data')(resp), '传输到交易平台出错');
  //           }
  //         })
  //       } else {
  //         return throwFailedMessage('余额不足！');
  //       }
  //     }).then(() => {
  //       resp.success(TRANSFER_SUCCESS);
  //     }).catch(err => {
  //       next(err)
  //     });
  //   }
  // },

  // bonus可以是负数
  receiveTransfer(req, resp, next) {
    const body = decrypt(req.body.data, secret);
    const plusBonus = toNumber(body.bonus);
    db.User.findOne({ phone: body.userPhone }).then(user => {
      if (user) {
        user.bonus = user.bonus + plusBonus > 0 ? user.bonus + plusBonus : user.bonus;
        return user.save();
      } else {
        return throwFailedMessage('没找到对应的用户');
      }
    }).then(user => {
      resp.success(user);
    }).catch(next);
  },

  // 这次可能没有，暂用不到
  select(req, resp, next) {
    const query = req.query;
    const offset = toNumber(query.start);
    const limit = toNumber(query.limit);
    const queryOption = {
      type: query.type,
      $or: [{ from: query.address }, { to: query.address }],
    };
    db.Transaction.find(queryOption, null, {
      skip: offset,
      limit: limit,
      sort: {
        createdAt: -1,
      }
    }).then(transactions => {
      const countQuery = db.Transaction.where(queryOption).count();
      return Promise.all([transactions, countQuery]);
    }).then(([transactions, count]) => {
      resp.success(getGridData(map(transaction => transaction.toJSON())(transactions), count));
    }).catch(next)
  },

}

module.exports = transactionController;