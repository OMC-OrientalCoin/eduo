const { groupBy, mapValues, range, cloneDeep, maxBy, sum, get, identity, map, compose, filter, sumBy, max, every, pullAt, findIndex } = require('lodash/fp');
const { memoize } = require('lodash')
const { getDailyMinerBenefits, getNodeById } = require('./common')

const memoizeGetNodeById = memoize(getNodeById)
const getDailyMinerPoolBenefits = function (node) {
  // const current = node || global.root.first(node => node.model.id == this.id)
  const current = node || memoizeGetNodeById(this.id)
  if (current) {
    const nodes = current.children
    const getResult = sumBy(n => {
      // 烧伤机制
      const limitMiners = n.model.miners * get('config.mineBenefits.burning.limitPercent')(global) / 100
      const miners = this.miners >= limitMiners ? n.model.miners : this.miners
      const result = getDailyMinerBenefits(miners)
      if(process.env.NODE_ENV !== 'local') {
        console.log(`直推${n.model.mobile}的矿机是${miners}, 对应矿池收益是${result}`)
      }
      return result
    })
    if (this.inviteNum >= get('config.minerPoolBenefits.topLimit')(global)) {
      return getResult(nodes) * get('config.minerPoolBenefits.topPercent')(global) / 100
    } else if (this.inviteNum <= get('config.minerPoolBenefits.bottomLimit')(global)) {
      return getResult(nodes) * get('config.minerPoolBenefits.bottomPercent')(global) / 100
    }
  }
}


const getVipLevel = ((node) => {
  if (node) {
    const blockMiners = map('model.sumMiners')(node.children)
    const largestBlockMiners = max(blockMiners)
    const restBlockMiners = sum(blockMiners) - largestBlockMiners
    // const getLevel1Length = compose(get('length'), filter(level => level === 1), map(getVipLevel))
    const isEveryoneHasMiners = every(node => node.model.miners)
    if (restBlockMiners >= get('config.mineBenefits.vip6.limit')(global)) {
      return 6
    } else if (restBlockMiners >= get('config.mineBenefits.vip5.limit')(global)) {
      return 5
    } else if (restBlockMiners >= get('config.mineBenefits.vip4.limit')(global)) {
      return 4
    } else if (restBlockMiners >= get('config.mineBenefits.vip3.limit')(global)) {
      return 3
    } else if (isLevelLengthInTreeEnough(node)) {
      return 2
    } else if (node.children.length >= get('config.mineBenefits.vip1.limit')(global) && isEveryoneHasMiners(node.children)) {
      return 1
    } else {
      return 0
    }
  } else {
    return 0
  }
})

const memoizeGetVipLevel = memoize(getVipLevel, function (node) {
  // return `${node.model.id}_${node.model.vipLevel}_${node.children.length}_${node.model.sumMiners}`
  return `${get('model.id')(node)}_${get('model.vipLevel')(node)}_${get('children.length')(node)}_${get('model.sumMiners')(node)}`
})
/**
 * 遍历
 * @param {*} node 
 * @param {*} levelLimit 等级限制
 */
function isLevelLengthInTreeEnough(node, levelLimit = 1) {
  let level1Nodes = []
  const limit = get('config.mineBenefits.vip2.limit')(global)
  node.walk({ strategy: 'breadth' }, n => {
    // 排除自己
    if (node.model.id !== n.model.id) {
      if (level1Nodes.length >= limit) {
        return false
      } else if ((n.model.vipLevel || n.model.realVipLevel) === levelLimit) {
        level1Nodes.push(n)
      }
    }
  })
  return level1Nodes.length >= limit
}

/**
 * need binding user instance
 * @param {*} node 
 */
const getRealVipLevel = (function (node) {
  // const current = node || global.root.first(n => n.model.id == this.id)
  const current = node || memoizeGetNodeById(this.id)
  const level = memoizeGetVipLevel(current)
  return level
})

