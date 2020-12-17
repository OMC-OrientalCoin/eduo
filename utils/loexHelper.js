const { pick, compose, assignIn, set, get } = require('lodash/fp')
const qs = require('qs')
const Axios = require('axios')
const crypto = require('crypto')
const moment = require('moment')
class LOEXHelper {
  constructor(apiKey = 'dd8e6cfac7c411b1c4b78dbd49cf7fa1', apiSecret = '6f8f6943cb63c9e35300c015568d05a4') {
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.http = Axios.create({
      transformRequest: [qs.stringify],
      baseURL: 'https://open.loex.io',
    })
  }
  /**
   * 获取到用于发送请求的参数
   * @param {*} data 
   */
  getRequestParams(data = {}) {
    const params = assignIn({
      api_key: this.apiKey,
      time: Math.floor(new Date().getTime() / 1000).toString()
    })(data)
    const signed = this.sign(params, this.apiSecret)
    return compose(pick(['api_key', 'sign', 'time']), set('sign', params.sign || signed))(params)
  }
  /**
   * 加密签名
   * @param {*} data 
   * @param {*} secret 
   */
  sign(data, secret) {
    let signStr = ''
    let keys = Object.keys(data).sort()
    for (let key of keys) {
      signStr += key
      signStr += data[key].toString(16)
    }
    signStr += secret
    return crypto.createHash('md5').update(signStr).digest('hex')
  }
  /**
   * 处理结果
   * @param {*} respData 
   */
  handleResp(respData) {
    if (respData.code === '0') {
      return respData.data
    } else {
      throw new Error(respData.msg)
    }
  }
  /**
   * 获取市场行情
   */
  async getMarket() {
    const stringifiedParams = qs.stringify(this.getRequestParams({
      //time: 0
    }), { delimiter: '\&' })
    const { data } = await this.http.get(`/open/api/market?${stringifiedParams}`)
    return this.handleResp(data)
  }

  /**
   * 获取指定交易对最新价格
   * @param {*} pair 交易对。默认是ucusdt
   */
  async getMarketByPair(pair = 'ucusdt') {
    const markets = await this.getMarket()
    return get(pair)(markets)
  }

}

(async () => {
  const helper = new LOEXHelper()
  const data = await helper.getMarketByPair()
console.log(data)
  // const result = helper.sign({'api_key': helper.apiKey, 'time': 0 }, helper.apiSecret)
})()

module.exports = LOEXHelper
