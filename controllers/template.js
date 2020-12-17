
const db = require('../models');
const { SUCCESS_CREATE } = require('../commons/respCommons');
const { pickByAttrs, getGridData, getCommaSplited, getLastTime } = require('../utils/common');
const { throwFailedMessage, } = require('../utils/promiseHelper');
const { get, toNumber, set, identity, compose, reverse, sortBy } = require('lodash/fp');
const { findAndCount } = require('../utils/queryHelper');
const { notSuperAdmin } = require('../utils/accessAuth')
const { Types } = require('mongoose')


const getQueryOption = (query) => {
  const setSearchWord = query.searchWord && query.searchWord.length === 24 ? set('_id', Types.ObjectId(query.searchWord)) : query.searchWord ? set('name', new RegExp(query.searchWord)) : identity;
  const setTime = query.startTime && query.endTime ? set('createdAt', { $gte: new Date(query.startTime), $lt: getLastTime(query.endTime) }) : identity;
  const setVisible = query.visible == 'true' ? set('visible', true) : identity
  return compose(setVisible, setTime, setSearchWord)({});
};

const newsController = {

  selectAll: async (req, resp, next) => {
    const query = req.query
    const offset = toNumber(query.start);
    const limit = toNumber(query.limit);
    const [news, count] = await findAndCount(db.Template, {}, {
      skip: offset,
      limit: limit,
      sort: {
        createdAt: -1,
      }
    });
    const getSort = compose(reverse, sortBy('sort'));
    resp.success(getGridData(getSort(news), count));
  },

  update: async (req, resp, next) => {
    const body = req.body
    let piece = await db.Template.findOneNotNull(req.params.templateId);
    const params = pickByAttrs(body, ['name', 'rule', 'areaCost'])
    if(params.areaCost) {
      params.areaCost = JSON.parse(params.areaCost)
    }
    Object.assign(piece, params);
    await piece.save();
    resp.success(piece);
  },

  create: async (req, resp, next) => {
    const body = req.body;
    let template = new db.Template({
      merchant: req.session.user._id,
      name: body.name,
      rule: body.rule,
      areaCost: JSON.parse(body.areaCost)
    });
    template = await template.save();
    resp.success(SUCCESS_CREATE);
  },

}

module.exports = newsController;