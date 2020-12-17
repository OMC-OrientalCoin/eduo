const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Config = new Schema({
  btcAddress: {
    type: String,
  },
  eosAddress: {
    type: String,
  },
  ethAddress: {
    type: String,
  },
  serviceCharge: {
    transfer: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    merchant: {
      type: Number,
      min: 0,
      default: 0,
      // default: 2,
    },
    user: {
      type: Number,
      min: 0,
      default: 0,
    },
    merchantBottom: {
      type: Number,
      min: 0,
      default: 2,
    },
    merchantTop: {
      type: Number,
      min: 0,
      default: 5000,
    },
    userBottom: {
      type: Number,
      min: 0,
      default: 0,
    },
    userTop: {
      type: Number,
      min: 0,
      // default: 5000,
      default: 9999999999999,
    }
  },
  ticker: {
    btc_cny: {
      type: Number,
      min: 0,
      default: 0.2,
    }, 
    eth_cny: {
      type: Number,
      min: 0,
      default: 0.2,
    },
    eos_cny: {
      type: Number,
      min: 0,
      default: 0.2,
    },
    // E豆対人民币
    cny_edou: {
      type: Number,
      min: 0,
    },
    // EDOU对人民币
    cny_edouCoin: {
      type: Number,
      min: 0,
      default: 0,
    },
    // 每BTC=?EDOU
    edou_btc: {
      type: Number,
      min: 0,
      default: 0,
    },
    // 每ETH=?EDOU
    edou_eth: {
      type: Number,
      min: 0,
      default: 0,
    }
  },
  invitorBonus: {
    type: Number,
    min: 0,
    default: 0,
    // default: 50,
  },
  signInLimit: {
    type: Number,
    min: 0,
    default: 1,
  },
  signInBonus: {
    type: Number,
    min: 0,
    default: 30
  },
  banner: {
    bannerId: {
      ref: 'Category',
      type: Schema.Types.ObjectId,
    },
    bannerUrl: {
      type: String,
    },
    categoryBar: [{
      category: {
        type: Schema.Types.ObjectId,
        ref: 'Category'
      },
      imageUrl: String,
    }]
  },
  shopping: {
    deliveryDays: {
      type: Number,
      min: 0,
      default: 10,
    },
    cancelTime: {
      type: Number,
      min: 0,
      default: 60,
    }
  },
  // 计算最后的过渡积分结果
  cnyBonus: {
    type: Number,
    default: 21,
    min: 0,
  },
  // 矿机收益
  minerBenefits: {
    uccFreezeBase: {
      type: Number,
      min: 0,
      default: 10500
    },
    // %
    releasePercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0.2
    }
  },
  // 矿池收益
  minerPoolBenefits: {
    //10%
    bottomLimit: {
      type: Number,
      min: 0,
      default: 2
    },
    // %
    bottomPercent: {
      type: Number,
      min: 0,
      default: 10,
    },
    //20%
    topLimit: {
      type: Number,
      min: 0,
      default: 3
    },
    topPercent: {
      type: Number,
      min: 0,
      default: 20,
    }
  },
  // 矿场收益
  vips: {
    vip1: {
      name: String, // 价格
      limit: {
        type: Number,
        min: 0,
        default: 5,
      },
      percent: {
        type: Number,
        min: 0,
        default: 10
      }
    },
    vip2: {
      name: String,
      limit: {
        type: Number,
        min: 0,
        default: 10,
      },
      percent: {
        type: Number,
        min: 0,
        default: 15
      }
    },
    vip3: {
      name: String,
      limit: {
        type: Number,
        default: 300,
        min: 0,
      },
      percent: {
        type: Number,
        min: 0,
        default: 20,
      }
    },
    vip4: {
      name: String,
      limit: {
        type: Number,
        default: 800,
        min: 0,
      },
      percent: {
        type: Number,
        min: 0,
        default: 25,
      }
    },
    vip5: {
      name: String,
      limit: {
        type: Number,
        default: 1500,
        min: 0,
      },
      percent: {
        type: Number,
        min: 0,
        default: 30,
      }
    },
    vip6: {
      name: String,
      limit: {
        type: Number,
        default: 3000,
        min: 0,
      },
      percent: {
        type: Number,
        min: 0,
        default: 35,
      },
    },
    vip7: {
      name: String,
      limit: {
        type: Number,
        default: 3000,
        min: 0,
      },
      // X%打赏到用户
      percent: {
        type: Number,
        min: 0,
        default: 35,
      }
    },
    burning: {
      // 最多可买
      // TODO 最多可买限制，强制并优先于产品内设置
      purchaseLimit: {
        type: Number,
        min: 0,
        default: 30,
      },
      // 百分比的矿机
      limitPercent: {
        type: Number,
        min: 0,
        default: 33,
      },
      // 一代的x%
      benefitPercent: {
        type: Number,
        min: 0,
        default: 10,
      }
    }
  },
  wallet: {
    uccVipFreezeReleasePercent: {
      type: Number,
      default: 5,
      min: 0
    },
    uccFreezeRelease: {
      type: Number,
      default: 5,
      min: 0,
    },
    uccTransferServiceCharge: {
      type: Number,
      default: 3,
      min: 0
    },
    equityBenefits: {
      dailyMinerPool: {
        type: Number,
        default: 10,
        min: 0,
      },
      dailyMine: {
        type: Number,
        default: 10,
        min: 0,
      },
      weeklyV6Dividend: {
        type: Number,
        default: 10,
        min: 0
      }
    }
  },
  version: String,
  // 版本更新 内容
  updateContent: String,
  // 客服QQ
  customerServiceQQ: String,
  // 客服电话
  customerServiceMobile: String,
  isVideoAudit: {
    type: Boolean,
    default: true,
  },
  isBonusExtractOutAudit: {
    type: Boolean,
    default: true,
  },
  isLegalExtractOutAudit: {
    type: Boolean,
    default: true,
  },
  isEdouExtractOutAudit: {
    type: Boolean,
    default: true,
  },
  isKycAudit: {
    type: Boolean,
    default: true,
  },
  donate: {
    // x%打赏金额到平台
    toPlatform: {
      type: Number,
      default: 0,
      min: 0
    },
    // x%打赏金额到用户
    toUser: {
      type: Number,
      default: 0,
    },
    // x%打赏金额到用户
    fluctuation: {
      type: Number,
      default: 0,
    },
    invitorBonusPercent: {
      type: Number,
      default: 0
    },
  },
  // 每次用户打赏，涨价用户所打赏金额相应百分比fluctuation的x分之一
  upRules: {
    type: Number,
    default: 0,
  },
  // 每次用户提现，降价用户所提现金额相应百分比(1)的x分之一
  downRules: {
    type: Number,
    default: 0,
  },
  // X%金额价格波动
  extractOutDownPercent: {
    type: Number,
    default: 100
  },
  lottery: {
    // 每日抽奖最多每天可抽取 x次
    times: {
      type: Number,
      default: 0,
    },
    // 每次抽奖需要消耗xE豆
    limit: {
      type: Number,
      default: 0,
    },
    // 每次奖励X
    min: {
      type: Number,
      default: 0,
    },
    // 每次奖励 到 X
    max: {
      type: Number,
      default: 0,
    },
    // 用户每次抽奖获得E豆，降价用户所获得E豆
    downRuleA: {
      type: Number,
      default: 0,
    },
    // 的 X 分之一
    downRuleB: {
      type: Number,
      default: 0
    }
  },
  freeze: [{
    // 需要x个E豆进行锁仓
    limit: {
      type: Number,
      default: 0,
    },
    // 期限 X 天
    days: {
      type: Number,
      default: 0,
    },
    // 每日生息 X %
    rate: {
      type: Number,
      default: 0,
    },
    dividend: [Number]
  }],
  thumbup: {
    // 每日点赞赠送
    amount: {
      type: Number,
      default: 0,
    },
    // 每天最多
    times: {
      type: Number,
      default: 0,
    }
  },
  comment: {
    // 每日评论赠送
    amount: {
      type: Number,
      default: 0,
    },
    // 每天最多
    times: {
      type: Number,
      default: 0,
    }
  },
  watchVideo: {
    // 每日视频赠送 X
    amount: {
      type: Number,
      default: 0,
    },
    // 每天最多
    times: {
      type: Number,
      default: 0,
    },
    videoLimit: {
      type: Number,
      default: 0,
    },
    ad: {
      type: String,
    },
    // 看x 秒秒以上才能获得单日奖励
    watchLimit: {
      type: Number,
      default: 0,
    },
    // 奖励 X E豆
    singleAmount: {
      type: Number,
      default: 0,
    }
  },
  // 协议
  protocolContent: {
    cn: String,
    en: String,
    kr: String,
  },
  // 新人EDOU提现专属奖励X元
  newerEdouAvailableAmount: {
    type: Number,
    default: 0,
  },
  // 总用户打赏奖池
  totalBonusPool: {
    type: Number,
    default: 0,
  },
  // 每达到x的奖池时进行方法，此为发放的总金额, 需* 对应vip比例
  bonusReleaseThreshold: {
    type: Number,
    min: 0,
    default: 0,
  },
  // 支付宝收款码二维码
  alipayQrCode: String,
  tenpayQrCode: String,
  downloadQrCode: String,
  // 标识用
  identity: {
    type: String
  }
})

Config.statics.getGlobalConfig = async function getGlobalConfig() {
  return this.findOne({ identity: 'bellchet58' })
}

module.exports = Config