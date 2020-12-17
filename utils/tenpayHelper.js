const tenpay = require('tenpay');
const { get }  = require('lodash/fp');
const { wx } = require('../config');

const tenpayHelper = {
  getTenpaySdk: () => {
    if (!global.tenpaySdk) {
      global.tenpaySdk = new tenpay({
        // appid: 'wx6aa58b62bcbffb0e',
        appid: get('appid')(wx) || 'wxbd7c4d2db34be9fc',
        mchid: get('mchid')(wx) || '1534737661',
        // partnerKey: '微信支付安全密钥',
        partnerKey: get('partnerKey')(wx) || 'ebed044c3d99e4b3ddd092fee217c021',
        // pfx: require('fs').readFileSync('证书文件路径'),
        notify_url: '支付回调网址',
        // spbill_create_ip: 'IP地址'
      })
    }
    return global.tenpaySdk;
  },
  // 传回调路径refund_url
  refund: async (order, tx, otherParams = {}) => {
    const params = {
      out_trade_no: get('id')(order),
      out_refund_no: get('id')(tx),
      total_fee: get('allPrice')(order),
      refund_fee: get('amount')(tx),
      ...otherParams
    };
    return global.tenpaySdk.refund(params)
  }
}

module.exports = tenpayHelper;
