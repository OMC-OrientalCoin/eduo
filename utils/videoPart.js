
const qs = require('qs')
const axios = require('axios')
const { videoPartUrl } = require('../config')
const { find, map, pick } = require('lodash/fp')
class VideoPart {
  constructor() {
    this.http = axios.create({
      baseURL: videoPartUrl,
    })
    const onRejected = function (err) {
      return Promise.reject(err)
    }
    this.http.interceptors.request.use(function(req) {
      console.log('to videoPart: ', JSON.stringify(req.data));
      return req;
    }, onRejected);
    this.http.interceptors.response.use(function (resp) {
      try {
        if (resp.data.status !== 1 || resp.data.errmsg) {
          throw ((resp.data.msg || resp.data.errmsg))
        } else {
          return resp.data.data
        }
      } catch (err) {
        return onRejected(err)
      }
    }, onRejected)
  }
  async configSync(config) {
    const result = await this.http.post('/para/action', config)
    return result
  }
  async adminSearch(params, users) {
    const result = await this.http.post('/video/cms/list', params)
    return result
  }
  async adminAudit(params, users) {
    const result = await this.http.post('/video/cms/list/audit', params)
    return result
  }
  getUserInfo(result, users) {
    const findByUserId = (id) => find(['id', id])(users);
    result.records = map(record => {
      const user = pick(['id', 'nickname', 'areaCode', 'mobile', 'email'])(findByUserId(record.userId));
      record.user = user;
      return record;
    })(result.records);
    return result
  }
  async adminComment(params) {
    const result = await this.http.post('/video/cms/list/comment', params)
    return result
  }
  async search(params) {
    const result = await this.http.post('/video/search', params)
    return result
  }
  async pay(params) {
    // 添加银联支付的请求接口
    const result = await this.http.post('/unionpay', params);
    return result;
  }
}

module.exports = VideoPart