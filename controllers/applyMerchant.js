
const db = require('../models');
const { SUCCESS_CREATE } = require('../commons/respCommons');
const { pickByAttrs, getGridData, getCommaSplited, getLastTime, getJSONs } = require('../utils/common');
const { throwFailedMessage, } = require('../utils/promiseHelper');
const { toNumber, set, identity, compose, reverse, sortBy, map, pick } = require('lodash/fp');
const { findAndCount } = require('../utils/queryHelper');
const { notSuperAdmin } = require('../utils/accessAuth')
const { Types } = require('mongoose')


const getQueryOption = (query) => {
  const setSearchWord = query.searchWord && query.searchWord.length === 24 ? set('_id', Types.ObjectId(query.searchWord)) : identity;
  const setTime = query.startTime && query.endTime ? set('createdAt', { $gte: new Date(query.startTime), $lt: getLastTime(query.endTime) }) : identity;
  const setCompleteTime = query.processStartTime && query.processEndTime ? set('createdAt', { $gte: new Date(query.processStartTime), $lt: getLastTime(query.processEndTime) }) : identity;
  const setStatus = query.status ? set('status', query.status) : identity;
  const setContract = query.contract ? set('contract', query.contract): identity;
  return compose(setContract, setStatus, setCompleteTime, setTime, setSearchWord)({});
};

const newsController = {

  selectAll: async (req, resp, next) => {
    const fields = ['nickname', 'areaCode', 'mobile', 'email'];
    const query = req.query
    const queryOption = getQueryOption(query);
    const offset = toNumber(query.start);
    const limit = toNumber(query.limit);
    const userParams = pickByAttrs(req.query, fields);
    const userQueryOption = await db.User.getUserQueryOption(userParams);
    const [news, count] = await findAndCount(db.ApplyMerchant, { ...userQueryOption, ...queryOption}, {
      skip: offset,
      limit: limit,
      sort: {
        createdAt: -1,
      },
      populate: 'user'
    });
    const getSort = compose(reverse, sortBy('sort'), map(anew => {
      anew.user = pick([...fields, 'id'])(anew.user);
      return anew;
    }), getJSONs);
    resp.success(getGridData(getSort(news), count));
  },

  process: async (req, resp, next) => {
    let piece = await db.ApplyMerchant.findById(req.params.id);
    if (!piece) {
      resp.failed('没找到申请！');
    } else {
      if(piece.status !== 'unprocessed') {
        throw '该申请已被处理'
      }else {
        piece.operator = req.session.user._id;
        piece.status = 'processed';
        piece.completedAt = new Date();
        await piece.save();
      }
      resp.success(piece);
    }
  },

  create: async (req, resp, next) => {
    const body = req.body;
    let apply = new db.ApplyMerchant({
      user: req.session.user._id,
      contract: body.contract,
      imageUrls: getCommaSplited(body.imageUrls),
    });
    apply = await apply.save();
    resp.success(SUCCESS_CREATE);
  },

}

module.exports = newsController;