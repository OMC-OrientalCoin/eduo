const db = require('../models');
const { notNull, notSuperAdmin } = require('../utils/accessAuth');
const { getMerchantId, getGridData } = require('../utils/common')
const { findOne } = require('../utils/promiseHelper')
const { Types } = require('mongoose')

const adminController = {
  //检查是否平台超级管理员
  addPlatformAdmin: async (req, resp) => {
    const body = req.body;
    if (notSuperAdmin(req.session.user, 'platform')) {
      throw '没有权限'
    }
    const user = await db.User.findById(body.userId);
    if (!user) {
      throw '没找到用户'
    } else if (notNull(user, 'platform')) {
      throw '目标用户已经是平台管理员了'
    } else {
      user.authGroup.platform = body.authGroup;
      await user.save();
      resp.success('添加管理员成功！');
    }
  },
  //检查是否平台超级管理员
  updatePlatformAdmin: async (req, resp) => {
    const body = req.body;
    if (notSuperAdmin(req.session.user, 'platform')) {
      throw '没有权限'
    }
    const user = await db.User.findById(req.params.userId);
    if (!notNull(user, 'platform')) {
      throw '目标用户还不是平台管理，请先添加';
    } else {
      user.authGroup.platform = body.authGroup;
      await user.save();
      resp.success(`成功${body.authGroup !== 'null' ? '编辑' : '删除'}管理员`);
    }
  },

  selectMerchantAdminList: async (req, resp) => {
    const merchantId = getMerchantId(req.session);
    const admins = await db.User.find({
      $or: [{ merchantId: Types.ObjectId(merchantId) }, { servingMerchant: Types.ObjectId(merchantId) }],
      'authGroup.merchant': { $in: ['merchantAdmin', 'admin', 'superAdmin'] }
    }, 'id nickname mobile authGroup');
    resp.success(getGridData(admins));
  },

  // 检查是否该商户
  addMerchantAdmin: async (req, resp) => {
    const body = req.body;
    if (notSuperAdmin(req.session.user, 'merchant')) {
      throw '没有权限'
    }
    const user = await findOne({ mobile: body.mobile}, db.User, '没找到用户');
    if(user.applyMerchant && user.merchantId) {
      throw '目标用户已申请商户，不能成为其他商户管理员';
    }else if (notNull(user, 'merchant')) {
      throw '目标用户已经是商户管理员了'
    } else {
      user.authGroup.merchant = body.authGroup;
      user.servingMerchant = req.session.user._id;
      await user.save();
      resp.success('添加管理员成功！');
    }
  },

  updateMerchantAdmin: async (req, resp) => {
    if (notSuperAdmin(req.session.user, 'merchant')) {
      throw '没有权限';
    }
    const body = req.body;
    const user = await db.User.findById(req.params.userId);
    if(user.applyMerchant && user.merchantId && body.authGroup !== 'null') {
      throw '目标用户已申请商户，不能成为其他商户管理员';
    }else if (!notNull(user, 'merchant')) {
      throw '目标用户还不是商家管理，请先添加';
    } else {
      user.authGroup.merchant = body.authGroup;
      await user.save();
      resp.success(`成功${body.authGroup !== 'null' ? '编辑' : '删除'}管理员`);
    }
  },
}

module.exports = adminController;