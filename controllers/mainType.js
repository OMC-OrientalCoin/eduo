const db = require('../models');
const { getGridData, pickByAttrs } = require('../utils/common');
const { notSuperAdmin, notRole } = require('../utils/accessAuth')
const { SUCCESS_CREATE, SUCCESS_UPDATE } = require('../commons/respCommons')
const mainTypeController = {
  select: async (req, resp) => {
    const categories = await db.MainType.find()
    resp.success(getGridData(categories))
  },

  //商户管理员也可以
  create: async (req, resp) => {
    const body = req.body;
    if (notSuperAdmin(req.session.user, 'platform') && notRole(req.session.user, 'platform', 'merchantAdmin')) {
      throw ('当前用户没有创建权限');
    } else {
      const mainType = db.MainType({
        name: body.name
      });
      const newMainType = await mainType.save();
      resp.success(SUCCESS_CREATE);
    }
  },

  update: async (req, resp) => {
    const mainType = await db.MainType.findById(req.params.mainTypeId);
    if (!mainType) {
      throw ('没找到商户分类！');
    } else {
      const params = pickByAttrs(req.body, ['name']);
      Object.assign(mainType, params);
      await mainType.save();
      resp.success(SUCCESS_UPDATE);
    }
  },
}

module.exports = mainTypeController;