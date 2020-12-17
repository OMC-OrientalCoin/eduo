const db = require('../models');
const { getCommaSplited, pickByAttrs, getMerchantId } = require('../utils/common')
const { get } = require('lodash/fp')
const { accessHanlder } = require('../utils/accessAuth')
const { SUCCESS_DELETE } = require('../commons/respCommons')

const specificationController = {

  create: async (req, resp) => {
    const body = req.body;
    const sessionUser = req.session.user;
    accessHanlder(sessionUser, async () => {
      const newSpec = new db.Specification({
        name: body.name,
        details: getCommaSplited(body.details),
        merchant: getMerchantId(req.session)
      });
      const spec = await newSpec.save()
      resp.success(spec);
    })
  },

  update: async (req, resp) => {
    accessHandler(req.session, async () => {
      const spec = await db.Specification.findById(req.params.specId);
      if (!spec) {
        throw '没找到相应规格!'
      } else {
        const params = pickByAttrs(req.body, ['name', 'details']);
        if (params.details) {
          params.details = getCommaSplited(params.details);
        }
        Object.assign(spec, params);
        const updatedSpec = await spec.save();
        resp.success(updatedSpec)
      }
    })
  },

  destroy: async (req, resp) => {
    accessHandler(req.session, async () => {
      const spec = await db.Specification.findById(req.params.specId);
      const merchantId = getMerchantId(req.session);
      if (!spec) {
        throw '没找到规格！';
      } else if (merchantId != spec.merchant) {
        throw '修改的不是当前商户的规格!'
      } else {
        await spec.remove()
        resp.success(SUCCESS_DELETE);
      }
    })
  }

}

module.exports = specificationController