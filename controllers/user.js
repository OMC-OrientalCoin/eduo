/*
 * user.js
 *
 * Distributed under terms of the MIT license.
 */
const db = require('../models');
const { SUCCESS, SUCCESS_DELETE, FAILED_UPDATE_USER, FAILED_VALID_CODE } = require('../commons/respCommons');
const logger = require('../utils/log')('error');
const { deleteAll, saveAll, throwFailedMessage, destoryFile, resizePicture, getBase64, writeFile, findOne } = require('../utils/promiseHelper');
const { updateModelVipLevel, getNodeById, getRank, getYesterdayRange, getTodayRange, isAdmin, getOffset, getGridData, pickByAttrs, getImageUrl, getIds, getLastTime, getAbsoluteStaticUrl, getJSONs, getBase64FromJimp, isTodayRange, getExcelWorkbook, getCaptchaKey, getHost, getCommaSplited } = require('../utils/common');
const { mapValues, sum, toNumber, trim, get, flatten, assignIn, pick, range, join, split, compact, identity, slice, map, set, compose, filter, prop, uniqBy, find, invert, mapKeys, sumBy } = require('lodash/fp');
const _ = require('lodash');
const { host, pathConfig } = require('../config');
const bcrypt = require('bcryptjs');
const { stringify } = require('querystring');
const https = require('https');
const { validate } = require('coupon-code');
const XLSX = require('js-xlsx');
const axios = require('axios');
const path = require('path');
const moment = require('moment');
const { notSuperAdmin } = require('../utils/accessAuth')
const { supportTokens } = require('../config')
const { SUCCESS_UPDATE } = require('../commons/respCommons')
const ZHTSMSHelper = require('../utils/zhtsms')
const { creatTreeModel } = require('../utils/treeHelper')
const { getDailyMinerPoolBenefits, getVipBenefits, getRealVipLevel, getVipLevel } = require('../utils/userBenefits')
const LOEXHelper = require('../utils/loexHelper')
const { Types } = require('mongoose')
const fs = require('fs')
const Ebrgo = require('../utils/ebrgo')
const MailHelper = require('../utils/mail');

// const columnMapping = {
//   name: '姓名',
//   phone: '购买人手机',
//   bonus: '积分',
//   IDCard: '身份证号码',
//   isVip: '是否会员',
// }
// const addressColumnMapping = {
//   name: '收货人姓名',
//   phone: '收货人手机',
//   detailAddress: '收货人详细地址',
// }
const headerMapping = {
  'id': 'ID',
  'nickname': '用户名',
  'mobile': '手机号码',
  'miners': '矿机数量',
  status: '会员状态',
  'vipLevel': '级别',
  inputInvitorCode: '上级邀请码',
  invitorCode: '本人邀请码',
  underUserNums: '伞下人数',
  usdtAmount: 'USDT',
  bonus: '消费积分',
  uccFreeze: '冷钱包',
  uccAvailable: '热钱包',
  uccVipFreeze: '冻结钱包',
  uccCoinAvailable: 'UC余额',
  createdAt: '注册时间'
}
const TOKENKEYS = supportTokens ? compose(flatten, map(t => ([`${t}Available`, `${t}Freeze`])))(supportTokens) : ['btcAvailable', 'ethAvailable', 'eosAvailable', 'ethFreeze', 'eosFreeze', 'btcFreeze'];
const paymentFields = supportTokens ? map(t => (`${t}Available`))(supportTokens) : ['ethAvailable', 'eosAvailable', 'btcAvailable'];
const freezeFields = supportTokens ? supportTokens.map(t => (`${t}Freeze`)) : ['ethFreeze', 'eosFreeze', 'btcFreeze']
const updateFields = [...paymentFields, 'amount', 'bonus', ...freezeFields]
const pickSessionUserFields = pick(['id', '_id', 'authGroup', 'mobile', 'merchantId', 'servingMerchant', 'email', 'walletStatus'])
// const chineseColumnMapping = invert(columnMapping);
// const chineseAddressColumnMapping = invert(addressColumnMapping);

/**
 * 扣除掉
 */
const parentsMinersSumMinus = (node, sumMiners) => {
  while(node.parent) {
    node = node.parent
    node.model.sumMiners -= sumMiners
  }
}

const addNewCreatedUserNode = (invitor, user) => {
  let invitorNode = invitor ? global.root.first(n => n.model.id == invitor && invitor.id) : global.root
  const thisUserNode = global.tree.parse({ id: user.id, children: [], miners: user.miners, sumMiners: user.miners })
  invitorNode && invitorNode.addChild(thisUserNode)
  return thisUserNode
}

