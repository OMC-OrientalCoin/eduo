const TreeModel = require('tree-model');
const { Types } = require('mongoose');
const { saveAll } = require('./promiseHelper');
const { identity, pick, assignIn, curryRight, compose, map, get, compact, filter, reverse, uniq, flatten, tail, each, uniqBy, slice, mapValues, sumBy, groupBy, memoize, } = require('lodash/fp');
const _ = require('lodash');
const { getPackBonus, updateModelVipLevel } = require('../utils/common');

const getChildrenIds = compose(get('childUsers'));
const getChildrenObjs = compose(map(id => { return { id: id } }), map(objectid => objectid.toHexString()), getChildrenIds);
const nodeLimit = 5
const getObjectIds = compose(map(Types.ObjectId), map('model.id'));
const { getVipLevel } = require('../utils/userBenefits')

const addChild = function (nodes, newNode) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (get('children.length')(node) < nodeLimit) {
      return node.addChild(newNode);
      // 是最后一个的情况
    } else if (i == nodeLimit - 1) {
      const getChildren = compose(compact, map(id => global.forest[id]), uniq, flatten, map('children.id'));
      return addChild(getChildren(nodes), newNode);
    }
  }
}

// const getParents = (user) => {
//   const firstParent = global.root.first({ strategy: 'breadth' }, node => node.model.id == user.invitor);
//   const parents = compact([firstParent]);
//   let parent = firstParent;
//   const additionLayer = global.config.additionLayer;
//   for (let i = 0; i < additionLayer.length; i++) {
//     parent = parent && parent.parent;
//     if (parent) {
//       parents.push(parent);
//     } else {
//       break;
//     }
//   }
//   return parents;
// }


// const addBonusTransaction = ({ user, bonus, type, blockId, belongingNode }) => {
//   if (user && bonus) {
//     user.firAvailable += bonus;
//     const newTransaction = db.Transaction({
//       // 新增节点以及区块的埋点
//       blockId,
//       belongingNode,
//       type: type || 'bonusNode',
//       ownerId: user._id,
//       amount: bonus,
//       status: 'completed',
//       completedAt: new Date(),
//     });
//     return {
//       user: user,
//       transactionObjs: [user, newTransaction],
//     }
//   }
//   return {};
// }

// const deliveryNodeBonus = ({ nodes, users, invitorId, bonusConfig, transactionType, purchaseTimesMapping, packLen }) => {
//   const node = nodes.find(n => n.id == invitorId)
//   const correspondUser = users.find(u => u.id == node.belongingUser);
//   // 传入广告包对象，但是没有对应购买广告包记录的
//   if (purchaseTimesMapping && !purchaseTimesMapping[node.id]) {
//     return {
//       bonusedUser: correspondUser,
//       objs4Save: [],
//     }
//   } else {
//     const treeBonus = get(bonusConfig || 'config.nodeBonus.treeBonus')(global) * (packLen || 1);
//     node.bonus += treeBonus;
//     let { user, transactionObjs } = addBonusTransaction({ user: correspondUser, bonus: treeBonus, type: transactionType, belongingNode: node._id });
//     return {
//       bonusedUser: user,
//       objs4Save: ([node].concat((transactionObjs))),
//     }
//   }
// }

// const deliverySpecificNodeBonus = ({ node, bonus, transactionType, user }) => {
//   node.bonus += bonus;
//   return [node].concat(addBonusTransaction({ user, bonus, type: transactionType, belongingNode: node._id }).transactionObjs);
// }

// const deliveryBlockBonus = ({ bonusedUsers, blockOwners, ownerId, key, bonusConfig, transactionType, block, packLen }) => {
//   // 其实这里避免改到元对象
//   if (!ownerId) {
//     return [];
//   } else {
//     let owner = bonusedUsers.find(u => u.id == ownerId) || blockOwners.find(owner => owner.id == ownerId);
//     const blockBonus = get(bonusConfig ? `${bonusConfig}.${key}` : `config.nodeBonus.generalBonus.${key}`)(global) * (packLen || 1);
//     // 添加区块相关奖励发放的埋点
//     block.totalBonus += blockBonus;
//     return [block].concat(addBonusTransaction({ user: owner, bonus: blockBonus, type: transactionType, blockId: block._id }).transactionObjs);
//   }
// }

