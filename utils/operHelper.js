const operHelper = {

  // 删除父文档的引用
  deleteParentRef: (model, queryOption, additionOption) => {
    return model.updateOne(queryOption, { $pull: additionOption }).exec();
  },
}

module.exports = operHelper;