const getWalletTransactionObjs = (user, params, { operatorId, isFullNum = false } = {}) => {
  params = mapValues(toNumber)(params)
  const records = Object.keys(params).map(key => {
    const isLessThanZero = !isFullNum ? user[key] + (params[key]) < 0 : params[key] < 0;
    const amount = !isFullNum ? params[key] : params[key] - user[key];
    if (isLessThanZero) {
      throw `${key}的值是负数！`
    } else if(!amount) {
      return null;
    } else {
      user[key] += amount
      const record = new db.Transaction({
        unit: TOKENKEYS.indexOf(key) >= 0 ? 'token' : (key === 'bonus' ? key : (key === 'amount' ? 'legal' : key === 'usdtAmount' ? 'token': null)),
        status: 'accept',
        // payment: paymentFields.indexOf(key) >= 0 ? key.slice(0, key.indexOf('Available')) :
        //   (key.indexOf('Freeze') > 0 ? key.slice(0, key.indexOf('Freeze')) : key),
        payment: key,
        amount: Math.abs(amount),
        user: user._id,
        completedAt: new Date(),
        type: amount < 0 ? 'adminOut' : 'adminIn',
        walletField: key,
        operator: operatorId,
        afterAmount: user[key],
        isMinus: amount < 0,
      })
      return record;
    }
  })
  return [user, ...records];
}

// 修改邀请赠送规则
const getInviteTransactionObjs = (user, invitor) => {
  user.invitor = get('_id')(invitor);
  user.inputInvitorCode = get('invitorCode')(invitor);
  user.invitorCode = user.id.slice(-6);
  user.nickname = `${user.registBy === 'mobile' ? '手机': '邮箱'}用户_${user.invitorCode}`
  const amount = get('config.invitorBonus')(global);
  if(amount) {
    if (invitor) {
      invitor.bonus += amount;
      invitor.invitorBonus += amount;
      invitor.childUsers.push(user._id);
    }
    const record = new db.Transaction({
      unit: 'bonus',
      status: 'accept',
      payment: 'bonus',
      user: get('_id')(invitor),
      amount,
      invitor: get('_id')(invitor),
      invitee: user._id,
      completedAt: new Date(),
      type: 'registerBonus',
      afterAmount: invitor && invitor.bonus,
    });
    return [user, invitor, record];
  }else {
    return [user];
  }
  // return [user, invitor];
}

const getSignInTransactionObjs = (user) => {
  const amount = get('config.signInBonus')(global);
  user.bonus += amount;
  const record = new db.Transaction({
    unit: 'bonus',
    status: 'accept',
    payment: 'bonus',
    user: user._id,
    amount,
    completedAt: new Date(),
    type: 'signInBonus',
  });
  return [user, record];
}

const getAvatarImage = (urlPath, req) => {
  const pictureHost = req ? req.headers.host : host;
  return urlPath && urlPath.indexOf('http') === 0 ? urlPath : `http://${pictureHost}/public/pic/${urlPath}.png`;
}

const getNewHashParams = (params, fields) => {
  const salt = bcrypt.genSaltSync(10);
  fields.map(field => {
    if (params[field]) {
      params[field] = bcrypt.hashSync(params[field], salt);
    }
  })
  return params;
}

// 处理lodash/fp set方法不能把xxx.xxx解析为嵌套对象的问题
const setAuthGroupPlatform = _.curryRight((query, value) => {
  query['authGroup.platform'] = value || 'null';
  return query;
})

const getQueryOption = (params, searchWordFields) => {
  const setAdmin = (typeof params.isAdmin === 'string' && params.isAdmin === 'true') ? setAuthGroupPlatform({ $in: ['superAdmin', 'merchantAdmin', 'admin', 'viewer'] }) : setAuthGroupPlatform('null');
  const setTime = params.startTime && params.endTime ? set(params.kycStatus ? 'applyKycAt' : 'createdAt', { $gte: new Date(params.startTime), $lt: getLastTime(params.endTime) }) : identity;
  const searchWordReg = new RegExp(params.searchWord);
  // 自定义searchWord域
  const setSearchWord = params.searchWord ? (params.searchWord.length === 24 ?  set('_id', Types.ObjectId(params.searchWord)): 
  set('$or', searchWordFields instanceof Array ? searchWordFields.map((field) => {
    const param = Object.create(null);
    param[field] = new RegExp(params.searchWord);
    return param;
  }) : [{ nickname: searchWordReg }, { mobile: searchWordReg }, { IDCard: searchWordReg }, { name: searchWordReg }]))
    : identity;
  const setStatus = params.status ? set('status', params.status) : identity;
  const setKycStatus = params.kycStatus ? set('kycStatus', params.kycStatus) : identity;
  const setKycProcessTime = params.handleKycStartTime && params.handleKycEndTime ? set('handleKycAt', { $gte: new Date(params.handleKycStartTime), $lt: getLastTime(params.handleKycEndTime)}): identity;
  const setRegistBy = params.registBy ? set('registBy', params.registBy) : identity;
  return compose(setRegistBy, setKycProcessTime, setKycStatus, setStatus, setAdmin, setTime, setSearchWord)({});
}

// 上线前必须替换！
const apiInfo = {
  'api_key': 'CBVu1O3l0427xNCHvVnKRFERCWucfM9c',
  'api_secret': 'ltNhqbxXd4KqmoBxsRjjjv6zcMdix9zz',
}