const memoizeGetMinerBenefits = memoize(getDailyMinerBenefits)

const getCurrentBenefits = (n) => {
  const level = memoizeGetVipLevel(n)
  const rate = get(`config.mineBenefits.vip${level}.percent`)(global) || 0
  const blockMiners = map('model.sumMiners')(n.children)
  const largestBlockMiners = max(blockMiners)
  const validMiners = level <= 2 ? sum(blockMiners) - largestBlockMiners : sum(blockMiners)
  let currentBenefits = memoizeGetMinerBenefits(validMiners) * rate / 100
  return currentBenefits
}

// const getVipBenefits = (function (node) {
//   const level = get('model.vipLevel')(node) || this.realVipLevel || memoizeGetVipLevel(node)
//   if (node && node.children) {
//     const blockMiners = map('model.sumMiners')(node.children)
//     const largestBlockMiners = max(blockMiners)
//     //平级和极差计算
//     const level2Filter = level <= 2 ? pullAt(findIndex(n => n.model.sumMiners === largestBlockMiners)(node.children)) : identity
//     // 这边烧伤机制
//     const rate = get(`config.mineBenefits.vip${level}.percent`)(global) || 0
//     const validMiners = level <= 2 ? sum(blockMiners) - largestBlockMiners : sum(blockMiners)
//     let currentBenefits = memoizeGetMinerBenefits(validMiners) * rate / 100
//     const getChildResultSumMiners = compose(sumBy(n => {
//       let currentBenefits = getCurrentBenefits(n)
//       const result = currentBenefits ? Math.max(currentBenefits - sumBy(getVipBenefits)(n.children), 0) : 0
//       return result
//     }), filter(n => memoizeGetVipLevel(n) < level), level2Filter)
//     let childBenefits = getChildResultSumMiners(node.children)
//     let v6Benefits = 0
//     // V6平级额外奖励
//     if (!global.isV6Equals) {
//       const isV6Equals = level === 6 && filter(n => memoizeGetVipLevel(n) === level)(node.children)
//       global.isV6Equals = isV6Equals
//     }
//     if (level === 6 && global.isV6Equals) {
//       v6Benefits = getDailyMinerBenefits(global.root.model.sumMiners) * 1 / 100
//     }
//     return Math.max(currentBenefits - childBenefits + v6Benefits, 0)
//   } else {
//     return 0
//   }
// })


