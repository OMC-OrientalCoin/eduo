const db = require('../models');
const { SUCCESS_CREATE } = require('../commons/respCommons');
const { pickByAttrs, getGridData } = require('../utils/common');
const { throwFailedMessage, } = require('../utils/promiseHelper');
const { toNumber, set, identity, compose, reverse, sortBy } = require('lodash/fp');
const { findAndCount } = require('../utils/queryHelper');
const { notSuperAdmin } = require('../utils/accessAuth')


const getQueryOption = (query) => {
  const setSearchWord = query.searchWord ? set('title', new RegExp(query.searchWord)) : identity;
  const setVisible = query.visible == 'true' ? set('visible', true) : identity
  return compose(setVisible, setSearchWord)({});
};

const newsController = {

  selectAll: async (req, resp, next) => {
    const query = req.query
    const queryOption = getQueryOption(query);
    const offset = toNumber(query.start);
    const limit = toNumber(query.limit);
    const [news, count] = await findAndCount(db.News, queryOption, {
      skip: offset,
      limit: limit,
      sort: {
        createdAt: -1,
      }
    }, {
        id: 1,
        title: 1,
        createdAt: 1,
        sort: 1,
        visible: 1,
        content: 1
      });
    const getSort = compose(reverse, sortBy('sort'));
    resp.success(getGridData(getSort(news), count));
  },

  selectById: async (req, resp, next) => {
    let piece = await db.News.findById(req.params.newsId);
    if (!piece) {
      resp.failed('没找到新闻！');
    } else {
      if (req.query.addRead === 'true' || req.query.addRead) {
        piece.read += 1;
        piece = await piece.save();
      }
      resp.success(piece);
    }
  },

  create: async (req, resp, next) => {
    const body = req.body;
    if (notSuperAdmin(req.session.user, 'platform')) {
      resp.failed('当前用户没有创建权限');
    } else {
      let news = db.News({
        sort: body.sort,
        title: body.title,
        content: body.content,
        visible: body.visible,
      });
      news = await news.save();
      resp.success(SUCCESS_CREATE);
    }
  },

  update: async (req, resp, next) => {
    const body = req.body;
    if (notSuperAdmin(req.session.user, 'platform')) {
      resp.failed('当前用户没有权限');
    } else {
      db.News.findById(req.params.newsId).then(news => {
        if (!news) {
          return throwFailedMessage('没找到新闻！');
        }
        const params = pickByAttrs(body, ['sort', 'title', 'visible', 'content']);
        Object.assign(news, params);
        return Promise.all([news.save()]);
      }).then(([news]) => {
        resp.success(news);
      }).catch(err => {
        next(err)
      });
    }
  },

  // destroy(req, resp, next) {
  //   if (!isAdmin(req.session.user)) {
  //     resp.failed('当前用户没有权限');
  //   } else {
  //     db.News.find({
  //       _id: getIds(req.body.newsIds)
  //     }).then(news => {
  //       return deleteAll(news);
  //     }).then(() => {
  //       resp.success(SUCCESS_DELETE);
  //     }).catch(next);
  //   }
  // },


}

module.exports = newsController;