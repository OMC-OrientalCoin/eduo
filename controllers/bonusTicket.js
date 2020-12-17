const db = require('../models');
const { accessHanlder } = require('../utils/accessAuth');
const { getLastTime, getJSONs, getGridData, pickByAttrs, getCommaSplited, getMerchantId, getObjectIds } = require('../utils/common')
const { saveAll } = require('../utils/promiseHelper')
const { flatten, assignIn, map, pick, identity, set, compose, get, some } = require('lodash/fp')
const { SUCCESS_CREATE, SUCCESS_DELETE } = require('../commons/respCommons')
const { Types } = require('mongoose');
const bcrypt = require('bcryptjs')

const getQueryOption = (query) => {
  const setSearchWord = query.searchWord ? set('name', new RegExp(query.searchWord)) : identity;
  // 结束时间大于搜索结束时间，开始时间小于搜索结束时间
  // 结束时间在搜索开始和结束时间之间
  const setTime = query.startTime && query.endTime ? set('$or', [{ startTime: { $lt: getLastTime(query.endTime)}, endTime: { $gte: new Date(query.endTime)}}, 
  { endTime: { $gte: new Date(query.startTime), $lt: getLastTime(query.endTime)}}]) : identity;
  return compose(setTime, setSearchWord)({});
}

const getBonusTransactionObjs = (user, amount) => {
  if (user.bonus >= amount) {
    user.bonus -= amount;
    const transcation = new db.Transaction({
      unit: 'bonus',
      status: 'accept',
      payment: 'bonus',
      amount,
      user: user._id,
      completedAt: new Date(),
      type: 'buyBonusTicket',
    });
    return [user, transcation];
  } else {
    return [];
  }
}

const bonusTicketController = {

  // 后台获取特定商户优惠券列表
  select: async (req, resp, next) => {
    const tickets = await db.BonusTicket.find(assignIn({
      merchant: Types.ObjectId(getMerchantId(req.session)),
    })(getQueryOption(req.query)));
    resp.success(getGridData(tickets));
  },

  // 商户获取优惠券领取记录
  selectFetchList: async (req, resp, next) => {
    const bonusTicketId = req.params.bonusTicketId;
    const applyTickets = await db.ApplyBonusTicket.find({ 'ticket._id': Types.ObjectId(bonusTicketId) }).populate('user');
    const getResult = compose(map(ticket => {
      ticket.user = pick(['id', 'name', '_id', 'nickname'])(ticket.user);
      return ticket;
    }), getJSONs)
    resp.success(getGridData(getResult(applyTickets)));
  },

  // populate可能有点问题
  selectMyFetchList: async (req, resp, next) => {
    const applyTickets = await db.ApplyBonusTicket.find({ user: req.session.user._id }).populate('ticket.suitableProducts ticket.merchant')
    const getCategoryIds = compose(map('lastCategory'), flatten, map('ticket.suitableProducts'));
    const categories = await db.Category.find({
      _id: { $in: getCategoryIds(applyTickets) }
    }, 'id name');
    const getResult = map(applyTicket => {
      applyTicket = applyTicket.toJSON();
      applyTicket.ticket.suitableProducts = applyTicket.ticket.suitableProducts.map(p => {
        p.category = categories.find(c => p.lastCategory == c.id);
        return pick(['_id', 'name', 'category'])(p);
      })
      applyTicket.suitableProducts = applyTicket.ticket.suitableProducts;
      const result = assignIn(applyTicket)(pick(['merchant', 'merchantProducts', 'startTime', 'endTime', 'condition', 'bonus'])(applyTicket.ticket));
      result.merchant = pick(['id', 'name'])(result.merchant);
      result.ticket = result.ticket._id;
      return result;
    })
    resp.success(getResult(applyTickets));
  },

  // 可能有String转换为Date的问题
  create: async (req, resp, next) => {
    accessHanlder(req.session, async () => {
      const params = pick(['name', 'condition', 'bonus', 'required', 'startTime', 'endTime', 'suitableProducts', 'amount', 'totalAmount'])(req.body);
      if (params.suitableProducts) {
        params.suitableProducts = getObjectIds(getCommaSplited(params.suitableProducts));
      }
      params.totalAmount = params.amount;
      const ticketIns = new db.BonusTicket(params);
      ticketIns.merchant = getMerchantId(req.session);
      const merchant = await db.Merchant.findById(ticketIns.merchant);
      const ticket = await ticketIns.save();
      merchant.bonusTickets.push(ticket._id);
      await merchant.save();
      resp.success(SUCCESS_CREATE);
    })
  },

  // 要生成一条transaction,要减掉需要的积分
  fetch: async (req, resp, next) => {
    const bonusTicketId = req.params.bonusTicketId;
    // 主动搜索的，可能可以去掉
    // const count = await db.ApplyBonusTicket.countDocuments({ ticket: { id: Types.ObjectId(bonusTicketId) } , user: req.session.user._id });
    const sessionUser = req.session.user
    const theUser = await db.User.findById(sessionUser.id).populate('bonusTickets')
    const haveApplyed = some(ticket => ticket.ticket.id == bonusTicketId)
    // 领取过优惠券的
    if (haveApplyed(theUser.bonusTickets)) {
      throw '当前用户已领取过此优惠券！';
    } else {
      let [ticket, user] = await Promise.all([db.BonusTicket.findById(bonusTicketId), db.User.findById(sessionUser.id)]);
      if (ticket.amount <= 0) {
        throw '当前优惠券已被领完！';
      } else if (user.bonus < ticket.required) {
        throw '当前用户积分不够领取优惠券'
      } else if (!bcrypt.compareSync(req.body.paypwd, user.paypwd)) {
        throw '支付密码不正确'
      } else {
        const newApplyTicket = new db.ApplyBonusTicket({
          name: ticket.name,
          user: sessionUser._id,
          // ticket: {
          //   id: ticket._id,
          //   startTime: ticket.startTime,
          //   endTime: ticket.endTime,
          // },
          ticket,
        });
        [user, transaction] = getBonusTransactionObjs(user, ticket.required);
        [applyTicket, user] = await saveAll([newApplyTicket, user, transaction]);
        user && user.bonusTickets.push(applyTicket._id);
        // 余量减少1
        ticket.amount -= 1;
        user && await user.save();
        ticket && await ticket.save();
        resp.success('成功领取优惠券!');
      }
    }
  },

  destroy: async (req, resp, next) => {
    const bonusTicketId = req.params.bonusTicketId;
    const ticket = await db.BonusTicket.findById(bonusTicketId);
    if (ticket.merchant != getMerchantId(req.session)) {
      throw '删除的优惠券不是自己的!'
    } else {
      await ticket.remove();
      resp.success(SUCCESS_DELETE);
    }
  },
}


module.exports = bonusTicketController;