// 每日下午4:30分结算
// const getVipBenefitsV2 = memoize(
  function getVipBenefitsV2(node) {
  const level = get('model.vipLevel')(node) || this.realVipLevel || memoizeGetVipLevel(node)
  if (node && node.children) {
    const blockMiners = map('model.sumMiners')(node.children)
    const largestBlockMiners = max(blockMiners)
    //扣掉一个最大区
    const level2FilterV2 = level <= 2 ? (n) => {
      if (!n.children.length) {
        return n
      }
      const largetBlockNodeId = compose(get('model.id'), maxBy('model.sumMiners'))(n.children)
      const nodeTree = cloneDeep(n)
      const node = getNodeById(largetBlockNodeId, nodeTree, 'breadth')
      node && node.drop()
      return node ? nodeTree : n
    } : identity
    // 这边烧伤机制
    const currentRate = get(`config.mineBenefits.vip${level}.percent`)(global) || 0
    // const validMiners = level <= 2 ? sum(blockMiners) - largestBlockMiners : sum(blockMiners)
    const validMiners = node.model.lowerSumMiners || 0
    // let currentBenefits = getDailyMinerBenefits(validMiners, false) * rate / 100
    let currentBenefits = getDailyMinerBenefits(validMiners, false)
    const getChildResultSumMiners = compose((userNode => {
      // 平级机制过滤
      const validChildNodes = userNode.all(n => (n.model.vipLevel || n.model.realVipLevel) < level)
      const getChildNodeSumBenefits = compose(sum, map(childNode => {
        const level = childNode.model.vipLevel || childNode.model.realVipLevel
        const childRate = get(`config.mineBenefits.vip${level}.percent`)(global) || 0
        const minusBenfits = currentBenefits * (currentRate - childRate) / 100
        if (process.env.NODE_ENV === 'local') {
          // console.log('等级', level, '的', userNode.model.mobile, '的收益', currentBenefits, '-等级', childNode.model.vipLevel || childNode.model.realVipLevel, '的', childNode.model.mobile, '的收益', minusBenfits, '=', currentBenefits - minusBenfits)
          console.log('等级', level, '的', userNode.model.mobile, '的收益', currentBenefits * currentRate / 100, '-等级', childNode.model.vipLevel || childNode.model.realVipLevel, '的', childNode.model.mobile, '的收益', currentBenefits * childRate / 100, '=', minusBenfits)
        }
        return Math.max((minusBenfits) || 0, 0)
      }))
      return validChildNodes.length === 0 ? 0 : getChildNodeSumBenefits(validChildNodes)
    }), level2FilterV2)
    let sumBenefits = currentBenefits ? getChildResultSumMiners(node) : currentBenefits
    return Math.max(sumBenefits, 0)
  } else {
    return 0
  }
}
// , (node) => {
//   return `${node.model.id}_${node.model.vipLevel}_${node.model.realVipLevel}_${node.children.length}_${node.model.sumMiners}_${node.model.lowerSumMiners}`
// })
//v2.5
function getVipBenefitsV2d5(node, parentLevel) {
  const level = get('model.vipLevel')(node) || this.realVipLevel || memoizeGetVipLevel(node)
  if (node && node.children) {
    //扣掉一个最大区
    const level2FilterV2 = identity
    // 这边烧伤机制
    const currentRate = get(`config.mineBenefits.vip${level || parentLevel}.percent`)(global) || 0
    const getChildResultSumMiners = compose((userNode => {
      // 平级机制过滤
      const validChildNodes = userNode.all(n => (n.model.vipLevel || n.model.realVipLevel) < level)
      const validMiners = level === 1 ? userNode.model.sumMiners - userNode.model.miners : userNode.model.sumMiners
      const getChildNodeSumBenefits = compose(sum, map(childNode => {
        const childLevel = childNode.model.vipLevel || childNode.model.realVipLevel
        const childRate = get(`config.mineBenefits.vip${childLevel || parentLevel}.percent`)(global) || 0
        const childBenefits = getVipBenefitsV2d5(childNode, level)
        const childValidMiners = childLevel === 1 ? childNode.model.sumMiners - childNode.model.miners : childNode.model.sumMiners
        // 等级为1时，也适用公式
        const minusBenfits = childLevel < 1 ? getDailyMinerBenefits(childValidMiners || 0, false) * currentRate / 100 :
          childBenefits * (currentRate - childRate) / 100
        if (process.env.NODE_ENV === 'local' && childLevel >= 1) {
          console.log(`${currentRate}%-${childRate}%*${childNode.model.mobile}的团队极差${childBenefits}。得`, '等级', childLevel, '的', childNode.model.mobile, '的收益', minusBenfits)
        }else if(process.env.NODE_ENV === 'local' && childLevel === 0) {
          console.log(`等级${childNode.model.vipLevel || childNode.model.realVipLevel}的${childNode.model.mobile}计算结果是${currentRate}% * ${childNode.model.sumMiners}台的收益=${minusBenfits}`)
        }
        return Math.max((minusBenfits) || 0, 0)
      }))
      return level < 2 ? getDailyMinerBenefits(validMiners || 0, false) * currentRate / 100 :
        getChildNodeSumBenefits(validChildNodes)
    }), level2FilterV2)
    let sumBenefits = getChildResultSumMiners(node)
    return Math.max(sumBenefits, 0)
  } else {
    return 0
  }
}