const getSumMiners = curryRight((n, users) => {
  const correspondUser = !n.toHexString ? n : users.find(user => user.id == n);
  const memoizeGetSumMiners = getSumMiners(users)
  if (n.inviteNum === 0 || (correspondUser && correspondUser.inviteNum === 0)) {
    return typeof n.miners === 'number' ? n.miners : (correspondUser && correspondUser.miners)
  } else {
    return sumBy(cn => memoizeGetSumMiners(cn))(n.childUsers || correspondUser.childUsers) + (n.miners || (correspondUser && correspondUser.miners))
  }
})

const getSumMinersV2 = (node) => {
  return node.children.length ? sumBy('model.miners')(node.all(n => n.model.miners > 0)) : node.model.miners
}

const getSumMinersV2d5 = (node) => {
  return node.children.length ? sumBy('model.sumMiners')(node.children) : node.model.miners
}

const getParent = curryRight((u, users) => {
  const invitorUser = !get('invitor.toHexString')(u) ? u.invitor : users.find(user => user.id == u.invitor)
  if (invitorUser) {
    const invitorParams = pick(['nickname', 'mobile', 'miners', 'id'])(invitorUser)
    // return assignIn({ sumMiners: getSumMiners(users)(invitorUser) })(invitorParams)
    return assignIn({ sumMiners: getSumMinersV2(invitorUser) })(invitorParams)
  } else {
    return null
  }
})

const getChildren = curryRight((u, users) => {
  return u.childUsers.map(childId => {
    const correspondUser = !childId.toHexString ? childId : users.find(user => user.id == childId);
    return {
      id: get('id')(correspondUser),
      children: getChildren(users)(correspondUser),
      miners: correspondUser.miners,
      vipLevel: get('vipLevel')(correspondUser),
      nickname: get('nickname')(correspondUser),
      mobile: get('mobile')(correspondUser)
    }
  });
})

const creatTreeModel = (users) => {
  const getChildrenCurried = memoize(getChildren(users))
  const getResult = compose(map(u => {
    return {
      id: u.id, children: getChildrenCurried(u),
      miners: u.miners,
      vipLevel: get('vipLevel')(u),
      nickname: get('nickname')(u),
      mobile: get('mobile')(u)
    }
  }), filter(u => !u.invitor));
  // return { id: null, children: getResult(users), sumMiners: sumBy('miners')(users) }
  const model = { id: null, children: getResult(users), sumMiners: sumBy('miners')(users) }
  const treeRoot = global.tree.parse(model)
  treeRoot.walk({ strategy: 'post'}, n => {
    const sumMiners = getSumMinersV2(n)
    n.model.sumMiners = sumMiners
    n.model.underSumMiners = sumMiners - n.model.miners || 0
    n.model.underUserNums = n.all(identity).length - 1
  })
  return treeRoot
}

const treeHelper = {
  getChildren,
  getSumMiners,
  getParent,
  creatTreeModel,
  // 改成构造用户邀请层级
  init(db) {
    if (!global.tree) {
      global.tree = new TreeModel();
      global.db = db;
      db.User.find({}, 'id childUsers invitor miners nickname mobile vipLevel').populate('invitor childUsers').then(users => {
        // 树只能一次性生成别问为啥
        global.root = creatTreeModel(users)
        const memoizeGetVipLevel = memoize(getVipLevel)
        global.root.walk({ strategy: 'post' }, n => {
          const realVipLevel = memoizeGetVipLevel(n)
          updateModelVipLevel(n, realVipLevel)
        })
      }).then(() => {
        console.log('树初始化成功！');
      }).catch(console.error);
    }
  },
  initCategories(db) {
    if (!global.categoriesTree) {
      global.categoriesTree = new TreeModel();
      db.Category.find({}, 'id belongingCategory level').then(categories => {
        const getChildren = (c) => {
          const getResult = compose(map(getNode), filter(category => category.belongingCategory == c.id))
          return (getResult(categories));
        }
        function getNode(category) {
          return {
            id: category.id,
            belongingCategory: category.belongingCategory,
            children: getChildren(category),
          }
        };
        const getResult = compose(flatten, map(getNode), filter(b => b.level == 1))
        global.categoryRoot = global.categoriesTree.parse({ id: null, belongingCategory: null, children: getResult(categories) })
        return getResult(categories);
      }).then(() => {
        console.log('分类树初始化成功！')
      }).catch(console.error);
    }
  },
}

module.exports = treeHelper