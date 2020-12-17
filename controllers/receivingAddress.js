const db = require('../models');
const { compose, set, get, assignIn, pick, identity } = require('lodash/fp');
const { pickByAttrs, commonPick, getJSONs, getGridData } = require('../utils/common');
const { throwFailedMessage, saveAll, throwSuccessPromise } = require('../utils/promiseHelper');
const { SUCCESS_DELETE, SUCCESS_UPDATE, SUCCESS_CREATE } = require('../commons/respCommons');
const { deleteParentRef } = require('../utils/operHelper');

const receivingAddressController = {

  select(req, resp, next) {
    db.ReceivingAddress.find({
      userId: req.session.user._id,
    }).then(addresses => {
      resp.success(getGridData(getJSONs(addresses)));
    }).catch(next);
  },

  destroy(req, resp, next) {
    const addressId = req.params.addressId;
    if (!addressId) {
      resp.failed('缺少收货地址id');
    } else {
      db.ReceivingAddress.findById(addressId).then(address => {
        // 判断是本人才可操
        if(!address) {
          return throwFailedMessage('没找到收货地址！');
        }else if (address.userId == get('session.user._id')(req)) {
          return Promise.all([deleteParentRef(db.User, { _id: address.userId }, { receivingAddress: address._id }), address.remove()]);
        } else {
          return throwFailedMessage('当前地址不是用户本人的，无权限');
        }
      }).then(([user, address]) => {
        resp.success(SUCCESS_DELETE);
      }).catch(next);

    }
  },

  setDefault(req, resp, next) {
    const addressId = req.body.addressId;
    if (!addressId) {
      resp.failed('缺少收货地址id');
    } else {
      db.ReceivingAddress.find({
        userId: req.session.user._id,
      }).then(addresses => {
        const originalOne = addresses.find(address => address.isDefault);
        if (originalOne && originalOne.id == addressId) {
          return throwSuccessPromise();
        } else {
          const defaultOne = addresses.find(address => address.id == addressId);
          if (originalOne) {
            originalOne.isDefault = false;
          }
          if (defaultOne) {
            defaultOne.isDefault = true;
          }
          return saveAll([originalOne, defaultOne]);
        }
      }).then(() => {
        resp.success('设置默认地址成功！');
      }).catch(next);
    }
  },

  update(req, resp, next) {
    const body = req.body;
    const addressId = req.params.addressId;
    if (!addressId) {
      resp.failed('缺少收货地址id');
    } else {
      db.ReceivingAddress.findById(addressId).then(address => {
        // 改成fp的模式
        if (address.userId == req.session.user.id) {
          const params = pickByAttrs(body, ['name', 'phone', 'detailAddress', 'zipCode', 'address']);
          Object.assign(address, params);
          return address.save();
        }
        return throwFailedMessage('编辑的收货地址不是当前用户的！');
      }).then(() => {
        resp.success(SUCCESS_UPDATE);
      }).catch(next);
    }
  },

  create(req, resp, next) {
    const body = req.body;
    db.ReceivingAddress.countDocuments({ isDefault: true, userId: req.session.user._id }).then(defaultCount => {
      const setDefault = defaultCount > 0 ? identity : set('isDefault', true);
      const getProps = compose(setDefault, set('userId', req.session.user._id), pick(['name', 'phone', 'detailAddress', 'zipCode', 'address']));
      const newAddress = new db.ReceivingAddress(getProps(body));
      return Promise.all([db.User.findById(req.session.user.id), newAddress.save()]);
    }).then(([user, address]) => {
      user.receivingAddress.push(address._id);
      return Promise.all([user.save(), address]);
    }).then(([user, address]) => {
      resp.success(address);
    }).catch(next);
  },

};

module.exports = receivingAddressController;