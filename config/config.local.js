const path = require('path');
module.exports = {
  db: {
    uri: 'mongodb://admin:T0giCtH4UZ8THwzm@118.31.17.53:27017/edou_taotao_dev',
    option: {
    },
  },
  pathConfig: {
    XLSX_DIR: '/xlxs/',
    root: path.resolve(__dirname, '..'),
    static: path.resolve(__dirname, '../public'),
  },
  supportMultiMerchant: true,
  supportTokens: ['edou'],
  supportAmount: true,
  supportBonus: true,
  supportBonusTicket: false,
  system: {
    name: '平台',
    mobile: '18545678910',
    pwd: 'ABCabc123',
    paypwd: '123456',
  },
  merchant: {
    name: 'E豆',
    code: 'E豆的统一信用码',
    businessLicense: 'E豆的商业执照的',
    address: 'E豆的商户地址',
  },
  commanderAddress: '0x67616B91163A529cA6382343692ec9E62e09731F',
  retryTimes: 3,
  usdtContractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  erc20ContractAddress: '0xFFcFEa0502913b122B0e75412551279542EC58EE',
  uccDecimals: 18,
  feToolsProxyUrl: 'http://47.75.55.116:12345',
  videoPartUrl: 'http://47.92.247.43:9005',
  ebrgoUrl: '',
  baseRank: 12359,
  host: '192.168.50.86:3000',
  accessWhiteIpList: ['::ffff:192.168.50.136', '::ffff:192.168.50.45', '::ffff:122.14.211.83', '::ffff:47.92.247.43', '127.0.0.1', '::1'],
}
