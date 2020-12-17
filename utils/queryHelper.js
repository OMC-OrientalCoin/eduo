const queryHelper = {

  // 后端分页的查询
  // ([records, count])
  findAndCount: (model, queryOption, additionOption, fieldsSelect) => {
    return Promise.all([model.find(queryOption, fieldsSelect || null, additionOption), model.countDocuments(queryOption)]);
  },
}

module.exports = queryHelper;