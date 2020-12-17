
const db = require('../models');
const { SUCCESS_CREATE } = require('../commons/respCommons');
const { pickByAttrs, getGridData, getCommaSplited, getLastTime, getObjectIds } = require('../utils/common');
const { throwFailedMessage, } = require('../utils/promiseHelper');
const { get, toNumber, set, identity, compose, reverse, sortBy, mapValues, map, omit } = require('lodash/fp');
const { findAndCount } = require('../utils/queryHelper');
const { notSuperAdmin } = require('../utils/accessAuth')
const { Types } = require('mongoose')
const VideoPart = require('../utils/videoPart')


const toHex = mapValues(map(id => id.toHexString()))
const videoController = {

  search: async (req, resp, next) => {
    const field = ['nickname']
    const userOption = await db.User.getUserQueryOption(pickByAttrs(req.body, field), 'id')
    const video = new VideoPart()
    const result = await video.search(omit(field)({ ...toHex(userOption), ...req.body }));
    resp.success(result)
  },


  selectAll: async (req, resp, next) => {
    const field = ['id', 'nickname', 'mobile', 'email', 'user', 'areaCode']
    const userOption = await db.User.getUserQueryOption(pickByAttrs(req.body, field), 'userIds')
    const video = new VideoPart()
    const result = await video.adminSearch(omit(field)({ ...toHex(userOption), ...req.body }));
    const users = await db.User.getUserInfo(getObjectIds(map('userId')(result.records)));
    resp.success(video.getUserInfo(result, users))
  },

  comments: async (req, resp, next) => {
    const field = ['nickname', 'user'];
    const userOption = await db.User.getUserQueryOption(pickByAttrs(req.body, field), 'userIds')
    const video = new VideoPart()
    const result = await video.adminComment(omit(field)({ ...toHex(userOption), ...req.body }));
    const users = await db.User.getUserInfo(getObjectIds(map('userId')(result.records)));
    resp.success(video.getUserInfo(result, users))
  },

  audit: async (req, resp, next) => {
    const field = ['id', 'nickname', 'mobile', 'email', 'user', 'areaCode']
    const userOption = await db.User.getUserQueryOption(pickByAttrs(req.body, field), 'userIds')
    const video = new VideoPart()
    const result = await video.adminAudit(omit(field)({ ...toHex(userOption), ...req.body }));
    const users = await db.User.getUserInfo(getObjectIds(map('userId')(result.records)));
    resp.success(video.getUserInfo(result, users))
  },

}

module.exports = videoController;