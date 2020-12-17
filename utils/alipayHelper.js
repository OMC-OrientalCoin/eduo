const AlipaySdk = require('alipay-sdk').default;
const { assignIn } = require('lodash/fp');
const appId = '2018101261639672';
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { get } = require('lodash/fp')

const getAlipaySdk = () => {
  if (!global.aliPaySdk) {
    global.aliPaySdk = new AlipaySdk({
      appId: appId,
      privateKey: fs.readFileSync(path.resolve('./config/', 'private-key.pem'), 'ascii'),
      alipayPublicKey: fs.readFileSync(path.resolve('./config/', 'public-key.pem'), 'ascii'),
      // keyType: 'PKCS8'
    });
  }
  return global.aliPaySdk;

}
const getCommonParams = (addition) => {
  const commonParams = {
    appId: appId,
    method: 'alipay.trade.app.pay',
    charset: 'utf-8',
    signType: 'RSA2',
    timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
    version: '1.0',
  }
  return assignIn(commonParams)(addition || {})
}
const formatUrl = (url, params) => {
  let requestUrl = url;
  // 需要放在 url 中的参数列表
  const urlArgs = [
    'app_id', 'method', 'format', 'charset',
    'sign_type', 'sign', 'timestamp', 'version',
    'notify_url', 'return_url', 'auth_token', 'app_auth_token',
  ];

  for (const key in params) {
    // if (urlArgs.indexOf(key) > -1) {
    const val = encodeURIComponent(params[key]);
    requestUrl = `${requestUrl}${requestUrl ? '&' : ''}${key}=${val}`;
    // 删除 postData 中对应的数据
    delete params[key];
    // }
  }

  return { execParams: params, url: requestUrl };
}

const aliPayHelper = {
  getAlipaySdk,
  getCommonParams,
  formatUrl,
  // 退款
  refund: async (order, tx, otherParams = {}) => {
    const orderDetail = get('orderDetail')(tx);
    const method = 'alipay.trade.refund';
    const commonParams = getCommonParams({
      method,
      ...otherParams,
    })
    const bizContent = {
      outTradeNo: get('id')(order),
      refundAmount: get('amount')(tx),
      outRequestNo: get('id')(tx),
      operatorId: tx.operator.toHexString(),
      goodsDetail: [{
        goodsId: get('productId')(orderDetail),
        goodsName: get('name')(orderDetail),
        quantity: get('num')(orderDetail),
        price: get('price')(orderDetail),
        body: get('saleSpecifaction')(orderDetail),
      }]
    }
    const resultParams = set('bizContent', bizContent)(commonParams);
    return alipaySdk.exec(method, resultParams, {
      validateSign: true
    })
  }
}

module.exports = aliPayHelper;