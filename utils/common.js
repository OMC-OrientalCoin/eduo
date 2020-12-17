/*
 * common.js
 *
 * Distributed under terms of the MIT license.
 */
const {
  toNumber,
  trim,
  pick,
  pickBy,
  includes,
  reverse,
  cloneDeep
} = require('lodash');
const _ = require('lodash/fp');
const logger = require('./log')('error');
const path = require('path');
const { resize, pathConfig, host, baseRank, domain } = require('../config');
const fs = require('fs');
const moment = require('moment');
const { Types } = require('mongoose');
const { supportTokens, notEncryptPwd } = require('../config')
const bcrypt = require('bcryptjs')

const commonUtils = {

  getOffset(params) {
    return toNumber(params.start);
  },

  getThumbnailPath: (originalUrl, size) => {
    const { dir, ext, name } = path.parse(originalUrl);
    return `${dir}/${name}_${size}${ext}`;
  },

  getLogoPath: (picture, size) => {
    const picDir = path.join(pathConfig.static, pathConfig.PIC_DIR);
    const originPath = `${picDir}${picture.path}`;
    const pathParser = path.parse(originPath);
    const prefix = pathParser.dir;
    const postfix = pathParser.ext;
    return toNumber(size) === 1024 ? originPath : path.join(prefix, `${picture.name}_${picture.typesetting}_${picture.scence}_${size}${postfix}`);
  },

  getFilename: (path) => {
    const lastSlashIndex = path.lastIndexOf('/') !== -1 ? path.lastIndexOf('/') : path.lastIndexOf('\\');
    return trim(path.slice(lastSlashIndex + 1));
  },

  getAbsolutePath: (relativePath) => {
    return path.join(pathConfig.static, pathConfig.XLSX_DIR, relativePath);
  },


  // 获取到删除后移动到的绝对路径
  getDeletedPath: (relativePath, timestamp) => {
    const parser = path.parse(relativePath);
    const deletedRelativePath = path.join(parser.dir, `${parser.name}-${timestamp}${parser.ext}`);
    const absolutePath = path.join(pathConfig.static, pathConfig.DELETED_PIC_DIR, deletedRelativePath);
    return absolutePath;
  },

  // 获取删除后移动到的路径，用于存在数据库（相对路径)
  getDeletedPath4Database: (relativePath, timestamp) => {
    const parser = path.parse(relativePath);
    const deletedRelativePath = path.join(parser.dir, `${parser.name}-${timestamp}${parser.ext}`);
    return path.join(pathConfig.DELETED_PIC_DIR, deletedRelativePath).replace(/\\/g, '/');
  },

  // 迭代创建目标文件夹
  mkdirp: (targetDir) => {
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    targetDir.split(sep).reduce((parentDir, childDir) => {
      const curDir = path.resolve(parentDir, childDir);
      if (!fs.existsSync(curDir)) {
        fs.mkdirSync(curDir);
      }
      return curDir;
    }, initDir);
  },

  // 从原路径移动到目标路径
  rename: (originPath, targetPath) => {
    return new Promise((resolve, reject) => {
      return fs.rename(originPath, targetPath, (err) => {
        if (err) {
          logger.error(err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  getGridData(objs, count) {
    const rows = objs;
    const setCount = count !== undefined ? _.set('count', count) : _.set('total', objs.length);
    // const getSort = _.get('0.createdAt')(rows) ? _.sortBy('createdAt'): _.identity;
    return setCount({
      // rows: _.compose(_.reverse, getSort)(rows),
      rows,
    });
  },

  pickByAttrs(params, attrs) {
    return pickBy(params, (value, key) => value !== undefined && includes(attrs, key));
  },

  getFormattedMoment(date) {
    return moment(date).format('YYYY-MM-DD');
  },

  getJSONs: (records) => {
    return _.compose(_.map(record => record.toJSON()), _.compact)(records);
  },

  isAdmin: (user) => {
    return user && user.authGroup.toLowerCase().indexOf('admin') >= 0;
  },

  getImageUrl: (urlPath, req) => {
    const pictureHost = req ? req.headers.host : host;
    return urlPath.indexOf('http') === 0 ? urlPath : `http://${pictureHost}${urlPath[0] && urlPath[0] === '/' ? '' : '/'}${urlPath}`;
  },

  getAbsoluteStaticUrl: (urlPath) => {
    const index = urlPath.indexOf('/public');
    return index >= 0 ? `${path.join(pathConfig.root, urlPath.slice(index))}` : urlPath;
  },

  getIds: (idStr) => {
    const getObjectIds = _.compose(_.map(id => Types.ObjectId(id)), _.compact, _.split(','));
    return getObjectIds(idStr);
  },

  getCommaSplited: (str) => {
    return _.compose(_.compact, _.split(','))(str);
  },

  getObjectIds: (ids) => {
    return _.compose(_.map(Types.ObjectId), _.compact)(ids);
  },

  isYYYYMMDD: (str) => {
    const reg = /^((((19|20)\d{2})-(0?(1|[3-9])|1[012])-(0?[1-9]|[12]\d|30))|(((19|20)\d{2})-(0?[13578]|1[02])-31)|(((19|20)\d{2})-0?2-(0?[1-9]|1\d|2[0-8]))|((((19|20)([13579][26]|[2468][048]|0[48]))|(2000))-0?2-29))$/;
    return reg.test(str);
  },

  getLastTime: (str) => {
    const curDate = new Date(str);
    if (commonUtils.isYYYYMMDD(str)) {
      curDate.setDate(curDate.getDate() + 1);
    }
  return new Date(moment(curDate).format('YYYY-MM-DD HH:mm:ss'));
  },

  getExcelWorkbook: (headerMapping, _data) => {
    const _headers = Object.keys(headerMapping);
    const headers = _headers
      // 为 _headers 添加对应的单元格位置
      .map((v, i) => Object.assign({}, { v: v, position: String.fromCharCode(65 + i) + 1 }))
      // 转换成 worksheet 需要的结构
      .reduce((prev, next) => Object.assign({}, prev, { [next.position]: { v: headerMapping[next.v] } }), {});
    const data = _data.length ? _data
      // 匹配 headers 的位置，生成对应的单元格数据
      .map((v, i) => _headers.map((k, j) => Object.assign({}, { v: k.lastIndexOf('At') >= 0 ? moment(v[k]).format('YYYY-MM-DD HH:mm:ss') : v[k], position: String.fromCharCode(65 + j) + (i + 2) })))
      // 对刚才的结果进行降维处理（二维数组变成一维数组）
      .reduce((prev, next) => prev.concat(next))
      // 转换成 worksheet 需要的结构
      .reduce((prev, next) => Object.assign({}, prev, { [next.position]: { v: next.v, t: _.isNumber(next.v) ? 'n': undefined } }), {}) : [];
    // 合并 headers 和 data
    const output = Object.assign({}, headers, data);
    // 获取所有单元格的位置
    const outputPos = Object.keys(output);
    // 计算出范围
    const ref = outputPos[0] + ':' + outputPos[outputPos.length - 1];
    const wb = {
      SheetNames: ['mySheet'],
      Sheets: {
        'mySheet': Object.assign({}, output, { '!ref': ref })
      }
    };
    return wb;
  },


  getBase64FromJimp: (jimpWrite) => {
    return jimpWrite.getBase64Async(jimpWrite._originalMime);
  },

  getMerchantId: (session) => {
      const sessionUser = session.user;
      return _.get('servingMerchant')(sessionUser) || _.get('merchantId')(sessionUser) || (session.isMerchant && _.get('_id')(sessionUser))
  },

  isTodayRange: (date) => {
    const zeroPoint = 'YYYY-MM-DD 00:00:00';
    return moment(date).isBetween(new Date(moment().format(zeroPoint)), new Date(moment().add(1, 'days').format(zeroPoint)))
  },

  getTodayRange: () => {
    const zeroPoint = 'YYYY-MM-DD 00:00:00';
    return { $gte: new Date(moment().format(zeroPoint)), $lt: new Date(moment().add(1, 'days').format(zeroPoint)) };
  },

  getYesterdayRange: () => {
    const zeroPoint = 'YYYY-MM-DD 00:00:00';
    return { $gte: new Date(moment().subtract(1, 'days').format(zeroPoint)), $lt: new Date(moment().format(zeroPoint))};
  },

  /**
   * 获取一周范围
   */
  getWeekRange: () => {
    const zeroPoint = 'YYYY-MM-DD 00:00:00';
    return { $gte: new Date(moment().subtract(7, 'days').format(zeroPoint)), $lt: new Date(moment().add(1 , 'days').format(zeroPoint))};
  },

  getBeforeYesterdayRange: () => {
    const zeroPoint = 'YYYY-MM-DD 00:00:00';
    return { $lt: new Date(moment().subtract(1, 'days').format(zeroPoint))};

  },

  deleteProperties: (obj, fields) => {
    fields.map(field => {
      delete obj[field];
    })
    return obj;
  },

  getUserPayField: (payment) => {
    const tokens = supportTokens || ['eos', 'eth', 'btc'];
    return tokens.indexOf(payment) >= 0 ? `${payment}Available`: payment;
  },

  getUnit: (payment) => {
    const mapping = {
      'btc': 'token',
      'eos': 'token',
      'eth': 'token',
      'amount': 'legal',
      'bonus': 'bonus',
    }
    supportTokens && supportTokens.map(token => {
      mapping[token] = 'token';
    })
    return mapping[payment];
  },

  getRank: (rank) => {
    return baseRank + (rank || 0);
  },

  getDailyMinerBenefits: ((miners, needLimit = true) => {
    const num = needLimit ? Math.min(miners, 30) : miners
    return (num * _.get('config.minerBenefits.uccFreezeBase')(global) * _.get('config.minerBenefits.releasePercent')(global) /100) || 0
  }),

  /**
   * 缓存获取对应的节点
   * @param {*} id 节点id，支持ObjectId
   * @param {*} node 
   */
  getNodeById: ((id, searchRoot = global.root, strategy) => {
    if (id) {
      const nodeId = typeof id === 'string' ? id : id.toHexString()
      return !strategy ? searchRoot.first(n => n.model.id == nodeId) :
        searchRoot.first({ strategy }, n => n.model.id == nodeId)
    }
  }),

  /**
   * 更新realVipLevel的时候，计算等级以下的矿机数
   */
  updateModelVipLevel: (node, realVipLevel) => {
    if (node) {
      const level = node.model.vipLevel || realVipLevel
      node.model.realVipLevel = realVipLevel
      const newNode = cloneDeep(node)
      const isNotSelfNode = n => n.model.id !== newNode.model.id
      const isLevelHigner = n => isNotSelfNode(n) && (n.model.vipLevel || n.model.realVipLevel) >= level
      // 扣掉level2的最大区
      // ！!大清完了v2.5
      // if (level <= 2) {
      //   const largetBlockNodeId = _.compose(_.get('model.id'), _.maxBy('model.sumMiners'))(newNode.children)
      //   const largestNode = commonUtils.getNodeById(largetBlockNodeId, newNode, 'breadth')
      //   largestNode && largestNode.drop()
      // }
      newNode.all(isLevelHigner).map(n => n.drop())
      const validMiners = _.sumBy('model.miners')(newNode.all(isNotSelfNode))
      node.model.lowerSumMiners = validMiners
      return node
    }
  },

  createCompleteTx: (params, db) => {
    const user = _.get('user')(params)
    const toUser = _.get('toUser')(params)
    const tx = new db.Transaction({
      ...params,
      from: _.get('address')(user),
      to: _.get('address')(toUser),
      toUser: _.get('_id')(toUser),
      completedAt: new Date(),
      status: 'accept'
    })
    return tx
  },

  userFilter: (params) => {
    const searchRegExp = (word) => { return new RegExp(word) }
    const setSearchField = (key, value, valueMap) => (value) ? _.set(key, valueMap ? valueMap(value) : value) : _.identity;
    return _.compose.apply(null, Object.keys(params).map(key => {
      return key === 'id' && params[key].length === 24 ? _.set('_id', Types.ObjectId(params[key])): 
      key === 'vipLevel' ? setSearchField(key, params[key]) :setSearchField(key, params[key], searchRegExp);
    }))({})
  },

  getPwd: (newPwd, salt) => {
    return notEncryptPwd ? newPwd : bcrypt.hashSync(newPwd, salt);
  },

  /**
   * 验证码的key
   */
  getCaptchaKey: (body, user = {}) => {
    const params = (body.areaCode && body.mobile || body.email) ? body : user;
    const key = `_${params.areaCode}${params.mobile || params.email}`; 
    return key;
  },

  getHost: (req) => {
    const host = `http://${req && req.header('host')}`
    if(process.env.NODE_ENV !== 'local') {
      return host && (host.indexOf('localhost') >= 0 || host.indexOf('127.0.0.1') >= 0) ? domain: host;
    }else {
      return host
    }
  }


}

module.exports = commonUtils;
