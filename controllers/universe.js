const { SUCCESS_DELETE } = require('../commons/respCommons')
const { startCase, toLower, assignIn } = require('lodash/fp')
const querystring = require('querystring')
const { Types } = require('mongoose')
const db = require('../models')
const axios = require('axios')

const universeDestroy = async (model, instanceId) => {
  const schema = db[startCase(model).replace(/\s/g, '')];
  const instance = await schema.findById.call(schema, instanceId);
  if (model === 'category') {
    const others = await db.Category.countDocuments({ belongingCategory: instance._id })
    if (others) {
      throw '存在下级的分类';
    }
    const belongingProducts = await db.Product.countDocuments({ category: instance._id });
    if (belongingProducts) {
      throw '该分类下存在商品！';
    }
  }
  return instance && await instance.remove()
}

const universe = {

  // 陆续要支持category，mainType，product,news
  destroy: async (req, resp) => {
    const params = req.params;
    const model = params.model;
    const instanceId = params.instanceId;
    const instance = await universeDestroy(model, instanceId)
    instance.belongingCategory
    resp.success(SUCCESS_DELETE)
  },

  proxy: async (req, resp) => {
    let { params, url, method, config } = req.query;
    if(!method) {
      throw '缺少方法';
    }
    if(!url) {
      throw '缺少请求地址';
    }
    params = params ? JSON.parse(params) : {}
    config = config ? JSON.parse(config): {}
    const axiosMethod = toLower(method);
    let axiosResp;
    if(axiosMethod === 'get') {
      axiosResp = await axios[axiosMethod](url, assignIn({ params })(config));
    }else {
      axiosResp = await axios[axiosMethod](url, querystring.stringify(params), config);
    }
    resp.success(axiosResp.data)
  },

  tracking: async(req, resp, next) => {
    let { params, url, method } = req.query;
    if(!method) {
      throw '缺少方法';
    }
    if(!url) {
      throw '缺少请求地址';
    }
    params = params ? JSON.parse(params) : {}
    const axiosMethod = toLower(method);
    const { data } = await axios[axiosMethod](url, assignIn({ params })({
      headers: {
        // TODO 上线更换APPCode
        Authorization: 'APPCODE a6c8f60589e74158817223845dd6b030'
      }
    }));
    resp.success(data)
  },


}

module.exports = universe