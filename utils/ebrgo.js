
const qs = require('qs')
const axios = require('axios')
const { ebrgoUrl, erc20ContractAddress } = require('../config')
const Web3Helper = require('./web3')
const { omit } = require('lodash/fp')
class Ebrgo {
  constructor() {
    this.http = axios.create({
      tranformRequest: [qs.stringify],
      baseURL: ebrgoUrl,
    })
    const onRejected = function (err) {
      return Promise.reject(err)
    }
    this.http.interceptors.response.use(function (resp) {
      try {
        if (resp.data.code !== 10000) {
          throw ((resp.data.msg || resp.data.errmsg))
        } else {
          return omit(['code', 'msg'])(resp.data)
        }
      } catch (err) {
        return onRejected(err)
      }
    }, onRejected)
  }
  /**
   * 获取eth地址。并监听出账入账变动。
   */
  async listenerAddAccount() {
    if(!ebrgoUrl) {
      return { address: '' }
    }
    const result = await this.http.post('/listener/eth/addAccount', {})
    return result
  }
  /**
   * erc20转出。https://github.com/ubltroll/ebrgo-wiki/wiki/ebrgo_api%E6%96%87%E6%A1%A3#erc20%E8%BD%AC%E5%87%BA
   * @param {*} params  { hash }
   */
  async erc20transfer(tx) {
    const web3 = new Web3Helper()
    const params = {
      // fromAddress 要自己取？
      fromAddress: web3.getAddressByPrivateKey(global.masterPk),
      toAddress: tx.to,
      orderId: tx.id,
      note: tx.type,
      value: tx.amount,
      contract: erc20ContractAddress
    }
    const result = await this.http.post('/erc20/transfer', params)
    return result
  }

  /**
   * 设置主钱包
   * @param {*} pk 
   */
  async setMasterPk(pk) {
    const params = {
      privateKey: pk && pk.startsWith('0x') ? pk : `0x${px}`
    }
    const result = await this.http.post('/eth/setMasterAccount', params);
    return result;
  }

}

module.exports = Ebrgo