function getVipBenefitsV3(node) {
  const level = get('model.vipLevel')(node) || this.realVipLevel || memoizeGetVipLevel(node)
  if (node && node.children) {
    //扣掉一个最大区
    const level2FilterV2 = identity
    // 这边烧伤机制
    const currentRate = (get(`config.mineBenefits.vip${level}.percent`)(global) || 0) / 100
    const currentBenefits = getDailyMinerBenefits(node.model.sumMiners - node.model.miners, false) * currentRate
    const getChildResultSumMiners = compose((userNode => {
      // 平级机制过滤
      // const validMiners = level === 1 ? userNode.model.sumMiners - userNode.model.miners : userNode.model.sumMiners
      // 这边适用于lv1的情况，对于v0，算总的
      const getChildMiners = compose(sumBy('model.miners'), filter(n => (n.model.vipLevel || n.model.realVipLevel) === 0))

      // 适用2-3级,对应子1-2级
      const getChildNodeSumBenefits = compose(sum, map(childNode => {
        const childLevel = childNode.model.vipLevel || childNode.model.realVipLevel
        const childRate = (get(`config.mineBenefits.vip${childLevel || level}.percent`)(global) || 0) / 100
        const childValidMiners = childLevel >= 1 ? childNode.model.lowerSumMiners : childNode.model.sumMiners
        // 等级为1时，也适用公式
        const minusBenfits = childRate * getDailyMinerBenefits(childValidMiners, false)
        if (process.env.NODE_ENV === 'local') {
          console.log(`等级${childNode.model.vipLevel || childNode.model.realVipLevel}的${childNode.model.mobile}计算结果是${childRate} * ${childValidMiners}台的收益=${minusBenfits}`)
        }
        return Math.max((minusBenfits) || 0, 0)
      }), filter(childNode => (childNode.model.vipLevel || childNode.model.realVipLevel)))

      // 适用4级以上
      const getLevel4UpperSumBenefits = (userNode) => {
        const startLevel = 3
        const validLevels = range(startLevel, userNode.model.vipLevel || userNode.model.realVipLevel)
        // 这里groupBy一次看看效果
        const getLevelGrouped = compose(mapValues(sumBy('model.lowerSumMiners')), groupBy(n => n.model.vipLevel || n.model.realVipLevel))
        userNode.model.groupedLowerMiners = getLevelGrouped(userNode.all(n => (n.model.vipLevel || n.model.realVipLevel) < (userNode.model.vipLevel || userNode.model.realVipLevel)))
        const getSumMinusBenefits = sumBy(validLevel => {
          const benefitRate = (get(`config.mineBenefits.vip${validLevel}.percent`)(global) || 0) / 100
          const sumLowerMiners = userNode.model.groupedLowerMiners[validLevel] || 0
          const result = benefitRate * sumLowerMiners
          if (process.env.NODE_ENV === 'local') {
            console.log(`等级${validLevel}。计算结果是${benefitRate} * ${sumLowerMiners}台的收益=${result}`)
          }
          return result
        })
        return getSumMinusBenefits(validLevels)
      }

      return level === 1 ? currentRate * getDailyMinerBenefits(getChildMiners(userNode.children) || 0, false) :
        level <= 3 ? currentBenefits - getChildNodeSumBenefits(userNode.children) :
          currentBenefits - getLevel4UpperSumBenefits(userNode)
    }), level2FilterV2)
    return Math.max(!level ? 0 : getChildResultSumMiners(node), 0)
  } else {
    return 0
  }
}

const userBenefits = {
  getDailyMinerPoolBenefits,
  getVipLevel: memoizeGetVipLevel,
  getVipBenefits: getVipBenefitsV3,
  // getVipBenefits: memoize(getVipBenefitsV2, (node) => {
  //   return `${node.model.id}_${node.model.vipLevel}_${node.model.realVipLevel}_${node.children.length}_${node.model.sumMiners}_${node.model.lowerSumMiners}`
  // // }),
  getRealVipLevel,
}

module.exports = userBenefits