// const getOcrResultBase64 = (url) => {
//   const filePath = getAbsoluteStaticUrl(url);
//   let path4Resize;
//   return resizePicture(filePath, 800).then((resizedPath) => {
//     path4Resize = resizedPath;
//     return getBase64(resizedPath);
//   }).then(base64Src => {
//     destoryFile(filePath);
//     destoryFile(path4Resize);
//     return axios.post('https://api-cn.faceplusplus.com/cardpp/v1/ocridcard', stringify(assignIn({
//       image_base64: base64Src,
//     })(apiInfo)), {
//         headers: {
//           'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
//         }
//       });
//   }).catch(err => {
//     console.log(err.response)
//   })
// }

const memoizeGetNodeById = _.memoize(getNodeById)
const userController = {

  // 平台编辑，platform's superAdmin only
  updateByAdmin: async (req, resp) => {
    const userId = req.params.userId;
    const user = await db.User.findById(userId);
    let params = pickByAttrs(req.body, ['nickname', 'pwd', 'status', 'vipLevel', 'walletStatus', 'kycStatus']);
    params = getNewHashParams(params, ['pwd']);
    Object.assign(user, params);
    const currentNode = getNodeById(user.id)
    if(currentNode && (params.mobile || params.vipLevel)) {
      currentNode.model.mobile = params.mobile || currentNode.model.mobile
      currentNode.model.vipLevel = params.vipLevel || currentNode.model.vipLevel
    }
    await user.save();
    resp.success(user);
  },

  updateInfo: async (req, resp, next) => {
    const params = pickByAttrs(req.body, ['avatar', 'nickname', 'email', 'mobile']);
    let user = await findOne(req.session.user.id, db.User, '没找到用户');
    if(user.registBy === 'mobile') {
      delete params.mobile;
    }else {
      delete params.email;
    }
    // if(params.avatar) {
    //   const originalPath = getAbsoluteStaticUrl(params.avatar);
    //   const newAvatar = await resizePicture(originalPath);
    //   params.avatar = newAvatar ? `${getHost(req)}/public/${newAvatar}`: params.path;
    //   try {
    //     await destoryFile(originalPath);
    //   }catch(err) {
    //     console.error(`删除头像${originalPath}出问题${err}`)
    //   }
    // }
    Object.assign(user, params);
    user = await user.save();
    resp.success(user);
  },

  updateWallet: async (req, resp, next) => {
    if (notSuperAdmin(req.session.user, 'platform')) {
      throw '没有权限';
    } else {
      let user = await db.User.findById(req.params.userId);
      const params = pickByAttrs(req.body, updateFields);
      const transObjs = getWalletTransactionObjs(user, params, { operatorId: req.session.user._id, isFullNum: true});
      await saveAll(compact(transObjs));
      resp.success(SUCCESS_UPDATE);
    }
  },


  /**
   * @param {*} req 
   * @param {*} resp 
   * @param {*} next 
   */
  destroy: async (req, resp, next) => {
    const getUserIds = compose(join(','), map('mobile'));
    const users = await db.User.find({
      _id: { $in: getIds(req.body.userIds) }
    })
    const user = users[0]
    const uperAuthUsers = filter(['authGroup', 'superAdmin'])(users);
    if (req.session.user.authGroup === 'admin' && uperAuthUsers.length) {
      await throwFailedMessage(`包括了高权限用户${getUserIds(uperAuthUsers)}，删除失败！`)
    }
    if (user && user.invitor) {
      // 删除用户时，也要在数据库中改父的childUsers中的内容
      const parent = await db.User.updateOne({ _id: Types.ObjectId(user.invitor) }, { $pull: { childUsers: user._id } })
      const userNode = getNodeById(user.id)
      // 删除节点时，也要修改父节点中的model.children的内容
      const parentNode = userNode && userNode.parent
      userNode && userNode.drop()
      if (parentNode) {
        parentNode.model.children = filter(n => n.id !== user.id)(parentNode.model.children)
        if (parentNode.model.sumMiners) {
          parentNode.model.sumMiners -= userNode.model.sumMiners
          parentsMinersSumMinus(parentNode, userNode.model.sumMiners)
        }
        if (parentNode.model.underSumMiners) {
          parentNode.model.underSumMiners -= userNode.model.sumMiners
        }
        // 删除用户对应的节点
        updateModelVipLevel(parentNode, getVipLevel(parentNode))
      }
    }
    await deleteAll(users);
    resp.success(SUCCESS_DELETE)
  },

  select(req, resp, next) {
    db.User.findById(get('session.user._id')(req) || req.query.userId).then((user) => {
      if (!user) {
        resp.failed('没找到对应用户！');
      } else {
        resp.success(user.toJSON());
      }
    }).catch(next);
  },
  
  selectById: async (req, resp, next) => {
    const isMerchant = req.body.isMerchant;
    const userId = req.params.userId;
    let user;
    if(isMerchant) {
      user = await db.Merchant.findById(userId)
    }else {
      user = await db.User.findById(userId);
    }
    if(!user) {
      throw '未找到用户';
    }
    const pickFields = pick(getCommaSplited(req.body.fields))
    if(process.env.NODE_ENV !== 'production') {
      console.log('ip: ', req.ip)
    }
    resp.success(pickFields(user && user.toJSON()));
  },

  selectAll: async (req, resp, next) => {
    const query = req.query
    let queryOption = getQueryOption(query);
    const offset = toNumber(query.start);
    const limit = toNumber(query.limit);
    if (!query.isAdmin) {
      delete queryOption['authGroup.platform'];
    }
    const params = pickByAttrs(query, ['nickname', 'mobile', 'email', 'areaCode', 'invitorCode', 'inputInvitorCode', 'vipLevel', 'walletStatus'])
    const userOption = await db.User.getUserQueryOption(params, '_id')
    queryOption = { ...userOption, ...queryOption };
    let [users, count] = await Promise.all([db.User.find(queryOption, null, {
      skip: offset,
      limit: limit,
      sort: {
        createdAt: -1,
      }
    }), db.User.countDocuments(queryOption)]);
    users = compose(map(user => {
      // const currentNode = memoizeGetNodeById(user.id)
      // user.avatar = getAvatarImage(user.avatar, req);
      // user.uccFreeze = _.round(user.uccFreeze, 4)
      // user.uccAvailable = _.round(user.uccAvailable, 4)
      // user.underUserNums = get('model.underUserNums')(currentNode)
      return user;
    }), getJSONs)(users);
    resp.success(getGridData(users, count));
  },

  export: async (req, resp, next) => {
    const query = req.query
    const queryOption = getQueryOption(query);
    // if (queryOption.kycStatus) {
      delete queryOption['authGroup.platform'];
    // }
    const users = await db.User.find(queryOption, { ...mapValues(v => 1)(headerMapping), realVipLevel: 1 }, {
      sort: {
        createdAt: -1,
      }
    })
    const result = compose(map(user => {
      const currentNode = memoizeGetNodeById(user.id)
      user.status = user.status === 'enabled' ? '正常' : '禁用';
      user.uccFreeze = _.round(user.uccFreeze, 4)
      user.uccAvailable = _.round(user.uccAvailable, 4)
      user.underUserNums = get('model.underUserNums')(currentNode)
      user.vipLevel = user.vipLevel || user.realVipLevel
      return user
    }), getJSONs)(users)
    const fileName = `用户列表 结果${Date.parse(new Date())}.xlsx`
    const excelPath = path.resolve('./public', fileName);
    XLSX.writeFile(getExcelWorkbook(headerMapping, result), excelPath);
    resp.download(excelPath, fileName, (err) => {
      if (err) {
        next(err);
      } else {
        fs.unlink(excelPath, (err) => err && console.error(err))
      }
    })
  },

  // 这次没用
  getBonusInfo(req, resp, next) {
    db.User.findOne({
      name: 'bonus',
    }).then((user) => {
      resp.success(user.toJSON());
    }).catch(next);
  },

  create: async (req, resp, next) => {
    const body = req.body;
    if (!body.pwd) {
      throw '缺少登录密码';
    } else if (!body.paypwd) {
      throw '缺少支付密码';
    } 
   // else if (!body.inviteCode) {
    //   throw '邀请码必填!'
    // } 
    else if (!body.mobile && !body.email) {
      throw '手机号和邮箱必填一项'
    } else if (req.session.validCode[getCaptchaKey(body)] !== body.validCode) {
      resp.failed('验证码不正确！');
    } else {
      const countOption = body.mobile ? { mobile: body.mobile, areaCode: body.areaCode } : { email: body.email }
      const count = await db.User.countDocuments(countOption);
      const invitor = body.inviteCode && await db.User.findOne({ invitorCode: body.inviteCode });
      // if (!invitor) {
      //   throw '没有找到邀请人！';
      // } else 
      if (count) {
        throw '用户已存在!';
      } else {
        const params = pick(['mobile', 'pwd', 'validCode', 'paypwd', 'inviteCode', 'areaCode', 'email'])(body);
        const ebrgo = new Ebrgo()
        const [rank, { address }] = await Promise.all([db.User.countDocuments(), ebrgo.listenerAddAccount()]);
        const newUser = new db.User(Object.assign({
          rank: getRank(rank),
          registBy: body.mobile ? 'mobile' : 'email',
          address: address || undefined,
        }, params, getNewHashParams(params, ['pwd', 'paypwd'])))
        let user = await newUser.save();
        // 修改邀请赠送分数
        [user] = await saveAll(getInviteTransactionObjs(user, invitor));
        addNewCreatedUserNode(invitor, user)
        resp.success(`${user.mobile || user.email}注册成功！`);
      }
    }
  },

  // TODO 可能可以优化
  createByAdmin: async (req, resp, next) => {
    const body = req.body;
    if (!body.pwd) {
      throw '缺少登录密码';
    } else if (!body.paypwd) {
      throw '缺少支付密码';
    } else if (!body.mobile && !body.email) {
      throw '缺少手机号/邮箱!'
    } else {
      const theUser = await db.User.findOneByMobileOrEmail(body);
      const invitor = body.inviteCode && await db.User.findOne({ invitorCode: body.inviteCode });
      if (theUser) {
        throw '用户已存在!';
      } else {
        const params = pick(['mobile', 'email', 'pwd', 'validCode', 'nickname', 'paypwd', 'inviteCode', 'bonus', 'uccFreeze', 'status', 'vipLevel', 'uccVipFreeze', 'areaCode'])(body);
        const ebrgo = new Ebrgo()
        const [rank, { address }] = await Promise.all([db.User.countDocuments(), ebrgo.listenerAddAccount()]);
        const newUser = new db.User(Object.assign({
          rank: getRank(rank),
          registBy: body.mobile ? 'mobile' : 'email',
          address: address || undefined,
        }, params, getNewHashParams(params, ['pwd', 'paypwd'])))
        let user = await newUser.save();
        // 修改邀请赠送分数
        [user] = await saveAll(getInviteTransactionObjs(user, invitor));
        addNewCreatedUserNode(invitor, user);
        resp.success(`${user.mobile || user.email}注册成功！`);
      }
    }
  },

  // 可用状态的用户才能登录
  login(req, resp, next) {
    const body = req.body;
    db.User.findOneByMobileOrEmail(body).populate('childUsers').then(user => {
      if (!user) {
        resp.failed(`不存在的账户！`);
      } else {
        if (user.status !== 'enabled') {
          resp.failed('该用户已被禁用！');
        } else if (bcrypt.compareSync(body.pwd, user.pwd)) {
          req.session.user = pickSessionUserFields(user.toJSON());
          const node = global.root.first(n => n.model.id == user.id)
          // user.dailyMinerPoolBenefits = getDailyMinerPoolBenefits.call(user, node)
          // user.realVipLevel = getRealVipLevel.call(user, node)
          // updateModelVipLevel(node, user.realVipLevel)
          // user.dailyMineBenefits = getVipBenefits.call(user, node)
          const userJSON = user.toJSON()
          userJSON.childUsers = map(child => {
            const childNode = getNodeById(child.id)
            return { ...pick(['nickname', 'mobile', 'miners', '_id', 'id'])(child), sumMiners: get('model.sumMiners')(childNode) }
          })(userJSON.childUsers)
          resp.success(assignIn(userJSON)({
            underSumMiners: get('model.underSumMiners')(node),
            underUserNums: get('model.underUserNums')(node)
          }));
          user.save()
        } else {
          resp.failed('密码不正确！');
        }
      }
    }).catch(err => {
      next(err);
    })
  },

  forgetPwd: async (req, resp, next) => {
    const body = req.body;
    if (!body.validCode) {
      resp.failed('请输入验证码');
    } else if (!body.newPwd) {
      resp.failed('请输入新密码！');
    } else {
      const user = await db.User.findOne({ mobile: body.mobile })
      if (!user) {
        throw '没找到用户！'
      } else if (body.validCode !== req.session.validCode[`_${body.mobile}`]) {
        resp.failed(FAILED_VALID_CODE)
      } else {
        const salt = bcrypt.genSaltSync(10);
        user.pwd = bcrypt.hashSync(body.newPwd, salt);
        return user.save().then(() => resp.success(SUCCESS));
      }
    }
  },

  resetPassword(req, resp, next) {
    const body = req.body;
    if (!body.validCode) {
      resp.failed('请输入验证码');
    } else if (!body.newPwd) {
      resp.failed('请输入新密码！');
    } else {
      db.User.findOneByMobileOrEmail(pick(['mobile', 'email'])(body)).then(user => {
        if (!user) {
          resp.failed('没找到用户！');
        } else if (body.validCode !== req.session.validCode[getCaptchaKey(body, user)]) {
          resp.failed(FAILED_VALID_CODE)
        }
        // else if (!bcrypt.compareSync(body.pwd, user.pwd)) {
        //   resp.failed('原密码不正确');
        // } 
        else {
          const salt = bcrypt.genSaltSync(10);
          user.pwd = bcrypt.hashSync(body.newPwd, salt);
          return user.save().then(() => resp.success(SUCCESS));
        }
      }).catch(next)
    }
  },

  updatePaypwd: async (req, resp) => {
    const sessionUser = req.session.user;
    const body = req.body;
    const user = await findOne(sessionUser.id, db.User, '没找到用户');
    if (!body.newPaypwd) {
      throw '支付密码格式不对'
    }
    // else if (sessionUser.mobile !== user.mobile) {
    //   throw '不是当前用户的手机号！';
    // } 
    else if (req.session.validCode[getCaptchaKey(body, user)] !== body.validCode) {
      throw '验证码不正确！';
    }
    // else if (!bcrypt.compareSync(body.paypwd, user.paypwd)) {
    //   throw '原支付密码不正确';
    // }
    else {
      const salt = bcrypt.genSaltSync(10);
      user.paypwd = bcrypt.hashSync(body.newPaypwd, salt);
      await user.save();
      resp.success('成功修改支付密码');
    }
  },

  getCaptcha(req, resp, next) {
    const body = req.body;
    const code = Math.random().toString().slice(-6);
    // 创建session中的validCode对象
    if (!req.session.validCode || req.session.validCode instanceof Array) {
      req.session.validCode = Object.create(null)
    }
    if (!(body.mobile && body.areaCode) && !body.email) {
      resp.failed('请输入手机号/邮箱')
    } else {
      // 没有_字符开头的情况下，好像validCode被解析为数组
      const key = getCaptchaKey(body);
      req.session.validCode[key] = code;
      global.setTimeout(() => {
        if (req.session) {
          _.set(req.session, `validCode.${key}`, null)
        }
      }, 5 * 60 * 1000);
      const message = `【椿佑堂】您的验证码为${code},请在5分钟内输入使用`
      if (body.areaCode == '86' || body.areaCode == '+86') {
        const postData = {
          mobile: body.mobile,
          message,
        };
        const zhtSMSHelper = new ZHTSMSHelper()
        zhtSMSHelper.getSMS(postData).then(data => {
          resp.success(data)
        }).catch(err => {
          throw err
        })
        // TODO 国外的手机号的发信方式
      } else if (body.mobile) {

      } else if (body.email) {
        const mail = new MailHelper({});
        mail.mail({ to: body.email, subject: '验证码', text: message }).then(data => {
          resp.success(data);
        }).catch(err => {
          throw err
        });
      }
      // var content = stringify(postData);
      // var getSmsOption = {
      //   host: 'sms-api.luosimao.com',
      //   path: '/v1/send.json',
      //   method: 'POST',
      //   auth: 'api:key-be5ecde3485c341305db3555bea66e78',
      //   agent: false,
      //   rejectUnauthorized: false,
      //   headers: {
      //     'Content-Type': 'application/x-www-form-urlencoded',
      //     'Content-Length': content.length
      //   }
      // };
      // var req = https.request(getSmsOption, function (res) {
      //   res.setEncoding('utf8');
      //   res.on('data', function (chunk) {
      //     resp.success(chunk);
      //   });
      //   res.on('end', function () {
      //   });
      // });
      // req.write(content);
      // req.end();
    }
  },

  identity: async (req, resp, next) => {
    const body = req.body;
    const user = await findOne(req.session.user.id, db.User, '没找到用户！');
    if (user.kycStatus == 'passed') {
      throw '该用户已通过实名认证'
    } else {
      const params = pick(['front', 'back', 'IDCard', 'handheldFront', 'name'])(body);
      user.applyKycAt = new Date();
      user.kycStatus = get('config.isKycAudit')(global) ? 'reviewing': 'passed';
      if(user.kycStatus === 'passed') {
        user.handleKycAt = new Date();
      }
      Object.assign(user, params);
      await user.save();
      resp.success('成功提交实名认证');
    }
  },

  // platform's superAdmin/admin
  acceptIdentity: async (req, resp) => {
    const user = await db.User.findById(req.params.userId);
    if (user.kycStatus !== 'reviewing') {
      const content = user.kycStatus === 'notPassed' ? '实名认证申请已被拒绝' : (user.kycStatus === 'passed' ? '实名认证申请已通过' : '未申请实名认证');
      throw `该用户${content}`;
    } else {
      // user.applyKycAt = new Date();
      user.kycStatus = 'passed';
      user.handleKycAt = new Date();
      await user.save();
      resp.success('通过用户实名认证！');
    }
  },

  // platform's superAdmin/admin
  rejectIdentity: async (req, resp) => {
    const user = await db.User.findById(req.params.userId);
    if (user.kycStatus !== 'reviewing') {
      throw '该用户没有申请实名认证';
    } else {
      user.kycStatus = 'notPassed';
      await user.save();
      resp.success('已拒绝用户实名认证');
    }
  },

  // bulkImport(req, resp, next) {
  //   if (!isAdmin(req.session.user)) {
  //     resp.failed('当前用户没有权限！');
  //   } else {
  //     const excelPath = getAbsoluteStaticUrl(req.body.excelUrl);
  //     const workbook = XLSX.readFile(excelPath);
  //     const ws = workbook.Sheets[workbook.SheetNames[0]];
  //     const getMappedColumn = (v) => { return chineseColumnMapping[v]; }
  //     const getAddressMappedColumn = (v) => { return chineseAddressColumnMapping[v]; }
  //     const getMapKeys = compose(map(pick(['name', 'phone', 'bonus', 'IDCard', 'isVip'])), map(mapKeys(getMappedColumn)));
  //     const getAddressMapKeys = compose(map(pick(['name', 'phone', 'detailAddress'])), map(mapKeys(getAddressMappedColumn)));
  //     const rawData = XLSX.utils.sheet_to_json(ws);
  //     const getVipProcessed = map(user => {
  //       const setVip = user.isVip.indexOf && user.isVip.indexOf('是') >= 0 ? set('isVip', true) : identity;
  //       return setVip(user);
  //     })
  //     const data = compose(getVipProcessed, getMapKeys)(rawData);
  //     const addressData = getAddressMapKeys(rawData);
  //     const getUniqLength = compose(prop('length'), uniqBy('phone'));
  //     if (getUniqLength(data) !== data.length) {
  //       resp.failed('电话号码重复！请仔细检查');
  //     } else {
  //       const salt = bcrypt.genSaltSync(10);
  //       const getResultData = map(assignIn({
  //         isVip: true,
  //         pwd: bcrypt.hashSync('123456', salt),
  //       }));
  //       db.User.insertMany(getResultData(data)).then((users) => {
  //         const addresses = [];
  //         for (let i in users) {
  //           addresses.push(assignIn({
  //             userId: users[i]._id,
  //             isDefault: true,
  //           })(addressData[i]));
  //         }
  //         return Promise.all([db.ReceivingAddress.insertMany(addresses), destoryFile(excelPath)]);
  //       }).then(() => {
  //         resp.success('批量添加成功');
  //       }).catch(next);
  //     }
  //   }
  // },

  // getImportTemplate(req, resp, next) {
  //   resp.download(`${pathConfig.static}/excel/批量导入模板空白.xlsx`);
  // },

  signIn: async (req, resp) => {
    const userId = req.session.user._id;
    const userSignIn = await db.UserSignIn.countDocuments({
      user: userId,
      createdAt: getTodayRange(),
    });
    const user = await db.User.findById(userId);
    const signInLimit = get('signInLimit')(global.config);
    if (userSignIn >= signInLimit) {
      throw `当日已签到${signInLimit}次`;
    } else {
      const newSignIn = new db.UserSignIn({
        user: userId,
      });
      await saveAll([newSignIn, ...getSignInTransactionObjs(user)]);
      resp.success(`签到成功,奖励${get('config.signInBonus')(global)}积分`);
    }
  },

  isSignedInToday: async (req, resp) => {
    const userId = req.session.user._id;
    const userSignIn = await db.UserSignIn.countDocuments({
      user: userId,
      createdAt: getTodayRange(),
    });
    resp.success({ signedIn: userSignIn > 0 });
  },

  getInviteList: async (req, resp) => {
    const query = req.query;
    const offset = toNumber(query.start);
    const limit = toNumber(query.limit);
    const setInvitor = query.invitor ? set('$or', [{ nickname: new RegExp(query.invitor) }, { inviteCode: new RegExp(query.invitor) }, { name: new RegExp(query.invitor) }]) : identity
    const setInvitee = query.invitee ? (option) => {
      if (option['$or']) {
        option.$or.push({ inputInvitorCode: new RegExp(query.invitee) })
      } else {
        option.$or = [{ name: new RegExp(query.invitee) }, { nickname: new RegExp(query.invitee) }, { inputInvitorCode: new RegExp(query.invitee) }]
      }
      return option
    } : identity
    let uids
    if (query.invitor) {
      uids = await db.User.find((setInvitor({})), '_id')
    }
    const setAddition = (query.invitor) && uids.length ? set('invitor', { $in: map('_id')(uids) }) : identity
    const options = setInvitee(setAddition(getQueryOption(req.query)));
    // 这里的时间用的是用户获取奖励的时间
    delete options.createdAt;
    delete options['authGroup.platform']
    const [users, count] = await Promise.all([db.User.find(options, 'invitor invitorCode nickname childUsers createdAt name', {
      skip: offset,
      limit: limit,
      sort: {
        createdAt: -1,
      }
    }).populate('invitor'), db.User.countDocuments(options)])
    const getResult = map(user => {
      user = user.toJSON()
      user.invitee = pick(['nickname', 'invitorCode'])(user)
      return user
    })
    resp.success(getGridData(getResult(users), count))
  },

  getInviteBonusList: async (req, resp) => {
    const query = req.query;
    const offset = toNumber(query.start);
    const limit = toNumber(query.limit);
    const options = getQueryOption(req.query, ['name', 'invitorCode']);
    // 这里的时间用的是用户获取奖励的时间
    delete options.createdAt;
    delete options['authGroup.platform']
    const users = await db.User.find(options, '_id', {
      skip: offset,
      limit: limit,
      sort: {
        createdAt: -1,
      }
    })
    const userIds = map('_id')(users);
    const setTime = query.startTime && query.endTime ? set('createdAt', { $gte: new Date(query.startTime), $lt: getLastTime(query.endTime) }) : identity;
    const setUser = set('$or', [{ invitor: { $in: userIds } }, { invitee: { $in: userIds } }]);
    const queryOption = setTime(setUser({
      type: 'registerBonus',
    }));
    const [transactions, count] = await Promise.all([db.Transaction.find(queryOption, 'id invitor invitee amount createdAt').populate('invitor invitee')
      , db.Transaction.countDocuments(queryOption)]);
    const getResult = compose(map(transaction => {
      transaction.invitor = pick(['_id', 'name', 'invitorCode', 'inviteNum', 'nickname', 'childUsers'])(transaction.invitor);
      transaction.invitee = pick(['_id', 'name', 'invitorCode', 'nickname'])(transaction.invitee);
      return transaction;
    }), getJSONs);
    resp.success(getGridData(getResult(transactions), count));
  },

  //access for platform's admin or superAdmin
  acceptMerchantApply: async (req, resp, next) => {
    let user = await db.User.findById(req.params.userId).populate('merchantId');
    if (!user) {
      throw '没找到用户';
    } else if (user.applyMerchant !== 'applying') {
      throw '该用户没有申请成为商家或者已申请商家';
    } else if (user.merchantId) {
      throw '该商家申请已通过';
    } else {
      user.applyMerchant = 'success';
      const count = await db.Merchant.countDocuments();
      const newMerchant = new db.Merchant(assignIn(user.merchant)({
        user: user._id,
        rank: count + 1,
      }));
      const merchant = await newMerchant.save();
      user.authGroup.merchant = 'superAdmin'
      user.merchantId = merchant._id;
      user = await user.save();
      // 把商家的状态更新到session上
      req.session.user = pickSessionUserFields(assignIn(req.session.user)(user));
      resp.success('通过商家申请！');
    }
  },

  //access for platform's admin or superAdmin
  rejectMerchantApply: async (req, resp) => {
    let user = await findOne(req.params.userId, db.User, '没找到用户申请');
    if (user.applyMerchant !== 'applying') {
      throw '该用户商家申请已处理或没有申请';
    } else {
      user.applyMerchant = 'refuse';
      user = await user.save();
      req.session.user = pickSessionUserFields(assignIn(req.session.user)(user));
      resp.success('成功拒绝商家申请！');
    }
  },

  getIndexInfo: async (req, resp) => {
    const yesterdayRange = getYesterdayRange();
    const filterToday = filter(tx => isTodayRange(tx.createdAt))
    const [totalUsers, yesterdayUsers, notKyced, merchantNum, applyingMerchantNum, extractingMerchants,
      extractingUsers, withdrawGoodsNum, orderNums, yesterdayOrderNum, minerTxs, minerPoolTxs, mineTxs, equityBenefitsTxs] = await Promise.all([
        db.User.countDocuments(),
        db.User.countDocuments({ createdAt: yesterdayRange }),
        db.User.countDocuments({ kycStatus: 'reviewing' }),
        db.Merchant.countDocuments(),
        db.Merchant.countDocuments({
          applyMerchant: 'applying',
        }),
        db.Transaction.find({
          merchant: { $exists: true },
          status: 'applying',
          type: 'extractOut',
        }, 'merchant'),
        db.Transaction.find({
          user: { $exists: true },
          status: 'applying',
          type: 'extractOut',
        }, 'user'),
        db.Product.countDocuments({
          productStatus: 'forbid'
        }),
        db.Order.countDocuments({
          status: { $ne: 'canceled' }
        }),
        db.Order.countDocuments({
          createdAt: yesterdayRange
        }),
        db.Transaction.find({
          payment: 'uccAvailable',
          type: 'dailyMiner'
        }, 'amount createdAt'),
        db.Transaction.find({
          payment: 'uccAvailable',
          type: 'dailyMinerPool'
        }, 'amount createdAt'),
        db.Transaction.find({
          payment: 'uccAvailable',
          type: 'dailyMine'
        }, 'amount createdAt'),
        db.Transaction.find({
          payment: 'equityBenefits',
        }, 'amount createdAt')])
    const getNum = compose(get('length'), uniqBy(u => {
      return u.merchant || u.user;
    }))
    resp.success({
      totalUsers,
      yesterdayUsers,
      notKyced,
      merchantNum,
      applyingMerchantNum,
      extractingMerchantNum: getNum(extractingMerchants),
      extractingUserNum: getNum(extractingUsers),
      withdrawGoodsNum,
      orderNums,
      yesterdayOrderNum,
      totalMinerBenefits: sumBy('amount')(minerTxs),
      todayMinerBenefits: sumBy('amount')(filterToday(minerTxs)),
      totalMinerPoolBenefits: sumBy('amount')(minerPoolTxs),
      todayMinerPoolBenefits: sumBy('amount')(filterToday(minerPoolTxs)),
      totalMineBenefits: sumBy('amount')(mineTxs),
      todayMineBenefits: sumBy('amount')(filterToday(mineTxs)),
      totalEquityBenefits: sumBy('amount')(equityBenefitsTxs),
      todayEquityBenefits: sumBy('amount')(filterToday(equityBenefitsTxs)),
    })
  },

  /**
   * 
   */
  getTreeLayers: async (req, resp, next) => {
    const { mobile, forceRecalc } = req.query
    const trimedMobile = trim(mobile)
    const specificUser = await db.User.findOne({ mobile: trimedMobile })
    const currentUserNode = trimedMobile && specificUser ? global.root.first(n => n.model.id == specificUser.id) : global.root
    if ((trimedMobile && !specificUser) || !currentUserNode) {
      throw '没找到对应用户层级结构'
    } else {
      resp.success(currentUserNode.model)
      const users = await db.User.find({}, 'id childUsers invitor miners nickname mobile vipLevel').populate('invitor childUsers')
      global.root = (creatTreeModel(users));
      global.root.walk({ strategy: 'post' }, n => {
        const realVipLevel = getVipLevel(n)
        updateModelVipLevel(n, realVipLevel)
      })
    }
  },

  /**
   * 获取我的团队
   */
  myGroup: async (req, resp, next) => {
    const user = await db.User.findById(req.session.user._id).populate('childUsers')
    const currentNode = getNodeById(user.id);
    const underUserNums = get('model.underUserNums')(currentNode)
    const getResult = user => {
      user.childUsers = user.childUsers.map(pick(['nickname', 'mobile', 'childUsers', 'invitorBonus', 'createdAt', 'avatar']))
      return pick(['invitorBonus', 'childUsers'])(user);
    }
    resp.success({ userNums: 1 + underUserNums, ...getResult(user.toJSON()) })
  }


}

module.exports = userController;
